-- ============================================================
-- 0004 - Row Level Security: policy e vista aggregata
--
-- COSA: attiva la RLS su tutte le tabelle di dominio e definisce le policy.
-- PERCHE' la RLS e' l'unico confine di sicurezza dell'app: il client mobile
--       parla con PostgREST usando la chiave pubblicabile, che e' dentro il
--       bundle e quindi pubblica. Chiunque puo' emettere qualunque query.
--       Cio' che un utente vede lo decidono queste policy, non le schermate.
--
-- Due dettagli non ovvi:
--  - "(select auth.uid())" invece di "auth.uid()": la forma con subquery
--    viene valutata una volta e messa in cache dal planner (InitPlan), la
--    forma nuda una volta per riga.
--  - la vista v_place_scores usa "security_invoker = on": senza, la vista
--    girerebbe con i privilegi del proprietario e le medie di TUTTI i gruppi
--    sarebbero leggibili da chiunque, aggirando la RLS di reviews. E' una
--    fuga di dati silenziosa, perche' la vista funziona comunque.
-- ============================================================

alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.group_invitations enable row level security;
alter table public.places            enable row level security;
alter table public.group_places      enable row level security;
alter table public.reviews           enable row level security;
alter table public.review_photos     enable row level security;

-- ---------- profiles ----------
-- Il proprio profilo si legge sempre; quello degli altri solo se si condivide
-- almeno un gruppo. Impedisce l'enumerazione degli utenti registrati.
create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_read_groupmates on public.profiles for select to authenticated
  using (exists (select 1 from public.group_members gm
                  where gm.user_id = public.profiles.id
                    and gm.group_id in (select public.my_group_ids())));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- groups ----------
-- is_personal = false in insert: il gruppo personale lo crea solo il trigger
-- handle_new_user, cosi' l'indice unico parziale non viene mai forzato.
create policy groups_read on public.groups for select to authenticated
  using (id in (select public.my_group_ids()));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = (select auth.uid()) and is_personal = false);
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = (select auth.uid()) and is_personal = false);

-- ---------- group_members ----------
-- Nessuno si autoiscrive: l'insert richiede di essere gia' amministratore.
-- L'ingresso di un nuovo membro passa solo da respond_to_invitation.
-- Il delete e' concesso anche a se stessi: e' il "lascia il gruppo".
create policy members_read on public.group_members for select to authenticated
  using (group_id in (select public.my_group_ids()));
create policy members_insert_admin on public.group_members for insert to authenticated
  with check (public.is_group_admin(group_id));
create policy members_delete on public.group_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_group_admin(group_id));
create policy members_update_role on public.group_members for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

-- ---------- group_invitations ----------
-- L'invitato legge il proprio invito, l'invitante il suo, l'amministratore
-- quelli del gruppo. Il token non e' quindi enumerabile da terzi.
create policy invites_read on public.group_invitations for select to authenticated
  using (invitee_id = (select auth.uid()) or inviter_id = (select auth.uid())
         or public.is_group_admin(group_id));
create policy invites_insert on public.group_invitations for insert to authenticated
  with check (public.is_group_admin(group_id) and inviter_id = (select auth.uid()));
create policy invites_revoke on public.group_invitations for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id) and status in ('revoked','pending'));

-- ---------- places ----------
-- I luoghi sono condivisi fra gruppi: si leggono se li si e' creati o se si
-- appartiene a un gruppo che li contiene. L'update e' concesso a tutto il
-- gruppo perche' i dati del luogo (indirizzo, cucina, note) sono collaborativi.
create policy places_read on public.places for select to authenticated
  using (created_by = (select auth.uid()) or public.can_read_place(id));
create policy places_insert on public.places for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy places_update on public.places for update to authenticated
  using (created_by = (select auth.uid()) or public.can_read_place(id))
  with check (created_by = (select auth.uid()) or public.can_read_place(id));

-- ---------- group_places ----------
create policy group_places_read on public.group_places for select to authenticated
  using (group_id in (select public.my_group_ids()));
create policy group_places_insert on public.group_places for insert to authenticated
  with check (public.is_group_member(group_id) and added_by = (select auth.uid()));
create policy group_places_delete on public.group_places for delete to authenticated
  using (added_by = (select auth.uid()) or public.is_group_admin(group_id));

-- ---------- reviews ----------
-- Si leggono tutte le recensioni dei propri gruppi, si scrive solo la propria.
create policy reviews_read on public.reviews for select to authenticated
  using (group_id in (select public.my_group_ids()));
create policy reviews_insert on public.reviews for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_group_member(group_id));
create policy reviews_update on public.reviews for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.is_group_member(group_id));
create policy reviews_delete on public.reviews for delete to authenticated
  using (author_id = (select auth.uid()));

-- ---------- review_photos ----------
create policy review_photos_read on public.review_photos for select to authenticated
  using (exists (select 1 from public.reviews r
                  where r.id = review_id and r.group_id in (select public.my_group_ids())));
create policy review_photos_write on public.review_photos for all to authenticated
  using (exists (select 1 from public.reviews r
                  where r.id = review_id and r.author_id = (select auth.uid())))
  with check (exists (select 1 from public.reviews r
                  where r.id = review_id and r.author_id = (select auth.uid())));

-- ---------- Vista delle medie per gruppo/luogo ----------
-- security_invoker = on: la vista eredita la RLS di chi la interroga.
create view public.v_place_scores with (security_invoker = on) as
select
  r.group_id,
  r.place_id,
  count(*)                        as review_count,
  round(avg(r.score_location), 1) as avg_location,
  round(avg(r.score_service),  1) as avg_service,
  round(avg(r.score_menu),     1) as avg_menu,
  round(avg(r.score_value),    1) as avg_value,
  round(avg(r.overall),        2) as avg_overall,
  -- nullif evita la divisione per zero quando party_size non e' stato indicato
  round(avg(r.bill_total_cents::numeric / nullif(r.party_size, 0)))::int
                                  as avg_cost_per_person_cents,
  max(r.created_at)               as last_review_at
from public.reviews r
group by r.group_id, r.place_id;

grant select on public.v_place_scores to authenticated;
