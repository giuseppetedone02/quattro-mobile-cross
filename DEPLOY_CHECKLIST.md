# Checklist di aggiornamento — Supabase + rebuild app

Non ho le credenziali (password del database, service role key) per applicare
questi cambi da qui: preparo tutto pronto, ma vanno eseguiti dal tuo computer,
dove il progetto e' gia' collegato (project ref: `uiuqdoaarjbwlcxrdyth`).

## 1. Migrazioni database da applicare

Tre migrazioni nuove in `supabase/migrations/`:

- **0008** — rinomina il gruppo personale predefinito in "I miei gusti" e
  sblocca la possibilita' di rinominare i gruppi (richieste 10 e 10.1).
- **0009** — corregge il bug per cui creare un gruppo dava "solo gli
  amministratori possono farlo" anche al creatore stesso (richiesta 15).
- **0010** — restringe la rimozione di un posto da un gruppo al solo
  amministratore quando ci sono altri membri (richiesta 14).

Dal tuo computer, nella cartella del progetto:

```
npx supabase db push
```

**Nota su 0005**: ho anche aggiornato il testo dentro
`0005_rpc_and_triggers.sql` (stesso nome di gruppo, solo per coerenza del
codice sorgente) — quella migrazione e' gia' stata applicata al database
remoto in passato, quindi `db push` non la ri-esegue. Se il CLI segnala un
avviso di "checksum" diverso su 0005, e' normale ed e' comunque sicuro
procedere: la funzione viene comunque riscritta correttamente da 0008. Se
il push si blocca invece di limitarsi ad avvisare, risolvi con:

```
npx supabase migration repair --status applied 0005
```

**Consigliato prima del push**: la suite di test pgTAP (bloccante, l'ho
aggiornata con 5 nuove verifiche per le richieste 14 e 15) si lancia con:

```
npx supabase test db
```

## 2. Redirect URL per il reset password (dashboard, non CLI)

`supabase/config.toml` ora include `quattro://auth/reset` tra gli
`additional_redirect_urls`, ma quel file vale solo per l'ambiente locale
(`supabase start`). Sul progetto remoto va aggiunto a mano:

**Dashboard → Authentication → URL Configuration → Redirect URLs** →
aggiungi `quattro://auth/reset`

Nello stesso punto trovi anche la causa del redirect a `localhost:3000`
della richiesta 3 (email di conferma): il "Site URL" e le redirect URL
configurate li' sono quelle che l'email di conferma usa davvero.

## 3. Cose che restano da fare a mano (non posso farle da qui)

- **Richiesta 3** — personalizzare il template dell'email di conferma
  (oggi e' quello generico di Supabase) e correggere il Site URL /
  redirect URL cosi' il link non punti piu' a `localhost:3000`.
- **Richiesta 12 (verifica)** — controlla che il secret della Edge
  Function sia impostato, e' la causa piu' probabile del "non-2xx" anche
  dopo il fix che ho fatto nel codice client:
  ```
  npx supabase secrets set GOOGLE_PLACES_KEY=<la_tua_chiave>
  ```

---

# Serve ribuildare l'app?

**Si, solo per l'icona/splash screen — tutto il resto no.**

- **Icona app, splash screen, colore di sfondo adattivo Android**: sono
  parti _native_ dell'app (vengono incorporate nel binario quando si
  compila), non nel bundle JavaScript. Per vederle serve una build vera:
  `eas build` (o `npx expo prebuild` + `npx expo run:android` / `run:ios`
  in locale). **Un semplice reload di Metro non le mostra mai.**
  Inoltre, se stai testando con **Expo Go**, l'icona personalizzata non si
  vedra' comunque: Expo Go mostra sempre la propria icona, indipendentemente
  da `app.config.ts`. Serve un dev client o una build standalone.

- **Le altre 14 modifiche** (testi, colori del tema, bug fix, form,
  RLS/database) sono tutte codice JavaScript/TypeScript o React Native:
  bastano un riavvio di Metro / fast refresh se stai sviluppando in
  locale, oppure un `eas update` (OTA) se vuoi spingerle a una build
  gia' installata senza rifare tutto il binario.

In pratica: se hai gia' in programma una build per vedere l'icona nuova,
in quella build ci saranno automaticamente anche tutte le altre modifiche.
Se invece vuoi vedere subito le altre 14 senza aspettare una build, puoi
farlo con un reload/OTA — solo l'icona restera' quella vecchia finche' non
la ricompili.

## Il modo piu' rapido per buildare in locale

Il progetto usa un dev client personalizzato (vedi `developmentClient: true`
nel profilo `development` di `eas.json`) — quindi niente Expo Go in ogni
caso, e le cartelle `android/`/`ios/` sono ignorate da git: si generano al
volo con il "prebuild" di Expo. La build cloud con `eas build` e' comoda ma
lenta (coda + build da zero ogni volta, spesso 10-20 minuti). In locale e'
molto piu' rapido, soprattutto dalla seconda volta in poi:

