-- ============================================================
-- 0002 - Tabelle, indici, vincoli
--
-- COSA: l'intero schema di dominio (profili, gruppi, membri, inviti, luoghi,
--       recensioni, foto) piu' la tabella di cache di Google Places.
-- PERCHE' i vincoli sono nel database e non solo nel client: il client e'
--       sostituibile e bypassabile, il vincolo no. In particolare:
--        - "reviews" ha una FK COMPOSITA su (group_id, place_id) verso
--          group_places: rende impossibile recensire in un gruppo un luogo
--          che in quel gruppo non e' stato inserito. E' il vincolo che tiene
--          insieme il modello "stesso luogo, punteggi diversi per gruppo".
--        - "overall" e' una colonna generata: la media dei quattro criteri
--          non puo' andare fuori sincrono con i punteggi.
--        - un solo gruppo personale per utente e' garantito da un indice
--          unico parziale, non da codice applicativo.
-- I tipi sono qualificati con "public." perche' lo stesso stile viene usato
-- dalle funzioni con search_path vuoto (vedi 0001).
-- ============================================================

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  username             public.citext unique,
  display_name         text,
  avatar_path          text,
  theme                text        not null default 'sunset',
  onboarding_completed boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint username_format check (
    username is null or username ~ '^[a-z0-9](?:[a-z0-9_.]{1,18}[a-z0-9])$'
  )
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (char_length(description) <= 500),
  image_path  text,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  is_personal boolean not null default false,
  created_at  timestamptz not null default now()
);
-- Un solo gruppo personale ("I miei posti") per proprietario.
create unique index groups_one_personal_per_owner
  on public.groups(owner_id) where is_personal;

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id);

create table public.group_invitations (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  inviter_id    uuid not null references public.profiles(id) on delete cascade,
  invitee_id    uuid references public.profiles(id) on delete cascade,
  invitee_email public.citext,
  token         uuid not null default gen_random_uuid() unique,
  status        public.invitation_status not null default 'pending',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  responded_at  timestamptz,
  -- Un invito deve puntare a un utente esistente O a un indirizzo email:
  -- il secondo caso serve a invitare chi non e' ancora registrato.
  constraint invitee_identified check (invitee_id is not null or invitee_email is not null)
);
-- Niente inviti duplicati pendenti, ne' per utente ne' per email.
create unique index invite_one_pending_user on public.group_invitations(group_id, invitee_id)
  where status = 'pending' and invitee_id is not null;
create unique index invite_one_pending_email on public.group_invitations(group_id, invitee_email)
  where status = 'pending' and invitee_id is null;

create table public.places (
  id                    uuid primary key default gen_random_uuid(),
  source                public.place_source not null default 'manual',
  google_place_id       text unique,
  google_linked_at      timestamptz,
  place_id_refreshed_at timestamptz,
  name             text not null check (char_length(btrim(name)) between 1 and 140),
  address          text,
  cuisine          text,
  notes            text check (char_length(notes) <= 1000),
  cover_photo_path text,
  -- lat/lng sono un cache di coordinate Google e vengono azzerate dal job
  -- dei 29 giorni (vedi 0007): coords_refreshed_at ne registra l'eta'.
  lat                 double precision check (lat between -90 and 90),
  lng                 double precision check (lng between -180 and 180),
  coords_refreshed_at timestamptz,
  -- true quando l'utente ha collegato il luogo a Google ma ha rifiutato di
  -- sovrascrivere nome e indirizzo: l'app tiene visibile il pulsante.
  official_override_pending boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_source_needs_id check (source <> 'google' or google_place_id is not null)
);
create index places_google_idx on public.places(google_place_id) where google_place_id is not null;
create index places_geo_idx    on public.places(lat, lng) where lat is not null;

create table public.group_places (
  group_id uuid not null references public.groups(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, place_id)
);
create index group_places_place_idx on public.group_places(place_id);

create table public.reviews (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null,
  place_id  uuid not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  score_location smallint not null check (score_location between 1 and 10),
  score_service  smallint not null check (score_service  between 1 and 10),
  score_menu     smallint not null check (score_menu     between 1 and 10),
  score_value    smallint not null check (score_value    between 1 and 10),
  overall numeric(4,2) generated always as (
    (score_location + score_service + score_menu + score_value)::numeric / 4
  ) stored,
  bill_total_cents integer  check (bill_total_cents between 0 and 10000000),
  party_size       smallint check (party_size between 1 and 50),
  comment    text check (char_length(comment) <= 2000),
  visited_on date check (visited_on <= current_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, place_id, author_id),
  foreign key (group_id, place_id)
    references public.group_places(group_id, place_id) on delete cascade
);
create index reviews_group_place_idx on public.reviews(group_id, place_id);
create index reviews_author_idx      on public.reviews(author_id);

create table public.review_photos (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null references public.reviews(id) on delete cascade,
  storage_path text not null,
  position     smallint not null default 0,
  width        integer,
  height       integer,
  blurhash     text,
  created_at   timestamptz not null default now()
);
create index review_photos_review_idx on public.review_photos(review_id, position);

-- ------------------------------------------------------------
-- Cache di Google Places.
--
-- RLS attiva e ZERO policy: e' deliberato. Nessuna policy significa che
-- PostgREST (quindi qualunque client con la chiave pubblicabile) non legge
-- mai una riga, mentre la service-role key usata dalle Edge Function ignora
-- la RLS. La cache resta cosi' un dettaglio interno del server: i Termini di
-- servizio di Google vietano di ridistribuire i contenuti Places, e un
-- endpoint leggibile dal client sarebbe esattamente questo.
-- ------------------------------------------------------------
create table public.google_place_cache (
  google_place_id text primary key,
  payload    jsonb       not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);
alter table public.google_place_cache enable row level security;

grant select, insert, update, delete on
  public.profiles, public.groups, public.group_members, public.group_invitations,
  public.places, public.group_places, public.reviews, public.review_photos
to authenticated;

-- Il grant su google_place_cache resta per far restituire zero righe invece
-- di un errore di permesso: la protezione vera e' la RLS senza policy.
grant select on public.google_place_cache to authenticated;
