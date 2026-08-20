-- ============================================================
-- 0011 - Corregge un bug di correlazione SQL in 0009.
--
-- BUG: la policy scritta in 0009_fix_group_creation_membership.sql
-- controllava "not exists (select 1 from public.group_members gm2 where
-- gm2.group_id = group_id)" per verificare che il gruppo non avesse ancora
-- nessun membro. Ma la subquery interroga la STESSA tabella della policy
-- (group_members), quindi il riferimento non qualificato "group_id" non
-- puntava alla riga che si sta inserendo: veniva risolto come gm2.group_id,
-- cioe' "confronta la colonna con se stessa" -- una condizione sempre vera
-- per qualunque riga esistente. Il risultato (visibile interrogando
-- pg_policy) era:
--   NOT EXISTS (SELECT 1 FROM group_members gm2 WHERE gm2.group_id = gm2.group_id)
-- che e' falso appena esiste UNA riga qualsiasi in group_members in TUTTO
-- il database, non solo per il gruppo in questione: bastava che un solo
-- utente avesse gia' un gruppo con un membro (praticamente sempre, per il
-- gruppo personale di chiunque) perche' il bootstrap fallisse di nuovo con
-- lo stesso "Solo gli amministratori del gruppo possono farlo".
--
-- FIX: qualificare esplicitamente il riferimento alla riga esterna con il
-- nome della tabella della policy (group_members.group_id, non l'alias
-- della subquery) cosi' la correlazione punta al gruppo giusto.
-- ============================================================

drop policy if exists members_insert_admin on public.group_members;

create policy members_insert_admin on public.group_members for insert to authenticated
  with check (
    public.is_group_admin(group_id)
    or (
      role = 'owner'
      and user_id = (select auth.uid())
      and exists (
        select 1 from public.groups g
        where g.id = group_members.group_id and g.owner_id = (select auth.uid())
      )
      and not exists (
        select 1 from public.group_members gm2
        where gm2.group_id = group_members.group_id
      )
    )
  );
