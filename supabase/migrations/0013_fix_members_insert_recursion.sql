-- ============================================================
-- 0013 - Corregge la ricorsione infinita introdotta da 0009/0011.
--
-- BUG: la policy members_insert_admin (0009, poi 0011) contiene:
--   not exists (select 1 from public.group_members gm2
--               where gm2.group_id = group_members.group_id)
-- per verificare "il gruppo non ha ancora nessun membro" durante il
-- bootstrap (owner che entra nel proprio gruppo appena creato). Questa
-- subquery interroga group_members DIRETTAMENTE, dentro una policy sulla
-- STESSA tabella group_members -- esattamente il caso descritto nel
-- commento di 0003_security_definer_helpers.sql: la RLS della tabella
-- scatta di nuovo per valutare la subquery, che a sua volta valuta di
-- nuovo la policy, all'infinito. Errore riprodotto in app: 42P17
-- "infinite recursion detected in policy for relation group_members".
-- Le altre condizioni della stessa policy (is_group_admin(...)) non hanno
-- questo problema perche' sono funzioni SECURITY DEFINER: girano come
-- proprietario della funzione, che di norma e' anche proprietario della
-- tabella, e i proprietari di tabella non sono soggetti a RLS (a meno di
-- FORCE ROW LEVEL SECURITY, non impostato qui) -- e' cosi' che si rompe la
-- recursione.
--
-- FIX: la stessa tecnica per il controllo "gruppo vuoto": una funzione
-- SECURITY DEFINER dedicata, invece della subquery inline.
-- ============================================================

create or replace function public.group_has_no_members(p_group_id uuid)
returns boolean language sql security definer stable set search_path = ''
as $$
  select not exists (
    select 1 from public.group_members gm where gm.group_id = p_group_id
  );
$$;

revoke execute on function public.group_has_no_members(uuid) from anon;

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
      and public.group_has_no_members(group_id)
    )
  );
