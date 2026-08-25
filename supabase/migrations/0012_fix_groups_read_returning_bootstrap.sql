-- ============================================================
-- 0012 - Corregge il vero motivo del "Solo gli amministratori del gruppo
-- possono farlo" alla creazione di un gruppo.
--
-- BUG: useCreateGroup() fa `.insert({...}).select('*').single()` su
-- "groups", che PostgREST traduce in un unico INSERT ... RETURNING *.
-- Postgres applica la policy SELECT (non solo il WITH CHECK dell'INSERT)
-- anche alla riga restituita dalla RETURNING. La policy SELECT
-- "groups_read" e' `id in (select my_group_ids())`, cioe' richiede che
-- l'utente sia gia' membro del gruppo tramite group_members -- ma la riga
-- in group_members viene inserita SOLO DOPO, nel passo successivo dello
-- stesso mutationFn. Nel momento dell'INSERT su "groups" l'utente non e'
-- ancora membro, quindi la RETURNING fallisce la policy SELECT e Postgres
-- segnala l'errore con lo stesso identico messaggio 42501 "new row
-- violates row-level security policy for table groups" usato per un
-- WITH CHECK fallito -- anche se il WITH CHECK dell'INSERT era corretto e
-- soddisfatto (confermato con query dirette su pg_policy/information_schema
-- durante il debug: owner_id, is_personal, JWT sub/role erano tutti giusti).
--
-- FIX: la policy di lettura permette anche a chi e' owner della riga di
-- leggerla, indipendentemente da group_members. E' un invariante sicuro:
-- l'owner di un gruppo deve poter sempre vedere il proprio gruppo, ed e'
-- proprio l'owner che sta per diventare membro un istante dopo.
-- ============================================================

drop policy if exists groups_read on public.groups;

create policy groups_read on public.groups for select to authenticated
  using (
    id in (select public.my_group_ids())
    or owner_id = (select auth.uid())
  );
