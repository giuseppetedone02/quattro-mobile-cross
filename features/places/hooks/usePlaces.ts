import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { friendlyError } from '@/lib/errors';
import type { Place, PlaceScores, PlaceSource } from '@/lib/database.types';
import { getPlaceDetails, type GooglePlaceDetails } from '@/features/places/api/googlePlaces';
import type { PlacePhotoDraft } from '@/features/places/schema';

/**
 * Le query non usano gli embed di PostgREST (`select('*, places(*)')`) ma piu'
 * chiamate unite lato client. Motivo concreto: i tipi generati espongono
 * `Relationships: []`, quindi l'inferenza di un embed produce
 * SelectQueryError<"could not find the relation ..."> e il progetto non
 * compila. Unire tre `select` piatti costa una andata e ritorno in piu' e
 * resta interamente tipizzato, senza un solo `as any`.
 */

export type PlaceListItem = {
  place: Place;
  scores: PlaceScores | null;
  /** Quando il posto e' stato aggiunto a QUESTO gruppo. */
  addedAt: string;
};

/** Ultima recensione prima, poi ordine alfabetico: la lista mette in cima
 *  quello di cui si e' parlato per ultimo, non quello inserito per ultimo. */
export function sortPlaceItems(items: PlaceListItem[]): PlaceListItem[] {
  return [...items].sort((a, b) => {
    const aLast = a.scores?.last_review_at ?? null;
    const bLast = b.scores?.last_review_at ?? null;
    if (aLast !== bLast) {
      if (aLast === null) return 1;
      if (bLast === null) return -1;
      return bLast.localeCompare(aLast);
    }
    return a.place.name.localeCompare(b.place.name, 'it');
  });
}

export function usePlaces(groupId: string | undefined) {
  return useQuery({
    queryKey: qk.places(groupId ?? 'none'),
    enabled: Boolean(groupId),
    queryFn: async (): Promise<PlaceListItem[]> => {
      const gid = groupId as string;

      const links = await supabase
        .from('group_places')
        .select('place_id, added_at')
        .eq('group_id', gid);
      if (links.error) throw links.error;

      const rows = links.data ?? [];
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.place_id);
      const [placesRes, scoresRes] = await Promise.all([
        supabase.from('places').select('*').in('id', ids),
        supabase.from('v_place_scores').select('*').eq('group_id', gid),
      ]);
      if (placesRes.error) throw placesRes.error;
      if (scoresRes.error) throw scoresRes.error;

      const scoresByPlace = new Map<string, PlaceScores>();
      for (const row of scoresRes.data ?? []) {
        if (row.place_id) scoresByPlace.set(row.place_id, row);
      }
      const addedAtByPlace = new Map(rows.map((r) => [r.place_id, r.added_at]));

      const items: PlaceListItem[] = (placesRes.data ?? []).map((place) => ({
        place,
        scores: scoresByPlace.get(place.id) ?? null,
        addedAt: addedAtByPlace.get(place.id) ?? place.created_at,
      }));

      return sortPlaceItems(items);
    },
  });
}

