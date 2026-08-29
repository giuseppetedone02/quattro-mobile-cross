-- ============================================================
-- Suite pgTAP: cancellazione account (0015) e moderazione recensioni (0016).
--
-- NON e' ancora nominata in .github/workflows/ci.yml: e' il test manuale
-- richiesto per verificare le due migrazioni prima di applicarle in
-- produzione. Per aggiungerla a CI in modo permanente basta accodarla al
-- comando "Test RLS" in ci.yml, come da nota in quel file.
--
-- Esecuzione in locale (richiede Docker per "supabase start"):
--   npx supabase start
--   npx supabase db reset            -- applica 0001..0016 e i seed
--   npx supabase test db supabase/tests/account_deletion_and_moderation.test.sql
--
-- Cosa verifica:
--  1-7   request_account_deletion(): blocca il proprietario di un gruppo
--        condiviso con altri membri, funziona per chi non lo e', e torna a
--        funzionare per lo stesso utente una volta che il gruppo si riduce
--        al solo proprietario (il confine esatto della condizione di blocco:
--        count(*) > 1, non >= 1).
--  4-5   cancel_account_deletion(): ripensamento.
--  8-12  accounts_ready_for_purge() e storage_objects_pending_purge(): le
--        due funzioni di sola lettura su cui si appoggia la Edge Function
--        purge-deleted-accounts (la cancellazione vera non e' testabile qui,
--        vedi il commento sopra quel blocco -- storage.objects rifiuta le
--        DELETE dirette). Chi ha superato i 30 giorni compare fra gli
--        account pronti, chi nel frattempo e' tornato proprietario di un
--        gruppo condiviso no; i file da ripulire sono solo avatar e foto di
--        recensione, mai le foto dei posti (condivise col gruppo).
--  13-17 policy di moderazione: un admin di gruppo puo' cancellare la
--        recensione (e le foto) di un altro membro; un membro normale no.
--
-- Stessa convenzione di rls.test.sql: fixture con UUID leggibili, cambio di
-- identita' con "set role authenticated" + set_config('request.jwt.claims'),
-- "reset role" per tornare proprietario delle tabelle (bypassa la RLS, serve
-- per preparare le fixture e per il "salto nel tempo" del test di purga).
-- ============================================================

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path to public, extensions, pg_temp;

select plan(17);

-- ============================================================
-- Fixture: 4 utenti per la parte cancellazione account.
--   gino  d1111111-...   proprietario del gruppo condiviso -> bloccato
--   mara  d2222222-...   membro del gruppo di gino
--   nico  d3333333-...   membro del gruppo di gino
--   piera d4444444-...   nessun gruppo condiviso -> puo cancellarsi subito
-- ============================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('d1111111-1111-1111-1111-111111111111', 'gino.test@test.it',  '{"username":"gino_test"}'),
  ('d2222222-2222-2222-2222-222222222222', 'mara.test@test.it',  '{"username":"mara_test"}'),
  ('d3333333-3333-3333-3333-333333333333', 'nico.test@test.it',  '{"username":"nico_test"}'),
  ('d4444444-4444-4444-4444-444444444444', 'piera.test@test.it', '{"username":"piera_test"}');

insert into public.groups (id, name, owner_id)
values ('d0000000-0000-4000-8000-000000000001', 'Gruppo condiviso di test',
        'd1111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'd1111111-1111-1111-1111-111111111111', 'owner'),
  ('d0000000-0000-4000-8000-000000000001', 'd2222222-2222-2222-2222-222222222222', 'member'),
  ('d0000000-0000-4000-8000-000000000001', 'd3333333-3333-3333-3333-333333333333', 'member');

-- ---------- 1: gino e' bloccato ----------
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $q$ select public.request_account_deletion() $q$,
  'P0001', null,
  'cancellazione: bloccata per il proprietario di un gruppo condiviso con altri membri');

-- ---------- 2-3: piera non ha gruppi condivisi, la richiesta funziona ----------
select set_config('request.jwt.claims',
  '{"sub":"d4444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select lives_ok(
  $q$ select public.request_account_deletion() $q$,
  'cancellazione: piera (nessun gruppo condiviso) puo richiederla');

