-- ============================================================
-- 0005 - RPC e trigger
--
-- COSA: il trigger che popola profiles/groups alla registrazione e le RPC
--       che incapsulano le operazioni che la sola RLS non sa esprimere
--       (invitare, accettare, spostare una recensione, collegare a Google).
-- PERCHE' RPC e non logica nel client: ognuna di queste operazioni tocca
--       piu' tabelle e deve essere atomica. Farlo dal client significherebbe
--       piu' round trip non transazionali e, per l'accettazione di un invito,
--       un permesso di insert su group_members che nessuno deve avere.
--
-- Due trappole gia' risolte, da NON reintrodurre:
--  1. con "set search_path = ''" anche i TIPI vanno qualificati: si scrive
--     "public.citext", non "citext", altrimenti la funzione fallisce a
--     runtime con "type citext does not exist".
--  2. assegnare il risultato di un CASE a una colonna enum richiede un cast
--     esplicito: "(case ... end)::public.invitation_status". Senza cast
--     Postgres deduce "text" e rifiuta l'update.
-- ============================================================

-- ------------------------------------------------------------
-- handle_new_user: eseguito a ogni riga inserita in auth.users.
--
-- Fa tre cose in una transazione: crea il profilo, crea il gruppo personale
-- "I miei posti" con l'utente come owner, e aggancia gli inviti che erano
-- stati emessi verso la sua email prima che si registrasse.
--
-- Il blocco exception NON e' decorativo: se lo username scelto in fase di
-- registrazione e' occupato o malformato, il profilo viene creato con
-- username NULL invece di far fallire la registrazione. Un signup che
-- fallisce per un dettaglio recuperabile lascia un utente in auth.users
-- senza profilo, cioe' un account rotto.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_group_id uuid;
  v_username public.citext := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
begin
  begin
    insert into public.profiles (id, username, display_name)
    values (new.id, v_username,
            coalesce(new.raw_user_meta_data ->> 'full_name',
                     new.raw_user_meta_data ->> 'name'));
  exception when unique_violation or check_violation then
    insert into public.profiles (id, username, display_name)
    values (new.id, null, new.raw_user_meta_data ->> 'full_name');
  end;

  insert into public.groups (name, owner_id, is_personal)
  values ('I miei posti', new.id, true)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, new.id, 'owner');

  update public.group_invitations
     set invitee_id = new.id
   where invitee_id is null and invitee_email = new.email and status = 'pending';

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- username_available: usata dall'onboarding per il controllo in tempo reale.
-- Verifica formato E disponibilita': il client non deve duplicare la regex.
-- ------------------------------------------------------------
create or replace function public.username_available(p_username citext)
returns boolean language sql security definer stable set search_path = ''
as $$ select p_username ~ '^[a-z0-9](?:[a-z0-9_.]{1,18}[a-z0-9])$'
        and not exists (select 1 from public.profiles where username = p_username); $$;

-- ------------------------------------------------------------
-- claim_username: rivendica lo username e chiude l'onboarding.
-- Serve dopo l'accesso con Google, dove lo username non esiste.
-- Solleva 23505 (unique_violation) sia per "occupato" sia per "malformato":
-- il client mostra lo stesso messaggio nei due casi.
-- ------------------------------------------------------------
create or replace function public.claim_username(p_username citext, p_display_name text default null)
returns public.profiles language plpgsql security definer set search_path = ''
as $$
declare v_row public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.username_available(p_username) then
    raise exception 'username non disponibile' using errcode = '23505';
  end if;
  update public.profiles
     set username = p_username,
         display_name = coalesce(p_display_name, display_name),
         onboarding_completed = true, updated_at = now()
   where id = auth.uid()
  returning * into v_row;
  return v_row;
end $$;

