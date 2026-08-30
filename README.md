# Quattro

App mobile per segnare i posti dove si mangia e votarli su quattro criteri:
**Location, Servizio, Menu, Conto**, ognuno da 1 a 10. La media la calcola il
database, non il client.

L'idea che tiene insieme il modello dei dati: **un luogo, tante opinioni per
gruppo**. Lo stesso ristorante puo' stare in piu' gruppi (i colleghi, gli
amici, la famiglia) e in ciascuno avere medie diverse, perche' le recensioni
sono legate alla coppia (gruppo, luogo). Ogni utente ha un gruppo personale
"I miei posti" creato automaticamente alla registrazione, e puo' spostare una
propria recensione da un gruppo a un altro.

I luoghi si aggiungono cercandoli su Google Places o scrivendoli a mano; un
luogo scritto a mano si puo' collegare dopo alla scheda ufficiale di Google,
scegliendo se sostituire nome e indirizzo o tenere i propri.

## Stato del progetto: e' uno scaffold

Va detto subito, perche' cambia le aspettative.

**Funziona e e' verificato:**

- lo schema del database, le policy RLS, le RPC e i trigger: 53 asserzioni
  pgTAP in `supabase/tests/rls.test.sql`, che coprono isolamento fra gruppi,
  vincoli e ciclo di vita degli inviti;
- le sette migrazioni in `supabase/migrations/`, applicate in ordine su
  PostgreSQL senza errori;
- i test unitari dei calcoli e del tema (`npx jest`);
- la configurazione di build per le tre varianti (`app.config.ts`, `eas.json`);
- l'invito via link/codice (RPC + RLS, schermata "Invita", deep link
  `quattro://join/<codice>` e la pagina web di fallback su GitHub Pages,
  `docs/join/`, per chi non ha ancora l'app).

**Scritto ma non ancora esercitato contro i servizi reali:**

- le cinque Edge Function in `supabase/functions/`: sono TypeScript corretto e
  documentato, ma non sono state eseguite contro Google Places ne' Resend;
- i quattro workflow in `.github/workflows/`;
- gli otto flussi Maestro in `maestro/`: sono **specifiche**, e citano `testID`
  che l'interfaccia non espone ancora (l'elenco completo di cio' che serve e'
  in `maestro/README.md`).

**Ancora da fare:**

- `lib/database.types.ts` e' scritto a mano per far compilare il progetto prima
  del primo `supabase gen types`. Al primo `npm run db:types` verra' sostituito
  dal file generato: **fino a quel momento lo step di sincronia dei tipi in CI
  e' rosso**, ed e' giusto che lo sia;
- il seed dei dati di test per i flussi Maestro.

## Stack

| Cosa | Versione | Perche' quella |
| --- | --- | --- |
| Expo SDK | **57.0.14** | New Architecture sempre attiva, non disattivabile |
| React Native | **0.86.2** | fissata dall'SDK |
| React | **19.2.3** | fissata dall'SDK |
| TypeScript | **6.0.x** | `strict` attivo |
| expo-router | 57.0.14 | routing a file, `typedRoutes` attivo |
| Supabase JS | 2.112.x | Postgres + Auth + Storage + Edge Function |
| TanStack Query | 5.101.x | stato server, persistito su AsyncStorage |
| react-native-maps | **1.27.2** | vedi trappole: sotto 1.27.2 non compila su Expo 57 |
| zustand | 5.0.x | stato UI persistito |
| zod | 4.4.x | validazione dei form |
| PostgreSQL | 15 o superiore | `security_invoker` sulle viste esiste da 15 |

## Prerequisiti

- **Node 22.13 o superiore.** La versione e' fissata in `eas.json`
  (`build.base.node`) e nei workflow: usarne un'altra in locale significa
  scoprire le differenze in CI.
- **Un progetto Supabase** (il piano gratuito basta) e la **Supabase CLI**
  (`brew install supabase/tap/supabase` oppure `npx supabase`).
