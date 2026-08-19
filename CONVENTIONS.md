# Convenzioni di codice — Quattro

Vincolanti. Servono a mantenere il progetto coerente e a non ripetere i
difetti di WantABook (vedi §2 del piano).

## Regole strutturali

1. **`app/` contiene SOLO routing e composizione.** Nessuna logica di dominio.
   Ogni schermata e' un guscio che compone componenti da `features/`.
2. **`features/*` non si importano tra loro.** Cio' che serve a due domini
   sale in `components/` o `lib/`.
3. **`lib/database.types.ts` non si modifica a mano** (in produzione e'
   generato da `npm run db:types`).

## Import

- Sempre alias `@/`, mai path relativi che escono dalla cartella corrente.
- `import { useTheme } from '@/theme'`
- `import { Text, Button, Card } from '@/components/ui'`
- `import { Screen, Header } from '@/components/layout'`
- `import { Icon } from '@/components/icons'`
- `import { supabase } from '@/lib/supabase'`
- `import { qk } from '@/lib/queryKeys'`
- `import { friendlyError } from '@/lib/errors'`

## Stile

- **VIETATI i colori letterali.** Sempre `useTheme().colors.*`. La regola
  ESLint `no-restricted-syntax` blocca `#rrggbb` fuori da `theme/palettes/`.
- Spaziature da `theme.spacing[1..8]`, raggi da `theme.radii`, tipografia
  passando `variant` a `<Text>`.
- Stili inline nell'array `style={[...]}`. Nessun `StyleSheet.create` globale:
  gli stili dipendono dal tema, che e' runtime.

## Accessibilita (non negoziabile)

- Ogni controllo con sola icona usa `<IconButton>`, il cui
  `accessibilityLabel` e' **obbligatorio nel tipo**.
- Target minimo 44x44 (gia' imposto da `Button`/`IconButton`).
- Testi che cambiano in modo asincrono: `accessibilityLiveRegion="polite"`.
- Grafica decorativa: `importantForAccessibility="no-hide-descendants"`.
- Niente emoji come unico contenuto di un controllo.

## Dati

- **Server state**: TanStack Query. **UI state persistito**: `lib/store.ts`
  (zustand). **UI state effimero**: `useState`.
- Chiavi di query SEMPRE da `qk` in `lib/queryKeys.ts`. Se serve una chiave
  nuova, aggiungila la'.
- Ogni mutazione fa **aggiornamento ottimistico**: `onMutate` salva lo stato
  precedente e lo applica subito, `onError` ripristina e mostra
  `friendlyError(e, '<tabella>')`, `onSettled` invalida.
- Errori sempre attraverso `friendlyError(e, context)`, mai `e.message` nudo.

## Convenzioni Supabase

- `supabase.from('tabella')` e' tipizzato: nessun `as any`.
- Le RPC si chiamano con `supabase.rpc('nome', { p_xxx: ... })`.
- I bucket stanno in `BUCKETS` di `@/lib/photos`.
- Le chiamate a Google Places passano SOLO dalle Edge Function, mai
  direttamente a `places.googleapis.com`.

## Lingua

- Testi visibili all'utente: **italiano**, seconda persona singolare.
- Commenti: italiano, e spiegano il **perche'**, non il cosa.
- Identificatori di codice: inglese.
- **Nei commenti e nelle stringhe non usare lettere accentate** (il progetto
  le evita per non incorrere in problemi di codifica negli strumenti di
  build): scrivi "perche'" e "puo'" con apostrofo, o riformula.

## Componenti disponibili

`Text` (variant: display/title/heading/subheading/body/bodyStrong/caption/label/score/scoreSmall),
`Button` (primary/secondary/ghost/danger, sm/md/lg), `IconButton`, `PressScale`,
`Card`, `Chip`, `Avatar`, `AvatarStack`, `Diamond` (micro/compact/hero),
`ScoreDial`, `ScoreBadge`, `CriterionBar`, `LoadingState`, `EmptyState`,
`ErrorState`, `Skeleton`, `PlaceRowSkeleton`, `SearchField`, `Field`,
`TextField`, `TextArea`, `ThemePreview`, `PhotoGrid`, `PhotoPicker`.

Icone disponibili (`IconName`): plus, search, close, check, chevronRight,
chevronLeft, chevronDown, arrowLeft, more, edit, trash, refresh, map, pin,
list, users, user, mail, camera, image, star, palette, logout, google,
external, warning, info, location, service, menu, receipt, move, link.

## Verifica

Prima di considerare finito qualsiasi lavoro:

    npx tsc --noEmit     # deve dare 0 errori
    npx jest             # deve essere verde