-- ------------------------------------------------------------
-- search_people: ricerca di persone da invitare.
--
-- Deliberatamente ristretta: prefisso di username da almeno 3 caratteri,
-- oppure indirizzo email ESATTO. Un match parziale sull'email trasformerebbe
-- questa RPC in un estrattore della rubrica di tutti gli iscritti.
-- ------------------------------------------------------------
create or replace function public.search_people(p_query text)
returns table (id uuid, username public.citext, display_name text, avatar_path text)
language sql security definer stable set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path
    from public.profiles p
   where p.username is not null and p.id <> auth.uid()
     and ( (char_length(btrim(p_query)) >= 3 and p.username like btrim(p_query) || '%')
        or p.id = (select u.id from auth.users u where u.email = btrim(lower(p_query))) )
   order by p.username limit 20;
$$;

-- ------------------------------------------------------------
-- invite_to_group: accetta uno username, una email di utente esistente o una
-- email non registrata (invito "al buio", agganciato al signup dal trigger).
-- ------------------------------------------------------------
create or replace function public.invite_to_group(p_group_id uuid, p_identifier text)
returns public.group_invitations language plpgsql security definer set search_path = ''
as $$
declare v_invitee uuid; v_email public.citext; v_row public.group_invitations;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'solo gli amministratori possono invitare' using errcode = '42501'; end if;
  if exists (select 1 from public.groups where id = p_group_id and is_personal) then
    raise exception 'non si puo invitare in un gruppo personale' using errcode = '22023'; end if;

  select id into v_invitee from public.profiles where username = btrim(p_identifier);
  if v_invitee is null then
    select u.id, u.email::public.citext into v_invitee, v_email
      from auth.users u where u.email = btrim(lower(p_identifier));
  end if;
  if v_invitee is null and position('@' in p_identifier) > 1 then
    v_email := btrim(lower(p_identifier)); end if;
  if v_invitee is null and v_email is null then
    raise exception 'utente non trovato' using errcode = 'P0002'; end if;
  if v_invitee is not null and exists (select 1 from public.group_members
       where group_id = p_group_id and user_id = v_invitee) then
    raise exception 'utente gia nel gruppo' using errcode = '23505'; end if;

  insert into public.group_invitations (group_id, inviter_id, invitee_id, invitee_email)
  values (p_group_id, auth.uid(), v_invitee, v_email)
  returning * into v_row;
  return v_row;
end $$;

-- ------------------------------------------------------------
-- respond_to_invitation: unico modo per entrare in un gruppo.
--
-- "for update" blocca la riga: due tap sul pulsante non creano due membri.
-- Il controllo di appartenenza dell'invito confronta sia invitee_id sia
-- invitee_email, perche' un invito emesso verso una email puo' essere
-- accettato da chi si registra dopo con quella email.
-- ------------------------------------------------------------
create or replace function public.respond_to_invitation(p_token uuid, p_accept boolean)
returns public.group_invitations language plpgsql security definer set search_path = ''
as $$
declare v_inv public.group_invitations; v_myuser uuid := auth.uid(); v_myemail public.citext;
begin
  if v_myuser is null then raise exception 'not authenticated'; end if;
  select u.email::public.citext into v_myemail from auth.users u where u.id = v_myuser;

  select * into v_inv from public.group_invitations where token = p_token for update;
  if v_inv.id is null then raise exception 'invito inesistente' using errcode = 'P0002'; end if;
  if v_inv.status <> 'pending' then raise exception 'invito non piu valido' using errcode = '22023'; end if;
  if v_inv.expires_at < now() then
    update public.group_invitations set status = 'expired'::public.invitation_status where id = v_inv.id;
    raise exception 'invito scaduto' using errcode = '22023'; end if;
  if v_inv.invitee_id is distinct from v_myuser
     and v_inv.invitee_email is distinct from v_myemail then
    raise exception 'invito non tuo' using errcode = '42501'; end if;

  if p_accept then
    insert into public.group_members (group_id, user_id, role)
    values (v_inv.group_id, v_myuser, 'member') on conflict do nothing;
  end if;

  -- Il cast a ::public.invitation_status e' obbligatorio: il CASE produce
  -- text e senza cast l'update viene rifiutato.
  update public.group_invitations
     set status = (case when p_accept then 'accepted' else 'declined' end)::public.invitation_status,
         invitee_id = v_myuser, responded_at = now()
   where id = v_inv.id returning * into v_inv;
  return v_inv;