- **Docker**, che serve alla CLI per `supabase start` e per i test RLS.
- **Un progetto Google Cloud** con fatturazione attiva. Serve anche per restare
  nel gratuito: senza carta collegata le API Places e Maps non rispondono.
- Per compilare: **Android Studio** (Android) e **Xcode 26** su macOS (iOS).
- Un **account Expo** (gratuito) per EAS Build e per gli update OTA.

## Primo avvio, passo per passo

### 1. Codice e dipendenze

```bash
git clone <url-del-repository> quattro
cd quattro
npm install
cp .env.example .env
```

`.env` non e' versionato (`.gitignore`). Le variabili si dividono in tre
categorie, e la distinzione conta:

- `EXPO_PUBLIC_*` finiscono **nel bundle** e sono quindi pubbliche. Vanno bene
  solo per cio' che e' protetto da altro (la chiave publishable di Supabase e'
  protetta dalla RLS, i client ID OAuth sono identificatori, non segreti).
- Le variabili senza prefisso vengono lette da `app.config.ts` **al momento
  della build** e finiscono nel binario nativo: e' il caso delle chiavi Maps,
  che si possono restringere per app.
- `GOOGLE_PLACES_KEY` e `RESEND_API_KEY` **non vanno in `.env` per niente**:
  sono secret delle Edge Function.

### 2. Database Supabase

```bash
supabase login
supabase link --project-ref <project-ref>

# Applica supabase/migrations/0001..0007 in ordine.
supabase db push

# Genera i tipi TypeScript dallo schema reale e sostituisce la versione
# scritta a mano.
supabase start           # serve un'istanza locale per --local
npm run db:types
```

`0007_cron_jobs.sql` e' racchiusa in un blocco di guardia: se `pg_cron` non e'
abilitato sul progetto stampa un avviso e non fallisce. **Va abilitato**
(Dashboard > Database > Extensions > `pg_cron`) e la migrazione rieseguita,
perche' uno dei tre job non e' manutenzione ma un obbligo contrattuale verso
Google: vedi la sezione sulle coordinate piu' sotto.

Prendi da Dashboard > Settings > API:

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

In Dashboard > Authentication > URL Configuration:

- Site URL: `quattro://`
- Redirect URLs: `quattro://`, `quattro://auth/callback`, `quattro://invite/*`

### 3. I quattro client OAuth per Google Sign-In

Sono quattro, non uno, e ognuno va in un posto diverso. Sbagliare
l'abbinamento produce sempre lo stesso errore inutile: `DEVELOPER_ERROR`.

In Google Cloud > API e servizi > Credenziali > Crea credenziali > ID client
OAuth:

1. **Applicazione web.** E' il piu' importante e il meno intuitivo: e'
   l'*audience* del token ID che Google emette, quello che Supabase verifica.
   - il suo **Client ID** va in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` e in
     Supabase > Authentication > Providers > Google > Client ID;
   - il suo **Client Secret** va solo in Supabase, nello stesso pannello;
   - fra gli URI di reindirizzamento autorizzati aggiungi
     `https://<ref>.supabase.co/auth/v1/callback`.
2. **iOS**, con bundle id `com.giuseppetedone.quattro`.
   - il Client ID va in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`;
   - il suo **reversed client id** (`com.googleusercontent.apps.<numero>`) va
     in `GOOGLE_IOS_URL_SCHEME`, da cui il plugin genera lo URL scheme di
     ritorno. Ripetilo per i bundle id `.dev` e `.preview` se vuoi che
     l'accesso Google funzioni anche su quelle varianti.
3. **Android per la keystore di release**, con package
   `com.giuseppetedone.quattro` e l'impronta **SHA-1** della keystore usata da
   EAS (`eas credentials -p android` la mostra). Nessuna variabile: questo
   client non si cita nel codice, deve solo esistere, altrimenti Google
   rifiuta la richiesta che arriva dall'APK firmato.
4. **Android per la keystore di debug**, con package
   `com.giuseppetedone.quattro.dev` e il SHA-1 del debug keystore
   (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey
   -storepass android`). Senza questo, l'accesso Google **non funziona sul
   development build** e sembra un bug del codice.

