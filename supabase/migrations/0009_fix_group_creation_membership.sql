-- ============================================================
-- 0009 - Fix: creare un gruppo falliva con "Solo gli amministratori del
--        gruppo possono farlo" anche per chi lo stava creando.
--
-- BUG: useCreateGroup() (features/groups/hooks/useGroups.ts) inserisce prima
--      la riga in public.groups (permesso da groups_insert, che richiede solo
--      owner_id = auth.uid()), poi la riga di appartenenza in
--      public.group_members con role='owner'. Quel secondo insert e' filtrato
--      da members_insert_admin, definita in 0004_rls_policies.sql come:
--        with check (public.is_group_admin(group_id))
--      is_group_admin() (0003_security_definer_helpers.sql) verifica se
--      esiste GIA' una riga in group_members per (group_id, auth.uid()) con
--      ruolo owner/admin. Ma per un gruppo appena creato quella riga e'
--      esattamente quella che si sta cercando di inserire: non esiste ancora
--      nessun membro, quindi is_group_admin() risponde sempre false. La RLS
--      nega l'insert con errore 42501, che lib/errors.ts traduce nel
--      messaggio "Solo gli amministratori del gruppo possono farlo" -- pur
--      essendo il creatore stesso a tentare l'operazione.
--
-- FIX: si aggiunge una seconda condizione alla policy, che permette
--      l'auto-inserimento come 'owner' SOLO nel preciso momento di bootstrap:
--      il gruppo non ha ancora nessun membro, e chi si inserisce e' proprio
--      owner_id di quel gruppo. Dopo il primo membro la finestra si chiude:
--      ogni insert successivo (aggiungere qualcun altro) ricade di nuovo
--      sotto is_group_admin(), che ora trova la riga appena creata.
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
        where g.id = group_id and g.owner_id = (select auth.uid())
      )
      and not exists (
        select 1 from public.group_members gm2 where gm2.group_id = group_id
      )
    )
  );