end $$;

-- ------------------------------------------------------------
-- move_review: sposta una propria recensione in un altro gruppo.
--
-- Inserisce in group_places il luogo nel gruppo di destinazione prima di
-- spostare la recensione: senza, la FK composita rifiuterebbe l'update.
-- ------------------------------------------------------------
create or replace function public.move_review(p_review_id uuid, p_target_group_id uuid)
returns public.reviews language plpgsql security definer set search_path = ''
as $$
declare v_rev public.reviews;
begin
  select * into v_rev from public.reviews where id = p_review_id for update;
  if v_rev.id is null then raise exception 'recensione inesistente' using errcode = 'P0002'; end if;
  if v_rev.author_id <> auth.uid() then
    raise exception 'puoi spostare solo le tue recensioni' using errcode = '42501'; end if;
  if not public.is_group_member(p_target_group_id) then
    raise exception 'non fai parte del gruppo di destinazione' using errcode = '42501'; end if;
  if exists (select 1 from public.reviews where group_id = p_target_group_id
               and place_id = v_rev.place_id and author_id = auth.uid()) then
    raise exception 'hai gia una recensione di questo luogo in quel gruppo' using errcode = '23505'; end if;

  insert into public.group_places (group_id, place_id, added_by)
  values (p_target_group_id, v_rev.place_id, auth.uid()) on conflict do nothing;

  update public.reviews set group_id = p_target_group_id, updated_at = now()
   where id = p_review_id returning * into v_rev;
  return v_rev;
end $$;

-- ------------------------------------------------------------
-- link_place_to_google: collega un luogo inserito a mano alla sua scheda
-- Google. p_overwrite = false collega senza toccare nome e indirizzo scritti
-- dall'utente e lascia official_override_pending = true, cosi' l'app puo'
-- riproporre la sostituzione piu' tardi. Le coordinate vengono invece sempre
-- aggiornate, perche' servono alla mappa e non sono un dato "scritto".
-- ------------------------------------------------------------
create or replace function public.link_place_to_google(
  p_place_id uuid, p_google_place_id text, p_overwrite boolean,
  p_official_name text default null, p_official_address text default null,
  p_lat double precision default null, p_lng double precision default null
) returns public.places language plpgsql security definer set search_path = ''
as $$
declare v_place public.places;
begin
  if not (public.can_read_place(p_place_id)
          or exists (select 1 from public.places where id = p_place_id and created_by = auth.uid())) then
    raise exception 'non autorizzato' using errcode = '42501'; end if;

  update public.places
     set google_place_id = p_google_place_id, google_linked_at = now(), source = 'google',
         name    = case when p_overwrite then coalesce(p_official_name, name) else name end,
         address = case when p_overwrite then coalesce(p_official_address, address) else address end,
         lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         coords_refreshed_at = case when p_lat is not null then now() else coords_refreshed_at end,
         official_override_pending = not p_overwrite, updated_at = now()
   where id = p_place_id returning * into v_place;
  return v_place;
end $$;

-- Solo authenticated: anon non deve poter chiamare nessuna di queste.
-- handle_new_user non e' nella lista perche' e' invocata dal trigger.
grant execute on function
  public.username_available(citext), public.claim_username(citext, text),
  public.search_people(text), public.invite_to_group(uuid, text),
  public.respond_to_invitation(uuid, boolean), public.move_review(uuid, uuid),
  public.link_place_to_google(uuid, text, boolean, text, text, double precision, double precision)
to authenticated;