### 4. Le due chiavi Maps (restrette) e la chiave Places (server)

Tre chiavi distinte in Google Cloud > Credenziali > Chiave API. Non riusarne
una sola: le restrizioni sono diverse e incompatibili fra loro.

1. **`GOOGLE_MAPS_ANDROID_KEY`**
   - Restrizioni applicazione: *App Android*, con package
     `com.giuseppetedone.quattro` + SHA-1 (aggiungi anche `.dev`/`.preview` e il
     SHA-1 di debug se vuoi la mappa nel development build).
   - Restrizioni API: solo **Maps SDK for Android**.
   - Va in `.env` come variabile di build, letta da `app.config.ts`.
2. **`GOOGLE_MAPS_IOS_KEY`**
   - Restrizioni applicazione: *App iOS*, con bundle id
     `com.giuseppetedone.quattro`.
   - Restrizioni API: solo **Maps SDK for iOS**.
   - Va in `.env` come variabile di build.
3. **`GOOGLE_PLACES_KEY`**
   - Restrizioni API: solo **Places API (New)**.
   - **Nessuna restrizione per applicazione e' possibile**: e' una chiave
     server. Per questo non entra nel bundle in nessuna forma e vive
     **solo** come secret delle Edge Function:

     ```bash
     supabase secrets set GOOGLE_PLACES_KEY=AIza...
     supabase secrets set RESEND_API_KEY=re_...
     ```

     L'elenco completo dei secret e dei comandi di deploy e' in
     `supabase/functions/README.md`.

### 5. Development build

```bash
# Android: emulatore o dispositivo collegato
npx expo run:android

# iOS: solo su macOS con Xcode
npx expo run:ios
```

Poi, per lavorare:

```bash
npm start          # expo start --dev-client
```

### Perche' Expo Go non si puo' usare

Due motivi indipendenti, e basta uno dei due.

1. **Expo Go sugli store e' fermo all'SDK 54.** Questo progetto e' su SDK 57:
   il bundle non e' nemmeno compatibile, l'app si rifiuta di aprirlo.