select isnt(
  (select deletion_requested_at from public.profiles
    where id = 'd4444444-4444-4444-4444-444444444444'),
  null::timestamptz,
  'cancellazione: deletion_requested_at di piera e valorizzato');

-- ---------- 4-5: piera ripensa ----------
select lives_ok(
  $q$ select public.cancel_account_deletion() $q$,
  'cancellazione: piera puo annullare');

select is(
  (select deletion_requested_at from public.profiles
    where id = 'd4444444-4444-4444-4444-444444444444'),
  null::timestamptz,
  'cancellazione: deletion_requested_at di piera torna null');

-- ---------- 6-7: tolti mara e nico, gino non e piu bloccato ----------
reset role;
delete from public.group_members
 where group_id = 'd0000000-0000-4000-8000-000000000001'
   and user_id in ('d2222222-2222-2222-2222-222222222222',
                    'd3333333-3333-3333-3333-333333333333');

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $q$ select public.request_account_deletion() $q$,
  'cancellazione: gino puo richiederla appena resta unico membro del gruppo (count = 1, non piu > 1)');

select isnt(
  (select deletion_requested_at from public.profiles
    where id = 'd1111111-1111-1111-1111-111111111111'),
  null::timestamptz,
  'cancellazione: deletion_requested_at di gino e valorizzato');

-- ============================================================
-- Test delle due funzioni di sola lettura che la Edge Function
-- purge-deleted-accounts usa per la cancellazione vera (8-12).
--
-- Qui NON si cancella nulla: storage.objects ha un trigger BEFORE DELETE
-- (storage.protect_delete) che rifiuta qualunque DELETE fatto da SQL puro,
-- verificato provando -- da qui la scelta di spostare la cancellazione
-- effettiva su una Edge Function che chiama la vera Storage API. pgTAP puo'
-- pero' verificare in pieno le due funzioni di SOLA LETTURA su cui quella
-- Edge Function si appoggia: un INSERT su storage.objects non e' toccato dal
-- trigger (blocca solo le DELETE), quindi la fixture qui sotto e' innocua.
--  - piera: richiesta legittima, mai piu bloccata -> deve comparire fra gli
--    account pronti per la purga, con i suoi file.
--  - gino: la situazione e cambiata DOPO la richiesta (mara e rientrata nel
--    gruppo) -> accounts_ready_for_purge() deve escluderlo.
-- ============================================================
reset role;

-- Mara rientra nel gruppo di gino: la condizione di blocco torna vera.
insert into public.group_members (group_id, user_id, role)
values ('d0000000-0000-4000-8000-000000000001', 'd2222222-2222-2222-2222-222222222222', 'member');

-- Salto nel tempo: entrambe le richieste risalgono a 31 giorni fa.
update public.profiles set deletion_requested_at = now() - interval '31 days'
 where id in ('d1111111-1111-1111-1111-111111111111',
              'd4444444-4444-4444-4444-444444444444');

