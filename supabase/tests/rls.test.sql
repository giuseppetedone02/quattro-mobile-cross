-- ============================================================
-- Suite pgTAP: Row Level Security, vincoli, RPC.  53 asserzioni.
--
-- QUESTA SUITE E' BLOCCANTE IN CI. Non ha "continue-on-error".
--
-- Perche' bloccante: la chiave che il client mobile usa per parlare con
-- PostgREST e' dentro il bundle dell'app, quindi e' pubblica. Chiunque la
-- estragga puo' emettere qualunque query verso il database. L'unica cosa che
-- separa i dati di un gruppo da quelli di un altro sono le policy RLS. Una
-- policy che nessun test esercita non e' una misura di sicurezza: e' una
-- dichiarazione di intenti. Una regressione in un file di migrazione non da'
-- nessun errore, nessun warning e nessun crash -- restituisce solo piu'
-- righe di quante dovrebbe. Questa suite e' il solo punto in cui una fuga di
-- dati diventa un test rosso.
--
-- Cosa copre, oltre all'isolamento fra gruppi:
--  - il trigger di registrazione (profilo, gruppo personale, aggancio inviti)
--  - i vincoli che il client non puo' aggirare (FK composita, indici unici
--    parziali, colonna generata)
--  - il fatto che v_place_scores non aggiri la RLS (security_invoker)
--  - il fatto che google_place_cache sia illeggibile dal client
--  - il ciclo di vita completo di un invito, incluso il riuso del token
--  - search_people, che non deve permettere l'enumerazione degli iscritti
--
-- Esecuzione:
--   supabase test db supabase/tests/rls.test.sql
--   (il file si nomina per esteso perche' pg_prove eseguirebbe anche
--    _local_stub.sql, che non e' un test -- vedi il commento in quel file)
--
--   oppure, contro un Postgres nudo: applicare _local_stub.sql e le migrazioni
--   0001-0005, con pgTAP installato.
--
-- Convenzione interna: gli identificatori delle fixture sono UUID fissi e
-- leggibili, cosi' che ogni asserzione sia una singola istruzione SQL piatta
-- e l'output di pg_prove indichi esattamente la riga che ha fallito.
--   alice  11111111-...   bob    22222222-...   carla 33333333-...
--   dario  44444444-...   alice2 55555555-...
--   gruppo "Cena del venerdi"  a0000000-0000-4000-8000-000000000001
--   luogo  "Da Peppino"        b0000000-0000-4000-8000-000000000001
--   luogo  "Il Baffo"          b0000000-0000-4000-8000-000000000002
--   recensione di Alice        c0000000-0000-4000-8000-000000000001
--   recensione di Bob          c0000000-0000-4000-8000-000000000002
--
-- Il cambio di identita' e' due istruzioni: "set role authenticated" (perche'
-- la RLS non si applica al proprietario delle tabelle) e set_config di
-- request.jwt.claims (perche' auth.uid() legge il claim "sub" da li').
-- Ometterne una fa passare tutto senza provare niente.
-- ============================================================

-- pgTAP sta nello schema "extensions" e non in "public": in public finirebbe
-- dentro l'output di "supabase gen types --schema public", rompendo il
-- controllo di sincronia dei tipi in CI.
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path to public, extensions, pg_temp;

select plan(53);

-- ============================================================
-- Fixture: tre utenti. Il trigger on_auth_user_created fa il resto.
-- ============================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.it', '{"username":"alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.it',   '{"username":"bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'carla@test.it', '{"username":"carla"}');

-- Id del gruppo personale di Bob, letto ora come proprietario delle tabelle.
-- Piu' avanti servira' mentre l'identita' attiva e' Alice, che per RLS non
-- puo' vederlo: tenerlo in un GUC evita di dover disattivare la RLS a meta'
-- del test.
select set_config(
  'quattro.bob_personal',
  (select id::text from public.groups
    where owner_id = '22222222-2222-2222-2222-222222222222' and is_personal),
  true);

-- ---------- 1-4: il trigger di registrazione ----------
select is(
  (select count(*) from public.profiles), 3::bigint,
  'trigger: crea 3 profili');

select is(
  (select count(*) from public.profiles where username in ('alice','bob','carla')), 3::bigint,
  'trigger: username rivendicati');

select is(
  (select count(*) from public.groups where is_personal), 3::bigint,
  'trigger: 3 gruppi personali');

select is(
  (select count(*) from public.group_members gm
     join public.groups g on g.id = gm.group_id
    where g.is_personal and g.owner_id = gm.user_id and gm.role = 'owner'), 3::bigint,
  'trigger: ogni utente owner del proprio gruppo personale');

-- ---------- 5: un solo gruppo personale per utente ----------
-- Vincolo di database (indice unico parziale), non di applicazione: qui gira
-- come proprietario delle tabelle, quindi la RLS non c'entra nulla.
select throws_ok(
  $q$ insert into public.groups (name, owner_id, is_personal)
      values ('Altro', '11111111-1111-1111-1111-111111111111', true) $q$,
  '23505', null,
  'vincolo: secondo gruppo personale rifiutato');

-- ============================================================
-- Alice crea un gruppo condiviso, aggiunge un luogo e lo recensisce
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.groups (id, name, description, owner_id)
values ('a0000000-0000-4000-8000-000000000001', 'Cena del venerdi', 'Il gruppo di prova',
        '11111111-1111-1111-1111-111111111111');

-- La prima appartenenza va inserita come proprietario delle tabelle: la
-- policy members_insert_admin richiede di essere gia' amministratore, e
-- appena creato il gruppo non lo si e'. In produzione lo fa la RPC.
reset role;
insert into public.group_members (group_id, user_id, role)
values ('a0000000-0000-4000-8000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'owner');

set role authenticated;

insert into public.places
  (id, source, google_place_id, name, address, lat, lng, created_by, coords_refreshed_at)
values ('b0000000-0000-4000-8000-000000000001', 'google', 'ChIJtestPeppino',
        'Da Peppino', 'Via Roma 12, Bari', 41.117, 16.871,
        '11111111-1111-1111-1111-111111111111', now());

insert into public.group_places (group_id, place_id, added_by)
values ('a0000000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000001',
        '11111111-1111-1111-1111-111111111111');

insert into public.reviews
  (id, group_id, place_id, author_id,
   score_location, score_service, score_menu, score_value,
   bill_total_cents, party_size, comment)
values ('c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        8, 6, 9, 7, 5600, 2, 'Pizza ottima');

-- ---------- 6-7: colonna generata e vista aggregata ----------
select is(
  (select overall from public.reviews where id = 'c0000000-0000-4000-8000-000000000001'),
  7.50::numeric,
  'colonna generata: overall = 7.50');

select is(
  (select avg_cost_per_person_cents from public.v_place_scores),
  2800,
  'vista: costo a persona = 2800 cent');

-- ============================================================
-- ISOLAMENTO. Bob e' registrato ma non fa parte del gruppo di Alice:
-- non deve vedere assolutamente nulla.
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is_empty(
  $q$ select 1 from public.groups where name = 'Cena del venerdi' $q$,
  'RLS: Bob non vede il gruppo di Alice');

select is_empty(
  $q$ select 1 from public.reviews $q$,
  'RLS: Bob non vede le recensioni di Alice');

-- Una sola riga: la propria appartenenza al proprio gruppo personale.
select is(
  (select count(*) from public.group_members), 1::bigint,
  'RLS: Bob non vede i membri del gruppo di Alice');

select is_empty(
  $q$ select 1 from public.group_places $q$,
  'RLS: Bob non vede gli inserimenti luogo del gruppo di Alice');

select is_empty(
  $q$ select 1 from public.places $q$,
  'RLS: Bob non vede il luogo di Alice');

-- Se la vista non avesse security_invoker = on questa asserzione fallirebbe:
-- e' il test che rende visibile quella singola opzione.
select is_empty(
  $q$ select 1 from public.v_place_scores $q$,
  'RLS: Bob non vede le medie del gruppo di Alice (view security_invoker)');

-- RLS attiva e zero policy: zero righe, non errore di permesso.
select is_empty(
  $q$ select 1 from public.google_place_cache $q$,
  'RLS: Bob non legge google_place_cache');

select is_empty(
  $q$ select 1 from public.profiles where username = 'alice' $q$,
  'RLS: Bob non vede il profilo di Alice');

select is(
  (select count(*) from public.profiles where username = 'bob'), 1::bigint,
  'RLS: Bob vede il proprio profilo');

-- ---------- 17-18: Bob non puo' forzare l'ingresso ----------
select throws_ok(
  $q$ insert into public.group_members (group_id, user_id)
      values ('a0000000-0000-4000-8000-000000000001',
              '22222222-2222-2222-2222-222222222222') $q$,
  '42501', null,
  'RLS: Bob non puo autoiscriversi al gruppo di Alice');

select throws_ok(
  $q$ insert into public.groups (name, owner_id, is_personal)
      values ('Falso personale', '22222222-2222-2222-2222-222222222222', true) $q$,
  '42501', null,
  'RLS: Bob non puo creare un gruppo personale');

-- ---------- 19-23: search_people non permette enumerazione ----------
select is_empty(
  $q$ select * from public.search_people('al') $q$,
  'search_people: query da 2 caratteri non restituisce nulla');

select is(
  (select count(*) from public.search_people('ali')), 1::bigint,
  'search_people: prefisso da 3 caratteri trova alice');

select is_empty(
  $q$ select * from public.search_people('alice@') $q$,
  'search_people: email parziale non matcha');

select is(
  (select count(*) from public.search_people('alice@test.it')), 1::bigint,
  'search_people: email esatta matcha');

select is_empty(
  $q$ select * from public.search_people('bob') $q$,
  'search_people: non restituisce se stesso');

-- ============================================================
-- Flusso di invito completo
-- ============================================================

-- ---------- 24: solo gli amministratori invitano ----------
select throws_ok(
  $q$ select public.invite_to_group('a0000000-0000-4000-8000-000000000001', 'carla') $q$,
  '42501', null,
  'invite: un non-admin non puo invitare');

-- ---------- 25: Alice invita Bob ----------
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select isnt(
  (select token from public.invite_to_group('a0000000-0000-4000-8000-000000000001', 'bob')),
  null::uuid,
  'invite: Alice invita Bob');

-- Il token viene messo in un GUC perche' Carla, che non e' ne' invitata ne'
-- amministratrice, per policy non riesce a leggerlo dalla tabella: e'
-- esattamente cio' che il test dopo verifica.
select set_config(
  'quattro.invite_token',
  (select token::text from public.group_invitations
    where group_id = 'a0000000-0000-4000-8000-000000000001'
      and invitee_id = '22222222-2222-2222-2222-222222222222'
      and status = 'pending'),
  true);

-- ---------- 26: il token e' legato a una persona ----------
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select throws_ok(
  $q$ select public.respond_to_invitation(
        current_setting('quattro.invite_token')::uuid, true) $q$,
  '42501', null,
  'invite: Carla non puo usare il token di Bob');

-- ---------- 27-28: Bob accetta, e il token non si riusa ----------
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select public.respond_to_invitation(current_setting('quattro.invite_token')::uuid, true);

select ok(
  public.is_group_member('a0000000-0000-4000-8000-000000000001'),
  'invite: Bob e nel gruppo dopo accettazione');

select throws_ok(
  $q$ select public.respond_to_invitation(
        current_setting('quattro.invite_token')::uuid, true) $q$,
  '22023', null,
  'invite: token non riusabile');

-- ============================================================
-- Requisito 2.1: entrando nel gruppo, Bob vede lo storico
-- ============================================================
select is(
  (select count(*) from public.places), 1::bigint,
  'requisito 2.1: Bob vede i luoghi del gruppo');

select is(
  (select count(*) from public.reviews), 1::bigint,
  'requisito 2.1: Bob vede la recensione di Alice');

select is(
  (select count(*) from public.profiles where username = 'alice'), 1::bigint,
  'requisito 2.1: Bob vede il profilo di Alice (compagno di gruppo)');

-- ---------- 32: vedere non e' modificare ----------
-- La policy reviews_update filtra la riga in USING, quindi l'UPDATE non
-- solleva un errore: aggiorna zero righe. Va verificato il conteggio, non
-- l'assenza di eccezione.
with u as (
  update public.reviews set score_menu = 1
   where author_id = '11111111-1111-1111-1111-111111111111'
  returning 1
)
select is(
  (select count(*) from u), 0::bigint,
  'RLS: Bob non modifica la recensione di Alice');

-- ---------- 33-34: Bob recensisce lo stesso luogo ----------
select lives_ok(
  $q$ insert into public.reviews
        (id, group_id, place_id, author_id,
         score_location, score_service, score_menu, score_value)
      values ('c0000000-0000-4000-8000-000000000002',
              'a0000000-0000-4000-8000-000000000001',
              'b0000000-0000-4000-8000-000000000001',
              '22222222-2222-2222-2222-222222222222', 6, 8, 7, 9) $q$,
  'requisito 4: Bob aggiunge la propria recensione');

select throws_ok(
  $q$ insert into public.reviews
        (group_id, place_id, author_id,
         score_location, score_service, score_menu, score_value)
      values ('a0000000-0000-4000-8000-000000000001',
              'b0000000-0000-4000-8000-000000000001',
              '22222222-2222-2222-2222-222222222222', 1, 1, 1, 1) $q$,
  '23505', null,
  'vincolo: una recensione per utente/luogo/gruppo');

-- ---------- 35: la media di gruppo tiene conto di entrambe ----------
select is(
  (select avg_overall from public.v_place_scores
    where group_id = 'a0000000-0000-4000-8000-000000000001'
      and place_id = 'b0000000-0000-4000-8000-000000000001'),
  7.50::numeric,
  'media di gruppo su 2 recensioni = 7.50');

-- ---------- 36: la FK composita tiene ----------
-- Bob e' membro del proprio gruppo personale, quindi la RLS lo lascia
-- passare: e' la FK (group_id, place_id) -> group_places che rifiuta, perche'
-- quel luogo in quel gruppo non e' stato inserito.
select throws_ok(
  $q$ insert into public.reviews
        (group_id, place_id, author_id,
         score_location, score_service, score_menu, score_value)
      values (current_setting('quattro.bob_personal')::uuid,
              'b0000000-0000-4000-8000-000000000001',
              '22222222-2222-2222-2222-222222222222', 5, 5, 5, 5) $q$,
  '23503', null,
  'FK composita: recensione su luogo non nel gruppo rifiutata');

-- ---------- 37-39: move_review (requisito 2.2.1) ----------
select is(
  (select group_id from public.move_review(
      'c0000000-0000-4000-8000-000000000002',
      current_setting('quattro.bob_personal')::uuid)),
  current_setting('quattro.bob_personal')::uuid,
  'requisito 2.2.1: recensione spostata nel gruppo personale');

select ok(
  exists (select 1 from public.group_places
           where group_id = current_setting('quattro.bob_personal')::uuid),
  'move_review: group_places creato in destinazione');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $q$ select public.move_review('c0000000-0000-4000-8000-000000000002',
                                current_setting('quattro.bob_personal')::uuid) $q$,
  '42501', null,
  'move_review: non si spostano recensioni altrui');

-- ---------- 40: lo spostamento e' visibile dall'altra parte ----------
select is(
  (select count(*) from public.reviews), 1::bigint,
  'dopo lo spostamento: Alice non vede piu la recensione di Bob');

-- ============================================================
-- Requisito 3.2.1: collegamento a Google con e senza sostituzione
-- ============================================================
insert into public.places (id, source, name, address, created_by)
values ('b0000000-0000-4000-8000-000000000002', 'manual', 'Il Baffo', 'Via Sconosciuta 1',
        '11111111-1111-1111-1111-111111111111');

insert into public.group_places (group_id, place_id, added_by)
values ('a0000000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-000000000002',
        '11111111-1111-1111-1111-111111111111');

-- Blocco plpgsql perche' cinque asserzioni interrogano il record restituito
-- da DUE sole chiamate alla RPC: ripeterla per ogni asserzione proverebbe
-- qualcosa di diverso da quello che interessa.
do $t$
declare v_res public.places;
begin
  -- L'utente rifiuta la sostituzione: collega ma non tocca i propri dati.
  select * into v_res from public.link_place_to_google(
    'b0000000-0000-4000-8000-000000000002', 'ChIJtestBaffo', false,
    'Ristorante Il Baffo S.R.L.', 'Via Vera 9', 41.1, 16.8);

  perform ok(v_res.name = 'Il Baffo',
    'sync rifiutata: nome manuale conservato');
  perform ok(v_res.google_place_id = 'ChIJtestBaffo',
    'sync rifiutata: collegamento avvenuto comunque');
  perform ok(v_res.official_override_pending,
    'sync rifiutata: pulsante resta (override_pending = true)');

  -- Poi accetta.
  select * into v_res from public.link_place_to_google(
    'b0000000-0000-4000-8000-000000000002', 'ChIJtestBaffo', true,
    'Ristorante Il Baffo S.R.L.', 'Via Vera 9', 41.1, 16.8);

  perform ok(v_res.name = 'Ristorante Il Baffo S.R.L.' and v_res.address = 'Via Vera 9',
    'sync accettata: dati ufficiali applicati');
  perform ok(not v_res.official_override_pending,
    'sync accettata: pulsante scompare (override_pending = false)');
end $t$;

-- ============================================================
-- Accesso con Google: nessuno username, poi claim_username
-- ============================================================
reset role;
insert into auth.users (id, email)
values ('44444444-4444-4444-4444-444444444444', 'dario@test.it');

select ok(
  (select username is null from public.profiles
    where id = '44444444-4444-4444-4444-444444444444'),
  'SSO Google: profilo creato con username NULL');

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select throws_ok(
  $q$ select public.claim_username('alice') $q$,
  '23505', null,
  'claim_username: rifiuta username occupato');

-- Anche il formato non valido esce come 23505: al client serve un solo caso.
select throws_ok(
  $q$ select public.claim_username('ab') $q$,
  '23505', null,
  'claim_username: rifiuta username troppo corto');

select public.claim_username('dario');

select ok(
  (select username = 'dario' and onboarding_completed from public.profiles
    where id = '44444444-4444-4444-4444-444444444444'),
  'claim_username: rivendica username libero e completa onboarding');

-- ---------- 50: collisione di username alla registrazione ----------
-- Non deve far fallire il signup: l'utente resta senza username e lo
-- rivendica dall'onboarding.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values ('55555555-5555-5555-5555-555555555555', 'alice2@test.it', '{"username":"alice"}');

select ok(
  (select username is null from public.profiles
    where id = '55555555-5555-5555-5555-555555555555'),
  'trigger: collisione username -> profilo con NULL (non fallisce)');

-- ============================================================
-- Uscita dal gruppo: l'accesso ai dati si chiude subito
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

delete from public.group_members
 where group_id = 'a0000000-0000-4000-8000-000000000001'
   and user_id = '22222222-2222-2222-2222-222222222222';

select ok(
  not public.is_group_member('a0000000-0000-4000-8000-000000000001'),
  'Bob puo lasciare il gruppo');

select is_empty(
  $q$ select 1 from public.groups where id = 'a0000000-0000-4000-8000-000000000001' $q$,
  'dopo l uscita Bob non vede piu il gruppo');

select is_empty(
  $q$ select 1 from public.reviews where group_id = 'a0000000-0000-4000-8000-000000000001' $q$,
  'dopo l uscita Bob non vede piu le recensioni del gruppo');

reset role;

select * from finish();
rollback;
