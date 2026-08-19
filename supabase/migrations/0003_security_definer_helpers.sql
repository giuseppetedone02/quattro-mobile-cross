-- ============================================================
-- 0003 - Helper SECURITY DEFINER per la RLS
--
-- COSA: quattro funzioni che rispondono a "di quali gruppi faccio parte?",
--       "sono membro?", "sono amministratore?", "posso leggere questo luogo?".
-- PERCHE' SECURITY DEFINER: le policy su group_members devono interrogare
--       group_members. Se lo facessero direttamente scatterebbe la RLS della
--       stessa tabella e si avrebbe una ricorsione infinita (errore
--       "infinite recursion detected in policy"). La funzione gira come
--       proprietario e la spezza.
-- PERCHE' STABLE: permette a Postgres di valutarla una volta per query
--       invece che una volta per riga. Su una lista di luoghi la differenza
--       fra STABLE e VOLATILE e' fra una scansione e N.
-- PERCHE' set search_path = '': una funzione SECURITY DEFINER con
--       search_path ereditato dal chiamante e' un vettore di privilege
--       escalation (l'attaccante crea "public.group_members" in uno schema
--       che precede). Con search_path vuoto ogni oggetto, TIPI COMPRESI,
--       va qualificato.
-- PERCHE' revoke da anon: un utente non autenticato ha auth.uid() nullo,
--       quindi le funzioni non gli servirebbero a nulla, ma togliere il
--       privilegio riduce la superficie esposta da PostgREST.
-- ============================================================

create or replace function public.my_group_ids()
returns setof uuid language sql security definer stable set search_path = ''
as $$ select gm.group_id from public.group_members gm where gm.user_id = auth.uid(); $$;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean language sql security definer stable set search_path = ''
as $$ select exists (select 1 from public.group_members gm
       where gm.group_id = p_group_id and gm.user_id = auth.uid()); $$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean language sql security definer stable set search_path = ''
as $$ select exists (select 1 from public.group_members gm
       where gm.group_id = p_group_id and gm.user_id = auth.uid()
         and gm.role in ('owner','admin')); $$;

create or replace function public.can_read_place(p_place_id uuid)
returns boolean language sql security definer stable set search_path = ''
as $$ select exists (select 1 from public.group_places gp
       join public.group_members gm on gm.group_id = gp.group_id
       where gp.place_id = p_place_id and gm.user_id = auth.uid()); $$;

revoke execute on function public.my_group_ids()        from anon;
revoke execute on function public.is_group_member(uuid) from anon;
revoke execute on function public.is_group_admin(uuid)  from anon;
revoke execute on function public.can_read_place(uuid)  from anon;
