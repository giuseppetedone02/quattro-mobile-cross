-- ============================================================
-- 0001 - Estensioni e tipi enumerati
--
-- COSA: abilita pgcrypto (gen_random_uuid) e citext, poi crea i tre enum
--       del dominio.
-- PERCHE': citext viene creata in "public" e NON nello schema "extensions"
--       perche' tutto il resto dello schema qualifica il tipo come
--       "public.citext". Le funzioni del progetto girano con
--       "set search_path = ''", e in quella condizione anche i TIPI devono
--       essere qualificati: senza qualificazione Postgres non risolve
--       "citext" e la funzione fallisce a runtime, non alla creazione.
--       Questa e' la prima delle due trappole gia' risolte nel piano.
-- ============================================================

create extension if not exists pgcrypto with schema public;
create extension if not exists citext   with schema public;

-- Origine di un luogo: importato da Google Places o inserito a mano.
create type public.place_source as enum ('google', 'manual');

-- Ruolo dentro un gruppo. "owner" e' unico e coincide con groups.owner_id.
create type public.member_role as enum ('owner', 'admin', 'member');

-- Ciclo di vita di un invito. "expired" viene impostato dal job notturno
-- (vedi 0007) oltre che da respond_to_invitation.
create type public.invitation_status as enum
  ('pending', 'accepted', 'declined', 'revoked', 'expired');
