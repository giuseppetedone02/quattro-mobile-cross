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
  parti *native* dell'app (vengono incorporate nel binario quando si
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
