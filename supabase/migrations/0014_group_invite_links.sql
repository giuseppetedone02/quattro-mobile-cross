-- ============================================================
-- 0014 - Link/codice di invito per gruppo
--
-- COSA: un codice condivisibile (es. "7K4QXB2P") che chiunque puo' usare per
--       entrare in un gruppo, alternativo all'invito nominale di
--       invite_to_group (che richiede di conoscere username o email di chi
--       si invita). Il codice vive su groups.invite_code, generato su
--       richiesta da un amministratore e leggibile SOLO tramite le RPC
--       sotto: nessuna policy di select su "groups" lo espone, quindi un
--       utente esterno non puo' scoprirlo sfogliando la tabella -- deve
--       riceverlo (link o testo) da chi lo condivide.
-- PERCHE' non riusare group_invitations: quella tabella modella un invito a
--       una persona specifica (invitee_id/invitee_email, vincolo
--       invitee_identified). Il link e' l'opposto: nessun destinatario
--       fissato in anticipo, e lo stesso codice puo' essere usato da piu'
--       persone finche' non viene rigenerato. E' un concetto diverso e
--       merita la propria colonna e le proprie RPC.
-- ============================================================

alter table public.groups
  add column invite_code public.citext unique;

comment on column public.groups.invite_code is
  'Codice di invito condivisibile. NULL finche nessun admin lo genera. '
  'Leggibile solo via RPC (get_or_create_group_invite_code): nessuna policy '
  'di select su "groups" lo espone.';

-- ------------------------------------------------------------
-- _generate_invite_code: 8 caratteri, alfabeto senza 0/O/1/I/L per evitare
-- ambiguita a chi lo detta o lo trascrive a mano. Non e' STABLE: chiama
-- random(), quindi e' volatile per definizione -- dichiararla stable
-- sarebbe scorretto anche se plpgsql non lo impedisce.
-- ------------------------------------------------------------
create or replace function public._generate_invite_code()
returns public.citext language plpgsql set search_path = ''
as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text := '';
  i int;
begin
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_code::public.citext;
end $$;

-- ------------------------------------------------------------
-- get_or_create_group_invite_code: solo amministratori. Idempotente: se il
-- gruppo ha gia' un codice lo restituisce, altrimenti ne genera uno (con
-- qualche tentativo in caso di collisione, statisticamente irrilevante su
-- 32^8 combinazioni).
-- ------------------------------------------------------------
create or replace function public.get_or_create_group_invite_code(p_group_id uuid)
returns public.citext language plpgsql security definer set search_path = ''
as $$
declare
  v_code public.citext;
  v_is_personal boolean;
  v_attempt int := 0;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'solo gli amministratori possono generare un link di invito' using errcode = '42501';
  end if;

  select is_personal, invite_code into v_is_personal, v_code
    from public.groups where id = p_group_id;
  if v_is_personal is null then
    raise exception 'gruppo inesistente' using errcode = 'P0002';
  end if;
  if v_is_personal then
    raise exception 'non si puo invitare in un gruppo personale' using errcode = '22023';
  end if;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := public._generate_invite_code();
    begin
      update public.groups set invite_code = v_code where id = p_group_id;
      return v_code;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'non sono riuscito a generare un codice univoco, riprova' using errcode = '55000';
      end if;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------
-- regenerate_group_invite_code: revoca il codice esistente (chi lo aveva
-- copiato prima smette di funzionare) e ne emette uno nuovo. Solo admin.
-- ------------------------------------------------------------
create or replace function public.regenerate_group_invite_code(p_group_id uuid)
returns public.citext language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'solo gli amministratori possono rigenerare il link di invito' using errcode = '42501';
  end if;
  update public.groups set invite_code = null where id = p_group_id;
  return public.get_or_create_group_invite_code(p_group_id);
end $$;

-- ------------------------------------------------------------
-- join_group_via_code: chiunque autenticato puo' chiamarla. Se il codice e'
-- valido, entra come member (idempotente se e' gia' dentro, "on conflict do
-- nothing"). E' l'unico modo in cui questo codice produce un effetto:
-- nessuna policy di insert su group_members lo consente direttamente.
-- ------------------------------------------------------------
create or replace function public.join_group_via_code(p_code text)
returns public.groups language plpgsql security definer set search_path = ''
as $$
declare
  v_group public.groups;
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_group from public.groups where invite_code = btrim(p_code)::public.citext;
  if v_group.id is null or v_group.is_personal then
    raise exception 'codice non valido' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_me, 'member')
  on conflict do nothing;

  return v_group;
end $$;

revoke execute on function public._generate_invite_code() from anon, authenticated;
grant execute on function
  public.get_or_create_group_invite_code(uuid),
  public.regenerate_group_invite_code(uuid),
  public.join_group_via_code(text)
to authenticated;
