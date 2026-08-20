-- ============================================================
-- 0008 - "I miei posti" diventa "I miei gusti" + rename abilitato
--
-- COSA: due modifiche indipendenti che viaggiano insieme perche' nascono
--       dalla stessa richiesta.
--
-- 1. Il nome predefinito del gruppo personale cambia da "I miei posti" a
--    "I miei gusti". handle_new_user() e' CREATE OR REPLACE (idempotente):
--    questa migrazione lo riscrive con il nuovo testo per i signup futuri, e
--    poi aggiorna con un UPDATE i gruppi personali gia' esistenti che hanno
--    ancora il vecchio nome di default -- altrimenti solo i nuovi utenti
--    vedrebbero il cambio.
--
--    L'UPDATE e' ristretto a is_personal e al nome esatto di default: se un
--    utente avesse gia' rinominato il proprio gruppo personale (RLS lo
--    permetteva anche prima: la policy groups_update non lo vietava, solo il
--    client lo bloccava), quel nome scelto non viene toccato.
--
-- 2. Il gruppo personale ora si puo' rinominare. Non serve nessuna modifica
--    a RLS: la policy groups_update (0004) non ha mai vietato di rinominare
--    un gruppo is_personal, solo insert e delete lo fanno (a ragione: non
--    deve essere possibile crearne un secondo o cancellare quell'unico). Il
--    blocco sul rename era solo lato client (canEditGroup in
--    features/groups/hooks/useGroups.ts) ed e' stato rimosso li'.
-- ============================================================

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
  values ('I miei gusti', new.id, true)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, new.id, 'owner');

  update public.group_invitations
     set invitee_id = new.id
   where invitee_id is null and invitee_email = new.email and status = 'pending';

  return new;
end $$;

-- Backfill: solo i gruppi personali che hanno ancora il nome di default.
update public.groups
   set name = 'I miei gusti'
 where is_personal
   and name = 'I miei posti';
