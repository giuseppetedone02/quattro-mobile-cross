# Edge Function di Quattro

Cinque funzioni Deno. Tre fanno da proxy verso Google Places, due mandano email.

| Funzione | Chi la chiama | JWT utente richiesto |
| --- | --- | --- |
| `places-search` | l'app, mentre si digita | si |
| `places-details` | l'app, aprendo un luogo | si |
| `places-photo` | l'app, in modo lazy per ogni foto | si |
| `notify-invite` | un Database Webhook su `group_invitations` | no (segreto condiviso) |
| `send-auth-email` | Supabase Auth (Send Email Hook) | no (firma Standard Webhooks) |

## Regola che non si negozia

`GOOGLE_PLACES_KEY` e `RESEND_API_KEY` **non devono comparire da nessuna parte
nel bundle dell'app**. Non in `.env`, non in `app.config.ts`, non in un
`EXPO_PUBLIC_*`, non in un file di costanti. Tutto cio' che entra in un bundle
React Native e' estraibile: l'APK e' uno zip, e il bundle JavaScript e' un file
di testo dentro quello zip. Una chiave Places rubata si usa fino a esaurimento
del credito, e la fattura arriva al proprietario del progetto Google Cloud.

Le due chiavi vivono **solo** come secret delle Edge Function. A differenza
delle chiavi Maps (`GOOGLE_MAPS_ANDROID_KEY`, `GOOGLE_MAPS_IOS_KEY`), che si
possono restringere per package + SHA1 o per bundle id e quindi possono stare
nel binario, la chiave Places e' una chiave server: non ha nessuna
restrizione per app che la protegga.

## Secret da impostare

```bash
# --- Google Places (usata da places-search, places-details, places-photo) ---
supabase secrets set GOOGLE_PLACES_KEY=AIza...

# --- Resend (usata da notify-invite e send-auth-email) ---
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM="Quattro <inviti@tuodominio.it>"

# --- notify-invite ---
# Pagina web di fallback per gli inviti: DEVE esistere, vedi sotto.
supabase secrets set INVITE_WEB_BASE_URL=https://quattro.tuodominio.it
# Segreto condiviso con il Database Webhook (inventane uno lungo e casuale).
supabase secrets set INVITE_WEBHOOK_SECRET="$(openssl rand -hex 32)"

# --- send-auth-email ---
# Valore che il pannello mostra quando si abilita il Send Email Hook,
# nella forma "v1,whsec_...": incollalo per intero.
supabase secrets set SEND_EMAIL_HOOK_SECRET='v1,whsec_...'
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sono iniettate
automaticamente dal runtime: **non** vanno impostate a mano.

Per lo sviluppo locale (`supabase functions serve`) gli stessi valori si mettono
in `supabase/.env.local`, che e' gia' escluso dal versionamento:

```bash
supabase functions serve --env-file supabase/.env.local
```

## Deploy

```bash
supabase link --project-ref <project-ref>

# Funzioni chiamate dall'app: verifica del JWT attiva (default).
supabase functions deploy places-search
supabase functions deploy places-details
supabase functions deploy places-photo

# Funzioni chiamate da un webhook: non c'e' nessun JWT utente da verificare,
# l'autenticazione e' il segreto condiviso / la firma.
supabase functions deploy notify-invite   --no-verify-jwt
supabase functions deploy send-auth-email --no-verify-jwt
```

Verifica rapida che il gateway rifiuti gli anonimi (deve tornare 401):

```bash
curl -i -X POST "https://<ref>.supabase.co/functions/v1/places-search" \
  -H 'Content-Type: application/json' -d '{"input":"pizz"}'
```

## Collegare `notify-invite` al database

Dashboard > Database > Webhooks > Create a new hook:

- Table: `public.group_invitations`, Events: `Insert`
- Type: HTTP Request, Method `POST`
- URL: `https://<ref>.supabase.co/functions/v1/notify-invite`
- HTTP Headers:
  - `Content-Type: application/json`
  - `x-webhook-secret: <lo stesso valore di INVITE_WEBHOOK_SECRET>`

## Collegare `send-auth-email` a Auth

Dashboard > Authentication > Hooks > Send Email Hook: abilita, scegli
"HTTPS", URL `https://<ref>.supabase.co/functions/v1/send-auth-email`, e copia
il secret generato in `SEND_EMAIL_HOOK_SECRET`.

Da quel momento Supabase **non manda piu' email da solo**: se questa funzione
e' rotta, nessuno riesce a registrarsi. Il motivo per cui vale la pena e' nel
commento in testa a `send-auth-email/index.ts`: il servizio integrato fa 2 email
all'ora e solo verso i membri del team.

## La pagina web di fallback per gli inviti

`INVITE_WEB_BASE_URL` deve puntare a una pagina che risponda a
`/invite/{token}`. **Non e' inclusa in questo repository**: e' il pezzo di
lavoro ancora da fare per rendere gli inviti utilizzabili da chi non ha l'app.

Serve perche' un link `quattro://invite/{token}` non fa assolutamente nulla se
l'app non e' installata -- e per un invito quello e' il caso normale. Il
progetto non usa Universal Links / App Links, perche' richiedono l'entitlement
`associated-domains` che un Apple Personal Team non concede, e il sideload e'
proprio lo scenario previsto. Quindi il link nell'email e' web, e la pagina
deve: spiegare cos'e' Quattro, dare le istruzioni di installazione (APK o IPA
da firmare), e riproporre il token in modo che l'utente possa incollarlo o
toccare il deep link dopo l'installazione.

## Note sui costi e sui Termini di Google

Sono scritte nei commenti in testa a ciascuna funzione, dove servono. In sintesi:

- `places-search`: la soglia dei 3 caratteri sta sul server perche' ogni
  richiesta di autocomplete e' fatturata, anche quelle di sessioni abbandonate
  (10.000 gratis al mese, poi circa 2,83 USD ogni 1.000).
- `places-details`: la field mask e' **fissa nel codice**. Se il client potesse
  aggiungere `reviews`, ogni chiamata passerebbe allo SKU piu' caro.
- `places-details`: TTL della cache 6 ore, di proposito corto: i Service Terms
  consentono una cache temporanea per le prestazioni, non un archivio.
- `places-photo`: photo name e photoUri **non si possono memorizzare**
  ("Photo names cannot be cached and may expire"), e un 429 significa "troppe
  richieste contemporanee", quindi il client deve caricare le foto in lazy.
- La cancellazione delle coordinate dopo 29 giorni (Service Terms 14.3) e'
  automatica: vedi `supabase/migrations/0007_cron_jobs.sql`.