export function usePlace(placeId: string | undefined) {
  return useQuery({
    queryKey: qk.place(placeId ?? 'none'),
    enabled: Boolean(placeId),
    queryFn: async (): Promise<Place> => {
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('id', placeId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function usePlaceScores(groupId: string | undefined, placeId: string | undefined) {
  return useQuery({
    queryKey: qk.scores(groupId ?? 'none', placeId ?? 'none'),
    enabled: Boolean(groupId && placeId),
    queryFn: async (): Promise<PlaceScores | null> => {
      const { data, error } = await supabase
        .from('v_place_scores')
        .select('*')
        .eq('group_id', groupId as string)
        .eq('place_id', placeId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/**
 * Dati ufficiali live, mai persistiti: la chiave inizia con 'google' e
 * persistOptions scarta quel sottoalbero dalla cache su disco. gcTime corto
 * perche' i nomi delle foto scadono e la valutazione cambia.
 */
export function useGooglePlaceDetails(googlePlaceId: string | null | undefined) {
  return useQuery({
    queryKey: qk.google(googlePlaceId ?? 'none'),
    enabled: Boolean(googlePlaceId),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: (): Promise<GooglePlaceDetails> => getPlaceDetails(googlePlaceId as string),
  });
}

export type AddPlaceInput = {
  groupId: string;
  name: string;
  address: string | null;
  cuisine: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  source: PlaceSource;
  coverPhoto: PlacePhotoDraft | null;
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user.id;
  if (!id) throw new Error('Sessione scaduta. Accedi di nuovo.');
  return id;
}

/**
 * Inserimento in due passi: prima `places`, poi `group_places`.
 *
 * Non e' atomico e non puo' esserlo dal client, quindi il secondo passo ha un
 * messaggio d'errore che dice esattamente cosa e' successo: il posto esiste,
 * manca solo il collegamento al gruppo. Senza questa distinzione l'utente
 * riproverebbe da zero e creerebbe un doppione.
 *
 * Deduplica: con un google_place_id si cerca prima una riga esistente. Il
 * vincolo unique su places.google_place_id la renderebbe comunque impossibile
 * da duplicare, ma un errore 23505 non e' una risposta utile -- il posto
 * "gia' inserito da un altro gruppo" va riusato, non rifiutato.
 */
export function useAddPlace() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddPlaceInput): Promise<Place> => {
      const userId = await currentUserId();

      let place: Place | null = null;

      if (input.googlePlaceId) {
        const existing = await supabase
          .from('places')
          .select('*')
          .eq('google_place_id', input.googlePlaceId)
          .maybeSingle();
        if (existing.error) throw existing.error;
        place = existing.data ?? null;
      }

      if (!place) {
        const inserted = await supabase
          .from('places')
          .insert({
            name: input.name.trim(),
            address: input.address,
            cuisine: input.cuisine,
            notes: input.notes,
            lat: input.lat,
            lng: input.lng,
            google_place_id: input.googlePlaceId,
            source: input.source,
            created_by: userId,
            coords_refreshed_at:
              input.lat != null && input.lng != null ? new Date().toISOString() : null,
          })
          .select('*')
          .single();
        if (inserted.error) throw inserted.error;
        place = inserted.data;
      }

      const link = await supabase
        .from('group_places')
        .insert({ group_id: input.groupId, place_id: place.id, added_by: userId });

      // 23505 = era gia' nel gruppo: l'esito voluto e' identico, non e' un errore.
      if (link.error && link.error.code !== '23505') {
        const detail = friendlyError(link.error, 'places').message;
        throw new Error(
          `Il posto e' stato salvato ma non e' stato aggiunto al gruppo. ${detail} Riprova ad aggiungerlo dal gruppo.`,
        );
      }

      return place;
    },
    onSuccess: (place) => {
      qc.setQueryData(qk.place(place.id), place);
    },
    onSettled: (_place, _error, input) => {
      void qc.invalidateQueries({ queryKey: qk.places(input.groupId) });
    },
    onError: (e) => friendlyError(e, 'places'),
  });
}

export type UpdatePlaceInput = {
  placeId: string;
  /** Passalo se il posto e' visibile in una lista: serve solo per
   *  l'aggiornamento ottimistico di quella lista. */
  groupId?: string;
  values: {
    name?: string;
    address?: string | null;
    cuisine?: string | null;
    notes?: string | null;
    cover_photo_path?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
};

export function useUpdatePlace() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ placeId, values }: UpdatePlaceInput): Promise<Place> => {
      const { data, error } = await supabase
        .from('places')
        .update(values)
        .eq('id', placeId)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ placeId, groupId, values }: UpdatePlaceInput) => {
      await qc.cancelQueries({ queryKey: qk.place(placeId) });
      const previousPlace = qc.getQueryData<Place>(qk.place(placeId));
      const listKey = groupId ? qk.places(groupId) : null;
      const previousList = listKey ? qc.getQueryData<PlaceListItem[]>(listKey) : undefined;

      if (previousPlace) {
        qc.setQueryData<Place>(qk.place(placeId), { ...previousPlace, ...values });
      }
      if (listKey && previousList) {
        qc.setQueryData<PlaceListItem[]>(
          listKey,
          previousList.map((item) =>
            item.place.id === placeId ? { ...item, place: { ...item.place, ...values } } : item,
          ),
        );
      }

      return { previousPlace, listKey, previousList };
    },
    onError: (e, _input, context) => {
      if (context?.previousPlace) {
        qc.setQueryData(qk.place(context.previousPlace.id), context.previousPlace);
      }
      if (context?.listKey && context.previousList) {
        qc.setQueryData(context.listKey, context.previousList);
      }
      return friendlyError(e, 'places');
    },
    onSettled: (_place, _error, { placeId, groupId }) => {
      void qc.invalidateQueries({ queryKey: qk.place(placeId) });
      if (groupId) void qc.invalidateQueries({ queryKey: qk.places(groupId) });
    },
  });
}

/**
 * Toglie il posto DAL GRUPPO. La riga di `places` resta: puo' essere
 * inserita in altri gruppi e le recensioni degli altri non sono nostre da
 * cancellare.
 */
export function useRemovePlaceFromGroup() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ groupId, placeId }: { groupId: string; placeId: string }) => {
      const { error } = await supabase
        .from('group_places')
        .delete()
        .eq('group_id', groupId)
        .eq('place_id', placeId);
      if (error) throw error;
    },
    onMutate: async ({ groupId, placeId }) => {
      const listKey = qk.places(groupId);
      await qc.cancelQueries({ queryKey: listKey });
      const previousList = qc.getQueryData<PlaceListItem[]>(listKey);
      if (previousList) {
        qc.setQueryData<PlaceListItem[]>(
          listKey,
          previousList.filter((item) => item.place.id !== placeId),
        );
      }
      return { listKey, previousList };
    },
    onError: (e, _input, context) => {
      if (context?.previousList) qc.setQueryData(context.listKey, context.previousList);
      return friendlyError(e, 'places');
    },
    onSettled: (_data, _error, { groupId }) => {
      void qc.invalidateQueries({ queryKey: qk.places(groupId) });
    },
  });
}

export type LinkPlaceInput = {
  placeId: string;
  googlePlaceId: string;
  /** true = i dati ufficiali sostituiscono quelli inseriti a mano.
   *  false = il collegamento avviene comunque e official_override_pending
   *  resta true, cosi' il pulsante di sostituzione resta disponibile. */
  overwrite: boolean;
  officialName?: string | null;
  officialAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Per invalidare la lista del gruppo da cui si arriva. */
  groupId?: string;
};

export function useLinkPlaceToGoogle() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: LinkPlaceInput): Promise<Place> => {
      const { data, error } = await supabase.rpc('link_place_to_google', {
        p_place_id: input.placeId,
        p_google_place_id: input.googlePlaceId,
        p_overwrite: input.overwrite,
        p_official_name: input.officialName ?? null,
        p_official_address: input.officialAddress ?? null,
        p_lat: input.lat ?? null,
        p_lng: input.lng ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (place) => {
      qc.setQueryData(qk.place(place.id), place);
    },
    onSettled: (_place, _error, input) => {
      void qc.invalidateQueries({ queryKey: qk.place(input.placeId) });
      if (input.groupId) void qc.invalidateQueries({ queryKey: qk.places(input.groupId) });
    },
    onError: (e) => friendlyError(e, 'places'),
  });
}