```
npx expo run:android
```

Cosa fa: rigenera il progetto Android nativo da `app.config.ts` (quindi
prende anche l'icona e lo splash nuovi), compila una APK di debug, la
installa sul device/emulatore collegato e avvia Metro — un solo comando.
La prima volta scarica le dipendenze Gradle e puo' metterci qualche minuto;
dalla seconda in poi la cache Gradle rende il tutto molto piu' veloce
(spesso sotto il minuto se non hai toccato codice nativo).

Serve pero' avere pronto in locale:

- **Android Studio** con l'Android SDK installato (e la variabile
  `ANDROID_HOME`/`ANDROID_SDK_ROOT` configurata — di solito lo fa
  l'installer di Android Studio).
- **un dispositivo Android collegato via USB con debug USB attivo**, oppure
  **un emulatore avviato** (Android Studio → Device Manager, oppure
  `emulator -avd <nome_avd>` da terminale).

Una volta installata l'app, lasciando Metro in esecuzione le modifiche al
codice JS/TS (14 delle 15 richieste) si vedono all'istante col fast
refresh, senza rilanciare nulla. Basta rilanciare `npx expo run:android`
quando cambi qualcosa di nativo (icona, splash, plugin, nuove dipendenze
native) — se lo rilanci comunque non fa danno, si accorge da solo di cosa
e' cambiato.

**Nota per iOS**: sei su Windows, quindi una build iOS locale non e'
possibile (serve un Mac con Xcode). Per iOS resta necessario `eas build
--platform ios` in cloud, oppure un Mac.

---

# Aggiornamento del 29 agosto 2026 — Edge Function e icone

## Edge Function `places-search` da rideployare

Il comando e' `npx supabase functions deploy places-search`, non
`supabase functions deploy places-search`: su Windows, se il CLI Supabase
non e' installato globalmente (e di solito non lo e' in questo progetto,
vedi sopra), PowerShell risponde con `CommandNotFoundException`. `npx`
scarica/usa il CLI senza bisogno di un'installazione globale.

Dalla cartella del progetto:

```
npx supabase functions deploy places-search
```

Corregge due bug della ricerca: prima non si attivava affatto se si
scriveva solo la localita' senza il nome del locale; poi, una volta
corretto quello, restituiva locali il cui NOME comincia con il testo della
localita' (es. "Bari" trovava "Barista's") invece dei locali che stanno
davvero in quella zona. Ora la localita' viene risolta in coordinate reali
prima di cercare.

## Icona e splash rigenerati (di nuovo)

`assets/icon.png`, `assets/icon-foreground.png` e `assets/splash-icon.png`
sono stati aggiornati: il logo era troppo piccolo sull'icona della home
(ora riempie l'80% del canvas su iOS/fallback e il 60% su Android, contro
il ~20% di prima) ed era troppo grande per il cerchio della nuova Splash
Screen di Android 12+ (ora ridotto al 52% del canvas). Come gia' notato
sopra: **servono una nuova build nativa** (`npx expo run:android` in
locale, o `eas build`) per vederli — un semplice reload di Metro non
mostra mai le icone, ed Expo Go le ignora comunque.

---

# Aggiornamento — sicurezza (1.3/1.4) e Sentry (3.2)

## Migrazioni database da applicare

Due migrazioni nuove in `supabase/migrations/`, non ancora eseguite contro
il progetto remoto:

- **0015** — cancellazione account (GDPR): soft delete con grace period di
  30 giorni. Aggiunge `profiles.deletion_requested_at`, le RPC
  `request_account_deletion()`/`cancel_account_deletion()`, e un job
  pg_cron notturno che chiama una Edge Function per la cancellazione
  definitiva di chi ha superato i 30 giorni (vedi sotto — **non e' piu**
  una funzione SQL che cancella direttamente, versione corretta dopo un
  errore trovato testando in locale).
- **0016** — moderazione recensioni: un admin di gruppo puo' ora cancellare
  la recensione (o una singola foto) di un altro membro.

```
npx supabase db push
```

**Prima del push**, consigliato far girare il test pgTAP dedicato (non e'
ancora agganciato al comando `supabase test db` di default, va nominato per
esteso):

```
npx supabase test db supabase/tests/account_deletion_and_moderation.test.sql
```

Verifica soprattutto il caso limite: chi possiede un gruppo condiviso con
altri membri NON deve poter cancellare l'account (distruggerebbe il gruppo
di tutti via cascade), ma torna a poterlo fare appena resta l'unico membro.

