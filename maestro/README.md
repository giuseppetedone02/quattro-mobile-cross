# Flussi Maestro

Otto flussi end-to-end, uno per file, in ordine di dipendenza logica.

**Questi file sono specifiche, non test che passano oggi.** Sono stati scritti
insieme allo schema e alle Edge Function, prima che l'interfaccia esponesse i
`testID`: i selettori qui sotto descrivono cosa l'app deve rendere
raggiungibile, e finche' quei `testID` non esistono i flussi falliscono sul
primo `tapOn`. Il valore non e' nell'esecuzione immediata: e' che il percorso
critico e' scritto da qualche parte, con dentro il motivo per cui ogni
asserzione conta.

## Esecuzione

```bash
# Installazione (una volta)
curl -fsSL https://get.maestro.mobile.dev | bash

# Serve un development build installato su emulatore o dispositivo:
# Expo Go non va (vedi README principale).
npx expo run:android            # oppure run:ios

maestro test maestro/                       # tutti
maestro test maestro/05-review-four-steps.yaml
maestro studio                              # ispettore interattivo dei testID
```

`appId` e' `com.giuseppetedone.quattro`, cioe' il package/bundle del profilo
**sideload**. Per provare su un build `development` o `preview` va cambiato in
`com.giuseppetedone.quattro.dev` o `.preview`.

## I flussi

| File | Cosa copre | Note |
| --- | --- | --- |
| `01-signup-email.yaml` | registrazione email + onboarding username | si interrompe alla conferma email (manuale) |
| `02-signin-google.yaml` | accesso Google e onboarding senza username | il selettore account e' interfaccia di sistema |
| `03-create-group-and-invite.yaml` | gruppo condiviso e invito | verifica anche che il gruppo personale non si inviti |
| `04-add-place-from-google.yaml` | ricerca e aggiunta da Google Places | attraversa le tre Edge Function |
| `05-review-four-steps.yaml` | la recensione in quattro passi | media 7.50 calcolata dal database |
| `06-manual-place-and-sync.yaml` | luogo manuale e collegamento a Google | il caso del RIFIUTO della sostituzione |
| `07-move-review-between-groups.yaml` | spostamento recensione | invalidazione cache su due gruppi |
| `08-offline-cache.yaml` | uso senza rete | `setAirplaneMode` funziona solo su Android |

## testID che l'app deve esporre

Elenco completo di cio' che i flussi cercano. Convenzione: kebab-case,
`<area>-<elemento>`, e per gli elementi di lista un indice a partire da zero
(`place-row-0`) applicato all'elemento renderizzato, non alla riga di dati.

### Autenticazione e onboarding
- `auth-signin-screen` -- contenitore della schermata di accesso
- `auth-goto-signup` -- passa alla registrazione
- `auth-signup-email`, `auth-signup-password`, `auth-signup-submit`
- `auth-check-inbox` -- schermata "controlla la posta" dopo la registrazione
- `auth-google-button` -- accesso con Google
- `onboarding-username-input`
- `onboarding-username-ok` -- indicatore di username disponibile (risposta di
  `username_available`, quindi asincrono: i flussi lo attendono)
- `onboarding-username-error` -- username occupato o formato non valido
- `onboarding-username-submit`
- `onboarding-theme-sunset` -- una voce per tema; il pattern e'
  `onboarding-theme-<nome del tema>`
- `onboarding-finish`

### Navigazione
- `tab-groups` -- e per coerenza anche `tab-places`, `tab-map`, `tab-profile`,
  che i flussi attuali non toccano ma che servono per estenderli

### Gruppi
- `groups-list` -- la lista (serve per distinguere "lista vuota" da "lista
  assente", che offline sono cose diverse)
- `group-create-fab`, `group-create-name`, `group-create-description`,
  `group-create-submit`
- `group-detail-screen`
- `group-members-tab`
- `group-invite-button` -- **non deve esistere nel gruppo personale**
- `group-places-list`

### Inviti
- `invite-search-input`
- `invite-search-empty` -- stato vuoto, mostrato anche sotto i 3 caratteri
- `invite-result-0` -- risultato di `search_people`, indicizzato
- `invite-send-button`
- `invite-sent-confirmation`
- `invite-pending-0` -- invito pendente nella scheda membri

### Luoghi
- `place-add-fab`
- `place-search-google` -- scelta "cerca su Google"
- `place-add-manual` -- scelta "inserisci a mano"
- `place-search-input`
- `place-search-result-0`
- `place-search-empty` -- nessun risultato, incluso il caso sotto i 3 caratteri
- `place-search-offline` -- la ricerca richiede rete e non c'e'
- `place-manual-name`, `place-manual-address`, `place-manual-cuisine`,
  `place-manual-submit`
- `place-row-0` -- riga nella lista del gruppo
- `place-detail-screen`, `place-detail-name`, `place-detail-address`
- `place-photo-0` -- prima foto della griglia (le altre in lazy)
- `place-add-to-group-button`, `place-detail-in-group-badge`
- `place-detail-sync-google-button` -- collega un luogo manuale a Google
- `place-detail-google-linked-badge`
- `place-detail-use-official-button` -- visibile finche'
  `official_override_pending` e' true
- `place-detail-review-button` -- solo se l'utente non ha ancora recensito
- `place-detail-edit-review-button` -- al suo posto quando ha gia' recensito
- `place-scores-dial` -- le medie del gruppo

### Sincronizzazione con la scheda ufficiale
- `sync-confirm-dialog`
- `sync-keep-mine` -- rifiuta la sostituzione
- `sync-use-official` -- accetta

### Recensione
- `review-step-location`, `review-step-service`, `review-step-menu`,
  `review-step-value` -- contenitore di ciascuno dei quattro passi
- `review-score-1` ... `review-score-10` -- un id per voto
- `review-score-<n>-selected` -- lo stesso elemento quando e' selezionato
  (serve per verificare che tornando indietro il voto sia conservato)
- `review-next`, `review-back`, `review-submit`
- `review-next-disabled` -- lo stato disabilitato del pulsante avanti, perche'
  i quattro punteggi sono obbligatori
- `review-bill-total`, `review-party-size`, `review-comment`
- `review-card-0` -- recensione nella lista del luogo
- `review-move-button`, `review-move-sheet`, `review-move-confirm`,
  `review-move-done`
- `review-move-target-current` -- il gruppo corrente NON deve essere fra le
  destinazioni proposte

### Stato della rete
- `offline-banner` -- visibile quando la connessione manca, cosi' che l'utente
  sappia perche' i dati potrebbero essere vecchi

## Fixture attese

I flussi 03-08 danno per scontati:

- una sessione gia' attiva (eseguire prima `01` o `02`, oppure lasciare l'app
  loggata);
- un secondo utente registrato con username `maestro_due`, da invitare;
- un progetto Supabase raggiungibile, con le Edge Function deployate e i
  secret impostati: `04` e `06` chiamano davvero Google Places.

Non c'e' un seed automatico. Aggiungerlo (una RPC di reset riservata
all'ambiente di test, oppure un `supabase db reset` con dati) e' lavoro ancora
da fare.
