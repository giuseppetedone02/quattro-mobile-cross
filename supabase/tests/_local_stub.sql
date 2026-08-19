-- ============================================================
-- _local_stub.sql
--
-- Copia di verify/00_supabase_stub.sql: emulazione minima dell'ambiente
-- Supabase (schema auth e storage, auth.uid(), storage.foldername(), i ruoli
-- anon e authenticated).
--
-- SERVE SOLO per eseguire lo schema e la suite RLS contro un PostgreSQL nudo,
-- ad esempio in un container usa e getta o sulla macchina di chi non vuole
-- avviare Docker. Su Supabase (locale con "supabase start" o remoto) NON va
-- applicato: quegli oggetti esistono gia' e applicarlo sopra e' inutile e
-- potenzialmente distruttivo. Il runner "supabase test db" non lo carica.
--
-- Non e' incluso in supabase/migrations/ proprio per questo: le migrazioni
-- vengono applicate a un progetto Supabase reale.
--
-- ATTENZIONE se aggiungi test: "supabase test db" senza argomenti passa a
-- pg_prove l'intera cartella supabase/tests, quindi eseguirebbe anche questo
-- file, che non emette output TAP e verrebbe contato come fallimento. Per
-- questo .github/workflows/ci.yml nomina il file di test esplicitamente:
--   supabase test db supabase/tests/rls.test.sql
-- Un test nuovo va aggiunto a quel comando.
-- ============================================================

-- Emulazione minima dell'ambiente Supabase per validare schema, policy e RPC
create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists auth;
create schema if not exists storage;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email citext unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- auth.uid() legge il claim sub, come su Supabase
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(name, '/');
$$;

-- Ruoli come su Supabase
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