### Perche' la 0015 e' cambiata: un errore reale, trovato testando

La prima versione cancellava le righe di Storage (avatar, foto di
recensione) con un semplice `delete from storage.objects ...` dentro una
funzione SQL. Facendo girare il test in locale e' emerso che le
installazioni recenti di Supabase Storage hanno un trigger
(`storage.protect_delete`) che rifiuta QUALUNQUE cancellazione diretta su
quella tabella, fatta da SQL puro — anche in cascade da `auth.users` — con
l'errore `Direct deletion from storage tables is not allowed. Use the
Storage API instead.` Non e' un problema di permessi (la funzione era
`SECURITY DEFINER`): il trigger blocca l'operazione a prescindere da chi la
esegue.

La cancellazione vera dei file richiede la Storage API, che da SQL non e'
raggiungibile — da qui una nuova Edge Function, **`purge-deleted-accounts`**,
invocata ogni notte da pg_cron (via l'estensione `pg_net`, che fa
richieste HTTP da dentro Postgres) invece di una funzione SQL diretta. La
migrazione 0015 espone solo due funzioni di SOLA LETTURA
(`accounts_ready_for_purge()`, `storage_objects_pending_purge()`) che la
Edge Function interroga; cancella lei stessa i file (Storage API) e poi
l'utente (`auth.admin.deleteUser`), in quest'ordine — al contrario, il
cascade su `auth.users` proverebbe a cancellare le righe di Storage rimaste
e verrebbe rifiutato dallo stesso trigger.

**Da fare, oltre al push della migrazione:**

1. Deploy della nuova funzione (con `--no-verify-jwt`: non ha un JWT utente,
   e' invocata dal cron, non dall'app — stesso schema di `notify-invite`):
   ```
   npx supabase functions deploy purge-deleted-accounts --no-verify-jwt
   ```
2. Genera un segreto qualsiasi (es. `openssl rand -hex 32`) e impostalo come
   secret della funzione:
   ```
   npx supabase secrets set PURGE_CRON_SECRET=<il-segreto-generato>
   ```
3. **Inserisci lo STESSO segreto in Vault** (Dashboard → SQL Editor, oppure
   `psql`) — questo passaggio non puo' stare in un file di migrazione
   versionato su git, il segreto ci finirebbe in chiaro nella history:
   ```sql
   select vault.create_secret('<lo-stesso-segreto-di-sopra>', 'purge_cron_secret');
   ```
   Senza questo passaggio la migrazione 0015 non crea il job pg_cron (si
   ferma con un `NOTICE`, non fallisce) — puoi rieseguirla dopo aver
   creato il secret in Vault, oppure creare il job a mano copiando il
   blocco `cron.schedule(...)` dalla migrazione.
4. Verifica che l'URL nel job pg_cron (dentro 0015) corrisponda al tuo
   progetto: `https://uiuqdoaarjbwlcxrdyth.supabase.co/functions/v1/purge-deleted-accounts`
   — e' lo stesso ref che vedi in `EXPO_PUBLIC_SUPABASE_URL` nel tuo `.env`.

## Sentry (crash reporting)

Il codice e' pronto (`@sentry/react-native` installato, inizializzato in
`app/_layout.tsx`, con un `ErrorBoundary` che mostra un fallback invece
dello schermo bianco) ma **senza un progetto Sentry vero non fa nulla** —
di proposito, per non far fallire l'app se il DSN manca. Da fare:

1. Crea un progetto su [sentry.io](https://sentry.io) (piano gratuito),
   piattaforma **React Native**.
2. Copia il DSN (Settings → Client Keys) e incollalo in `.env`:
   ```
   EXPO_PUBLIC_SENTRY_DSN=https://....ingest.sentry.io/...
   ```
   e come EAS secret per le build cloud:
   ```
   eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "https://...."
   ```
3. **Facoltativo ma consigliato** per stack trace leggibili (non minificati)
   nelle build di produzione: crea un Auth Token su Sentry (Settings →
   Auth Tokens, scope `project:releases`) e imposta tre secret EAS in piu' —
   senza questi il plugin salta silenziosamente l'upload dei sourcemap,
   l'app funziona comunque:
   ```
   eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value "..."
   eas secret:create --scope project --name SENTRY_ORG --value "il-tuo-org-slug"
   eas secret:create --scope project --name SENTRY_PROJECT --value "il-nome-progetto"
   ```
4. Verifica che funzioni: dopo una build con il DSN impostato, forza un
   errore (es. un bottone di test che lancia `throw new Error('test')`,
   da rimuovere subito dopo) e controlla che compaia sulla dashboard
   sentry.io entro un minuto.

Nessuna migrazione o comando da eseguire per questa voce oltre ai secret:
e' solo codice + configurazione.