-- Piera "ha caricato" un avatar e una foto di recensione (da ripulire) e una
-- foto di un POSTO (da NON ripulire: place-photos e' condiviso col gruppo,
-- non e' un dato personale suo -- vedi places.created_by ON DELETE SET NULL
-- in 0002, i luoghi restano quando l'autore se ne va).
insert into storage.objects (bucket_id, name, owner) values
  ('avatars',       'd4444444-4444-4444-4444-444444444444/test.webp', 'd4444444-4444-4444-4444-444444444444'),
  ('review-photos', 'd0000000-0000-4000-8000-000000000001/fake-review/test.webp',
                     'd4444444-4444-4444-4444-444444444444'),
  ('place-photos',  'e0000000-0000-4000-8000-000000000002/test.webp',
                     'd4444444-4444-4444-4444-444444444444');

select ok(
  'd4444444-4444-4444-4444-444444444444' = any(array(select public.accounts_ready_for_purge())),
  'purga: piera compare fra gli account pronti (nessun blocco pendente)');

select ok(
  not ('d1111111-1111-1111-1111-111111111111' = any(array(select public.accounts_ready_for_purge()))),
  'purga: gino NON compare (e tornato proprietario di un gruppo condiviso)');

select is(
  (select count(*)::int from public.storage_objects_pending_purge(
    'd4444444-4444-4444-4444-444444444444')),
  2,
  'purga: solo avatar e foto di recensione di piera, non la foto del posto');

select is_empty(
  $q$ select * from public.storage_objects_pending_purge(
        'd1111111-1111-1111-1111-111111111111') $q$,
  'purga: gino non ha file da ripulire');

select isnt(
  (select deletion_requested_at from public.profiles
    where id = 'd1111111-1111-1111-1111-111111111111'),
  null::timestamptz,
  'purga: la richiesta di gino resta pendente, la Edge Function la ritentera domani');

-- ============================================================
-- Fixture: gruppo per la moderazione (13-17).
--   ugo   e1111111-...   owner/admin
--   vera  e2222222-...   membro, scrive la recensione da moderare
--   zeno  e3333333-...   membro, NON admin
-- ============================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('e1111111-1111-1111-1111-111111111111', 'ugo.test@test.it',  '{"username":"ugo_test"}'),
  ('e2222222-2222-2222-2222-222222222222', 'vera.test@test.it', '{"username":"vera_test"}'),
  ('e3333333-3333-3333-3333-333333333333', 'zeno.test@test.it', '{"username":"zeno_test"}');

insert into public.groups (id, name, owner_id)
values ('e0000000-0000-4000-8000-000000000001', 'Gruppo moderazione di test',
        'e1111111-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role) values
  ('e0000000-0000-4000-8000-000000000001', 'e1111111-1111-1111-1111-111111111111', 'owner'),
  ('e0000000-0000-4000-8000-000000000001', 'e2222222-2222-2222-2222-222222222222', 'member'),
  ('e0000000-0000-4000-8000-000000000001', 'e3333333-3333-3333-3333-333333333333', 'member');

insert into public.places (id, name, created_by) values
  ('e0000000-0000-4000-8000-000000000002', 'Trattoria di test',
   'e1111111-1111-1111-1111-111111111111');
insert into public.group_places (group_id, place_id, added_by) values
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
   'e1111111-1111-1111-1111-111111111111');

insert into public.reviews
  (id, group_id, place_id, author_id, score_location, score_service, score_menu, score_value)
values
  ('e0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000002', 'e2222222-2222-2222-2222-222222222222', 8, 8, 8, 8),
  ('e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000002', 'e3333333-3333-3333-3333-333333333333', 7, 7, 7, 7);

insert into public.review_photos (id, review_id, storage_path) values
  ('e0000000-0000-4000-8000-000000000020', 'e0000000-0000-4000-8000-000000000011',
   'e0000000-0000-4000-8000-000000000001/e0000000-0000-4000-8000-000000000011/test.webp');

-- ---------- 13: zeno (non admin) non puo cancellare la recensione di vera ----------
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

delete from public.reviews where id = 'e0000000-0000-4000-8000-000000000010';

select ok(
  exists(select 1 from public.reviews where id = 'e0000000-0000-4000-8000-000000000010'),
  'moderazione: un membro non admin non puo cancellare la recensione di un altro');

-- ---------- 14: ugo (admin) cancella la recensione di vera ----------
select set_config('request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

delete from public.reviews where id = 'e0000000-0000-4000-8000-000000000010';

select is_empty(
  $q$ select 1 from public.reviews where id = 'e0000000-0000-4000-8000-000000000010' $q$,
  'moderazione: un admin puo cancellare la recensione di un altro membro');

-- ---------- 15-16: ugo (admin) cancella solo la foto di zeno, non la recensione ----------
delete from public.review_photos where id = 'e0000000-0000-4000-8000-000000000020';

select is_empty(
  $q$ select 1 from public.review_photos where id = 'e0000000-0000-4000-8000-000000000020' $q$,
  'moderazione: un admin puo cancellare direttamente una foto di un altro membro');

select ok(
  exists(select 1 from public.reviews where id = 'e0000000-0000-4000-8000-000000000011'),
  'moderazione: cancellare la foto non tocca la recensione di zeno');

-- ---------- 17: vera (non admin, non autrice) non puo cancellare la recensione di zeno ----------
select set_config('request.jwt.claims',
  '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

delete from public.reviews where id = 'e0000000-0000-4000-8000-000000000011';

select ok(
  exists(select 1 from public.reviews where id = 'e0000000-0000-4000-8000-000000000011'),
  'moderazione: un membro non admin non puo cancellare la recensione di zeno');

reset role;

select * from finish();