2. Anche se le versioni combaciassero, **Expo Go contiene solo i moduli nativi
   che Expo ha deciso di includere**. Qui servono `react-native-maps` con
   Google Maps (su iOS e' un SDK nativo linkato staticamente) e
   `@react-native-google-signin/google-signin` (che ha bisogno dello URL scheme
   inverso dichiarato nel binario). Nessuno dei due esiste in Expo Go.

Il development build e' un'app tua che include quei moduli e carica il codice
JavaScript dal server di sviluppo: si costruisce una volta e poi si usa come si
usava Expo Go.

## Struttura delle cartelle

```
app/                 SOLO routing e composizione (expo-router, file = rotta).
                     Nessuna logica di dominio: ogni schermata compone
                     componenti da features/.
  (auth)/            accesso e registrazione
  (onboarding)/      scelta username e tema
  (app)/(tabs)/      le schede principali
  (app)/group/       dettaglio gruppo
  (app)/place/       dettaglio luogo
  (app)/review/      il flusso di recensione in quattro passi
  invite/            atterraggio del deep link quattro://invite/{token}

features/            un dominio per cartella: auth, groups, invitations,
                     places, profile, reviews. Ogni dominio ha components/,
                     hooks/, schema.ts. Le feature NON si importano fra loro:
                     cio' che serve a due domini sale in components/ o lib/.

components/          riutilizzabili e senza dominio: ui/, layout/, icons/.
theme/               token, tipografia, palette. Vietati i colori letterali
                     fuori da theme/palettes/ (lo blocca ESLint).
lib/                 supabase.ts, queryClient.ts, queryKeys.ts, store.ts,
                     photos.ts, errors.ts, format.ts, database.types.ts.

supabase/
  migrations/        0001..0007, da applicare in ordine
  tests/             rls.test.sql (pgTAP, 53 asserzioni) + _local_stub.sql
  functions/         cinque Edge Function Deno + _shared/
  config.toml        configurazione dello stack locale

maestro/             otto flussi E2E (specifiche, vedi maestro/README.md)
.github/workflows/   ci, android-apk, ios-unsigned-ipa, ota-update
__tests__/           test unitari (calcoli, tema, schemi)
```

Le convenzioni vincolanti sono in `CONVENTIONS.md`. Vale la pena leggerlo prima
di scrivere codice: le regole su import, tema e accessibilita' sono applicate
da ESLint e dai tipi, non solo consigliate.

## Verifica

```bash
npm run verify        # typecheck + lint + jest, tutto insieme

npx tsc --noEmit      # 0 errori
npx eslint . --max-warnings=0
npx jest

# Database: applica le migrazioni e lancia le 53 asserzioni pgTAP.
supabase start
supabase test db supabase/tests/rls.test.sql

# I tipi devono coincidere con lo schema.
npm run db:types && git diff --exit-code -- lib/database.types.ts
```

Il file di test si nomina esplicitamente: `supabase test db` senza argomenti
passerebbe a pg_prove tutta la cartella `supabase/tests`, compreso
`_local_stub.sql`, che non e' un test ma l'emulazione di Supabase per chi gira
la suite su un Postgres nudo. Vale anche per lo script `npm run db:test`, che
esegue il comando senza argomenti.

`supabase test db` e' **bloccante in CI**, senza `continue-on-error`. Il motivo
e' scritto in testa a `supabase/tests/rls.test.sql`: la chiave con cui l'app
parla con il database e' pubblica, quindi le policy RLS sono l'unica barriera,
e una policy sbagliata non produce nessun errore visibile -- restituisce solo
piu' righe del dovuto.

## Distribuzione

Non passa dagli store. La pagina pubblica di installazione e' `docs/index.html`
(pubblicata su GitHub Pages, cartella `docs/`, ramo `master`): link diretti
all'ultima Release per Android e per iOS, piu' le istruzioni per attivare
"sorgenti sconosciute" o firmare con SideStore/Sideloadly.

### Android: APK universale

Workflow `.github/workflows/android-apk.yml`, manuale o su tag `v*`. Profilo
EAS `sideload`, che produce un APK unico (non un App Bundle) installabile
attivando "installa da sorgenti sconosciute".

Su un push di tag `v*` il workflow allega l'APK a una **Release GitHub**
(`softprops/action-gh-release`), che a differenza di un artefatto di Actions
non richiede il login per scaricarlo e resta a un URL stabile:
`.../releases/latest/download/bitemark.apk`, quello linkato dalla pagina di
installazione. Sul `workflow_dispatch` manuale (utile per il profilo
`preview`) resta solo l'artefatto del run, perche' non c'e' un tag da cui
creare la release.

**La keystore di release e' l'identita' dell'app, per sempre.** Fuori dal Play
Store non esiste il Play App Signing che ne tenga una copia: Android accetta un
aggiornamento solo se firmato con la stessa chiave del pacchetto installato. Se
la keystore si perde non c'e' recupero, e l'unica strada e' cambiare package
name e chiedere a tutti di disinstallare e reinstallare. Scaricala con
`eas credentials -p android` e conserva il `.jks` **con la password, fuori da
EAS e fuori dal repository**.

### iOS: IPA non firmata + SideStore

Workflow `.github/workflows/ios-unsigned-ipa.yml`, solo manuale, su runner
`macos-26` (gratuiti sui repository pubblici).

EAS Build **non puo'** produrre una IPA non firmata: i profili sono `store` e
`internal`, entrambi richiedono credenziali Apple, e la build per simulatore
non gira su hardware. Quindi il workflow archivia con `xcodebuild` disattivando
la firma e impacchetta `Payload/App.app` in uno zip rinominato `.ipa`. **Sei tu
a firmarla**, con SideStore, AltStore o Sideloadly e il tuo Apple ID.

Il workflow ha un input opzionale `tag`: se compilato con un tag di una
Release Android esistente (es. `v1.2.0`), allega anche la IPA a quella stessa
release invece di lasciarla solo come artefatto del run. Non e' obbligatorio
come per l'APK, perche' la IPA non e' comunque installabile senza rifirmarla,
ma tiene i due file scaricabili dallo stesso posto.

Cosa comporta, e va detto agli utenti prima e non dopo:

- un Apple ID gratuito (Personal Team) firma per **7 giorni**: dopo, l'app non
  si apre piu' e va rifirmata. SideStore lo fa da solo se il telefono e' sulla
  stessa rete del computer con SideServer attivo;
- massimo **3 app** sideloadate per Apple ID gratuito;
- **niente notifiche push**: richiedono l'entitlement `aps-environment`, che un
  Personal Team non concede. Per questo l'app non le usa affatto, e per lo
  stesso motivo non usa Universal Links (serve `associated-domains`): i deep
  link sono solo su schema `quattro://`, e gli inviti hanno un fallback web.

### Aggiornamenti OTA

Workflow `.github/workflows/ota-update.yml`, manuale. Pubblica su canale
`production` con `eas update`.

Viaggiano **solo JavaScript e asset**. Qualunque cambiamento nativo (una
dipendenza con codice nativo, un permesso, un plugin di config, l'SDK Expo)
richiede un binario nuovo, e `runtimeVersion` con policy `fingerprint`
garantisce che i client vecchi non scarichino un update incompatibile. Con il
sideload questo ha un costo concreto: **un binario nuovo su iOS significa che
ogni utente riscarica la IPA e la rifirma**. Vale la pena tenerlo presente
prima di aggiungere una dipendenza nativa.

### Verifica sviluppatore Android per l'installazione sideload

Su dispositivi certificati Google Play, Android puo' bloccare o segnalare
come rischiosa l'installazione di un APK che arriva da fuori Play Store se
chi l'ha firmato non e' un developer verificato. Per un progetto personale
come questo basta la fascia gratuita, via email, pensata per chi distribuisce
a un numero limitato di persone (soglia nell'ordine di ~20 dispositivi): non
serve il programma Play Console a pagamento, che e' un'altra cosa e serve
solo per pubblicare sullo store. Registrati con lo stesso account Google che
usi per il progetto (per coerenza con le chiavi API e Firebase, se aggiunte in
futuro) e conserva le credenziali insieme al resto (vedi sezione precedente
sulla keystore): se il sito o i requisiti sono cambiati rispetto a quanto
descritto qui, verifica sulla pagina ufficiale di Android Developer
Verification prima di procedere, perche' Google aggiorna periodicamente le
soglie e il flusso di registrazione.

### Secrets di GitHub Actions

I workflow leggono le variabili da `secrets.*` (vedi `env:` in ciascun file
`.github/workflows/*.yml`), non da `.env`: `.env` esiste solo per lo sviluppo
locale. Da impostare, su GitHub o con la CLI (`gh secret set NOME
--body "valore" --repo giuseppetedone02/quattro-mobile-cross`):

| Secret | Da dove viene |
| --- | --- |
| `EXPO_TOKEN` | Expo > Account Settings > Access Tokens: crea un token, non e' la password dell'account |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API, stesso valore di `.env` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard > Settings > API, stesso valore di `.env` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Cloud > Credenziali, client OAuth "Applicazione web" (punto 1 della sezione OAuth qui sopra) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google Cloud > Credenziali, client OAuth "iOS" (punto 2) |
| `GOOGLE_MAPS_ANDROID_KEY` | Google Cloud > Credenziali, chiave API ristretta a Maps SDK for Android |
| `GOOGLE_MAPS_IOS_KEY` | Google Cloud > Credenziali, chiave API ristretta a Maps SDK for iOS (usata solo dal workflow iOS) |
| `GOOGLE_IOS_URL_SCHEME` | Reversed client id del client OAuth iOS, `com.googleusercontent.apps.<numero>` (punto 2) |
| `EAS_PROJECT_ID` | `eas.json` non lo contiene: e' in `app.config.ts` sotto `extra.eas.projectId`, oppure `eas project:info` |

**Non vanno mai qui**, nemmeno per comodita': `GOOGLE_PLACES_KEY` e
`RESEND_API_KEY` restano solo secret delle Edge Function
(`supabase secrets set ...`, vedi sopra), perche' un secret di GitHub Actions
finisce comunque in variabili d'ambiente del runner e nessuna delle due chiavi
serve a una build client.

## Trappole

Cinque cose che costano un pomeriggio a testa se non le si sa.

### 1. `react-native-maps` deve essere >= 1.27.2 su Expo >= 55

Le versioni precedenti non compilano con la New Architecture sempre attiva.
L'errore che si ottiene e' in fase di build nativa e non nomina
`react-native-maps`, quindi sembra tutt'altro. La versione e' fissata a
`1.27.2` esatta in `package.json`: non allentarla a `^`.

### 2. Mai `useFrameworks: 'dynamic'`

In `expo-build-properties` la proprieta' iOS **deve** restare `'static'`.
L'SDK Google Maps per iOS e' linkato staticamente; con i framework dinamici
CocoaPods si ferma con *"transitive dependencies that include statically linked
binaries"*. E' l'issue `react-native-maps#5646`, chiusa come *not planned*:
non arrivera' una correzione.

### 3. Le chiavi Maps vanno SOLO nelle props del plugin

In `app.config.ts` stanno in `['react-native-maps', { iosGoogleMapsApiKey,
androidGoogleMapsApiKey }]` e **da nessun'altra parte**. Metterle anche in
`ios.config.googleMapsApiKey` o `android.config.googleMaps.apiKey` non e'
ridondanza innocua: su Android entrambi i percorsi scrivono *e rimuovono* lo
stesso `meta-data` nel manifest, e in base all'ordine dei mod uno dei due lo
cancella. Risultato: mappa grigia, nessun errore, chiave apparentemente
configurata.

### 4. Mai impostare `googleMapId`

Un Map ID attiva le mappe con stile cloud, che sono uno **SKU a pagamento
diverso** da quello delle mappe standard: si esce dal gratuito senza cambiare
una riga di codice funzionale e senza nessun avviso. Se serve personalizzare
l'aspetto della mappa, si usa `customMapStyle` lato client.

### 5. Con `set search_path = ''` anche i TIPI vanno qualificati

Tutte le funzioni SECURITY DEFINER del progetto hanno `set search_path = ''`
(e' cio' che le rende non dirottabili). In quella condizione Postgres non
risolve piu' **niente** senza schema, tipi compresi: si scrive `public.citext`,
non `citext`. La stessa cosa vale per gli enum, e per il risultato di un `CASE`
assegnato a una colonna enum, che ha bisogno di un cast esplicito
(`(case ... end)::public.invitation_status`), altrimenti Postgres deduce `text`
e rifiuta l'update.

Il punto che rende questa trappola cattiva: la funzione **si crea senza
errori**. Il problema si manifesta alla prima invocazione, in produzione, con
un messaggio (`type "citext" does not exist`) che sembra un problema di
estensioni mancanti. Le due correzioni sono gia' applicate in
`supabase/migrations/0005_rpc_and_triggers.sql` e commentate sul posto: non
vanno "semplificate".
