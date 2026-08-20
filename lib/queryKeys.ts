/**
 * Gerarchia esplicita delle chiavi: invalidare ['group', gid] invalida tutto
 * il sottoalbero di quel gruppo. Vale la disciplina di passare sempre da qui.
 */
export const qk = {
  session: () => ['session'] as const,
  profile: (id: string) => ['profile', id] as const,

  groups: () => ['groups'] as const,
  group: (id: string) => ['group', id] as const,
  members: (gid: string) => ['group', gid, 'members'] as const,

  invitesInbox: () => ['invites', 'inbox'] as const,
  invitesSent: (gid: string) => ['group', gid, 'invites'] as const,

  places: (gid: string) => ['group', gid, 'places'] as const,
  place: (id: string) => ['place', id] as const,

  reviews: (gid: string, pid: string) => ['group', gid, 'place', pid, 'reviews'] as const,
  myReview: (gid: string, pid: string) => ['group', gid, 'place', pid, 'my-review'] as const,
  scores: (gid: string, pid: string) => ['group', gid, 'place', pid, 'scores'] as const,

  stats: (uid: string) => ['stats', uid] as const,

  /** Ricerca persone da invitare: la query e' parte della chiave perche'
   *  ogni termine e' un risultato diverso e va messo in cache a se'. */
  people: (q: string) => ['people', 'search', q] as const,

  /** I dati Google NON si persistono nella cache su disco: ToS + scadono. */
  google: (placeId: string) => ['google', placeId] as const,
  googleSearch: (q: string, locality?: string) =>
    ['google', 'search', q, locality ?? ''] as const,
} as const;
