import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { friendlyError } from '@/lib/errors';
import { BUCKETS, uploadPhoto } from '@/lib/photos';
import { costPerPerson } from '@/lib/format';
import type { Criterion } from '@/theme/tokens';
import type { Profile, Review, ReviewPhoto } from '@/lib/database.types';
import {
  clampScore,
  criterionExtremes,
  overallScore,
  roundLikeDb,
  type Scores,
} from '@/features/reviews/scoring';
import type { ReviewPhotoDraft } from '@/features/reviews/schema';

/**
 * Come in usePlaces, nessun embed PostgREST: i tipi generati hanno
 * Relationships vuote e un `select('*, profiles(*)')` non compilerebbe.
 * Le recensioni, i profili degli autori e le foto arrivano da tre select
 * piatte unite qui.
 */

export type ReviewAuthor = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'>;

export type ReviewWithAuthor = {
  review: Review;
  author: ReviewAuthor;
  photos: ReviewPhoto[];
};

const AUTHOR_COLUMNS = 'id, username, display_name, avatar_path';

function unknownAuthor(id: string): ReviewAuthor {
  // Un profilo cancellato non deve far sparire la recensione dalla lista.
  return { id, username: null, display_name: null, avatar_path: null };
}

export function useReviews(groupId: string | undefined, placeId: string | undefined) {
  return useQuery({
    queryKey: qk.reviews(groupId ?? 'none', placeId ?? 'none'),
    enabled: Boolean(groupId && placeId),
    queryFn: async (): Promise<ReviewWithAuthor[]> => {
      const reviewsRes = await supabase
        .from('reviews')
        .select('*')
        .eq('group_id', groupId as string)
        .eq('place_id', placeId as string)
        .order('created_at', { ascending: false });
      if (reviewsRes.error) throw reviewsRes.error;

      const reviews = reviewsRes.data ?? [];
      if (reviews.length === 0) return [];

      const authorIds = [...new Set(reviews.map((r) => r.author_id))];
      const reviewIds = reviews.map((r) => r.id);

      const [authorsRes, photosRes] = await Promise.all([
        supabase.from('profiles').select(AUTHOR_COLUMNS).in('id', authorIds),
        supabase
          .from('review_photos')
          .select('*')
          .in('review_id', reviewIds)
          .order('position', { ascending: true }),
      ]);
      if (authorsRes.error) throw authorsRes.error;
      if (photosRes.error) throw photosRes.error;

      const authorsById = new Map<string, ReviewAuthor>();
      for (const author of authorsRes.data ?? []) authorsById.set(author.id, author);

      const photosByReview = new Map<string, ReviewPhoto[]>();
      for (const photo of photosRes.data ?? []) {
        const list = photosByReview.get(photo.review_id) ?? [];
        list.push(photo);
        photosByReview.set(photo.review_id, list);
      }

      return reviews.map((review) => ({
        review,
        author: authorsById.get(review.author_id) ?? unknownAuthor(review.author_id),
        photos: photosByReview.get(review.id) ?? [],
      }));
    },
  });
}

export function useMyReview(
  groupId: string | undefined,
  placeId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: qk.myReview(groupId ?? 'none', placeId ?? 'none'),
    enabled: Boolean(groupId && placeId && userId),
    queryFn: async (): Promise<Review | null> => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('group_id', groupId as string)
        .eq('place_id', placeId as string)
        .eq('author_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export type SubmitReviewInput = {
  groupId: string;
  placeId: string;
  authorId: string;
  scores: Scores;
  billTotalCents: number | null;
  partySize: number | null;
  comment: string | null;
  visitedOn: string | null;
  photos: ReviewPhotoDraft[];
};

/**
 * Una recensione per persona, per luogo, per gruppo (decisione 22.4): la
 * seconda visita AGGIORNA la prima, non ne crea un'altra. Da qui l'upsert su
 * (group_id, place_id, author_id): senza onConflict il vincolo unique
 * risponderebbe 23505 e l'utente vedrebbe un errore invece di una modifica.
 */
export function useSubmitReview() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitReviewInput): Promise<Review> => {
      const upserted = await supabase
        .from('reviews')
        .upsert(
          {
            group_id: input.groupId,
            place_id: input.placeId,
            author_id: input.authorId,
            score_location: clampScore(input.scores.location),
            score_service: clampScore(input.scores.service),
            score_menu: clampScore(input.scores.menu),
            score_value: clampScore(input.scores.value),
            bill_total_cents: input.billTotalCents,
            party_size: input.partySize,
            comment: input.comment,
            visited_on: input.visitedOn,
          },
          { onConflict: 'group_id,place_id,author_id' },
        )
        .select('*')
        .single();
      if (upserted.error) throw upserted.error;
      const review = upserted.data;

      if (input.photos.length > 0) {
        // La posizione riprende da quelle gia' presenti: modificando una
        // recensione le foto nuove si aggiungono, non si rinumerano.
        const existing = await supabase
          .from('review_photos')
          .select('position')
          .eq('review_id', review.id);
        if (existing.error) throw existing.error;
        const start = (existing.data ?? []).reduce((max, p) => Math.max(max, p.position + 1), 0);

        const uploaded: {
          review_id: string;
          storage_path: string;
          position: number;
          width: number;
          height: number;
        }[] = [];
        for (const [index, photo] of input.photos.entries()) {
          // Il percorso include il gruppo: e' su quel prefisso che le policy
          // dello Storage verificano l'appartenenza.
          const path = `${input.groupId}/${review.id}/${Crypto.randomUUID()}.webp`;
          const saved = await uploadPhoto(BUCKETS.reviewPhotos, path, photo);
          uploaded.push({
            review_id: review.id,
            storage_path: saved.path,
            position: start + index,
            width: saved.width,
            height: saved.height,
          });
        }

        const inserted = await supabase.from('review_photos').insert(uploaded);
        if (inserted.error) throw inserted.error;
      }

      return review;
    },
    onMutate: async (input: SubmitReviewInput) => {
      const myKey = qk.myReview(input.groupId, input.placeId);
      const listKey = qk.reviews(input.groupId, input.placeId);
      await Promise.all([
        qc.cancelQueries({ queryKey: myKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ]);

      const previousMine = qc.getQueryData<Review | null>(myKey);
      const previousList = qc.getQueryData<ReviewWithAuthor[]>(listKey);

      const now = new Date().toISOString();
      const optimistic: Review = {
        id: previousMine?.id ?? `optimistic-${input.placeId}`,
        group_id: input.groupId,
        place_id: input.placeId,
        author_id: input.authorId,
        score_location: clampScore(input.scores.location),
        score_service: clampScore(input.scores.service),
        score_menu: clampScore(input.scores.menu),
        score_value: clampScore(input.scores.value),
        overall: roundLikeDb(overallScore(input.scores)),
        bill_total_cents: input.billTotalCents,
        party_size: input.partySize,
        comment: input.comment,
        visited_on: input.visitedOn,
        created_at: previousMine?.created_at ?? now,
        updated_at: now,
      };

      qc.setQueryData<Review | null>(myKey, optimistic);

      if (previousList) {
        const author =
          previousList.find((item) => item.review.author_id === input.authorId)?.author ??
          cachedAuthor(qc, input.authorId);
        const withoutMine = previousList.filter((item) => item.review.author_id !== input.authorId);
        const mine = previousList.find((item) => item.review.author_id === input.authorId);
        qc.setQueryData<ReviewWithAuthor[]>(listKey, [
          { review: optimistic, author, photos: mine?.photos ?? [] },
          ...withoutMine,
        ]);
      }

      return { myKey, listKey, previousMine, previousList };
    },
    onError: (e, _input, context) => {
      if (context) {
        qc.setQueryData(context.myKey, context.previousMine ?? null);
        if (context.previousList) qc.setQueryData(context.listKey, context.previousList);
      }
      return friendlyError(e, 'reviews');
    },
    onSettled: (_review, _error, input) => {
      void qc.invalidateQueries({ queryKey: qk.reviews(input.groupId, input.placeId) });
      void qc.invalidateQueries({ queryKey: qk.myReview(input.groupId, input.placeId) });
      void qc.invalidateQueries({ queryKey: qk.scores(input.groupId, input.placeId) });
      void qc.invalidateQueries({ queryKey: qk.places(input.groupId) });
      void qc.invalidateQueries({ queryKey: qk.stats(input.authorId) });
    },
  });
}

function cachedAuthor(qc: ReturnType<typeof useQueryClient>, authorId: string): ReviewAuthor {
  const profile = qc.getQueryData<Profile>(qk.profile(authorId));
  if (!profile) return unknownAuthor(authorId);
  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_path: profile.avatar_path,
  };
}

export type DeleteReviewInput = {
  reviewId: string;
  groupId: string;
  placeId: string;
  authorId: string;
};

export function useDeleteReview() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ reviewId }: DeleteReviewInput) => {
      const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
      if (error) throw error;
    },
    onMutate: async ({ reviewId, groupId, placeId }: DeleteReviewInput) => {
      const myKey = qk.myReview(groupId, placeId);
      const listKey = qk.reviews(groupId, placeId);
      await Promise.all([
        qc.cancelQueries({ queryKey: myKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ]);

      const previousMine = qc.getQueryData<Review | null>(myKey);
      const previousList = qc.getQueryData<ReviewWithAuthor[]>(listKey);

      if (previousMine?.id === reviewId) qc.setQueryData<Review | null>(myKey, null);
      if (previousList) {
        qc.setQueryData<ReviewWithAuthor[]>(
          listKey,
          previousList.filter((item) => item.review.id !== reviewId),
        );
      }

      return { myKey, listKey, previousMine, previousList };
    },
    onError: (e, _input, context) => {
      if (context) {
        qc.setQueryData(context.myKey, context.previousMine ?? null);
        if (context.previousList) qc.setQueryData(context.listKey, context.previousList);
      }
      return friendlyError(e, 'reviews');
    },
    onSettled: (_data, _error, input) => {
      void qc.invalidateQueries({ queryKey: qk.reviews(input.groupId, input.placeId) });
      void qc.invalidateQueries({ queryKey: qk.myReview(input.groupId, input.placeId) });
      void qc.invalidateQueries({ queryKey: qk.scores(input.groupId, input.placeId) });
      void qc.invalidateQueries({ queryKey: qk.places(input.groupId) });
      void qc.invalidateQueries({ queryKey: qk.stats(input.authorId) });
    },
  });
}

export type MoveReviewInput = {
  reviewId: string;
  sourceGroupId: string;
  targetGroupId: string;
  placeId: string;
};

/**
 * Spostamento tra gruppi (requisito 2.2.1). La RPC crea la riga group_places
 * di destinazione: il vincolo composito verso group_places la pretende.
 *
 * Si invalidano entrambi i sottoalberi ['group', id]: la recensione lascia una
 * lista ed entra in un'altra, e cambiano anche le medie dei due luoghi.
 */
export function useMoveReview() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ reviewId, targetGroupId }: MoveReviewInput): Promise<Review> => {
      const { data, error } = await supabase.rpc('move_review', {
        p_review_id: reviewId,
        p_target_group_id: targetGroupId,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ reviewId, sourceGroupId, placeId }: MoveReviewInput) => {
      const listKey = qk.reviews(sourceGroupId, placeId);
      await qc.cancelQueries({ queryKey: listKey });
      const previousList = qc.getQueryData<ReviewWithAuthor[]>(listKey);
      if (previousList) {
        qc.setQueryData<ReviewWithAuthor[]>(
          listKey,
          previousList.filter((item) => item.review.id !== reviewId),
        );
      }
      return { listKey, previousList };
    },
    onError: (e, _input, context) => {
      if (context?.previousList) qc.setQueryData(context.listKey, context.previousList);
      return friendlyError(e, 'reviews');
    },
    onSettled: (_review, _error, input) => {
      void qc.invalidateQueries({ queryKey: qk.group(input.sourceGroupId) });
      void qc.invalidateQueries({ queryKey: qk.group(input.targetGroupId) });
    },
  });
}

export type MyStats = {
  totalReviews: number;
  averageOverall: number | null;
  averageCostPerPersonCents: number | null;
  harshest: { criterion: Criterion; average: number } | null;
  kindest: { criterion: Criterion; average: number } | null;
};

/**
 * "I tuoi numeri" del profilo. L'aggregazione e' lato client su tutte le
 * recensioni dell'utente: a queste dimensioni (decine, non milioni) e' piu'
 * semplice di una vista dedicata, e resta disponibile offline dalla cache.
 */
export function useMyStats(userId: string | undefined) {
  return useQuery({
    queryKey: qk.stats(userId ?? 'none'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyStats> => {
      const { data, error } = await supabase
        .from('reviews')
        .select(
          'score_location, score_service, score_menu, score_value, overall, bill_total_cents, party_size',
        )
        .eq('author_id', userId as string);
      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) {
        return {
          totalReviews: 0,
          averageOverall: null,
          averageCostPerPersonCents: null,
          harshest: null,
          kindest: null,
        };
      }

      const overallSum = rows.reduce((acc, r) => acc + r.overall, 0);

      const perPerson = rows
        .map((r) => costPerPerson(r.bill_total_cents, r.party_size))
        .filter((c): c is number => c != null);

      const extremes = criterionExtremes(
        rows.map((r) => ({
          location: r.score_location,
          service: r.score_service,
          menu: r.score_menu,
          value: r.score_value,
        })),
      );

      return {
        totalReviews: rows.length,
        averageOverall: roundLikeDb(overallSum / rows.length),
        averageCostPerPersonCents:
          perPerson.length > 0
            ? Math.round(perPerson.reduce((acc, c) => acc + c, 0) / perPerson.length)
            : null,
        harshest: extremes?.harshest ?? null,
        kindest: extremes?.kindest ?? null,
      };
    },
  });
}

export type GroupLeaderboard = {
  topReviewer: { author: ReviewAuthor; reviewCount: number } | null;
  topPlace: { placeId: string; placeName: string; avgOverall: number; reviewCount: number } | null;
};

/** Mese di calendario in UTC: coerente e a costo zero, non serve altro per
 *  una statistica "questo mese" a bassa posta in gioco come questa. */
function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Classifica di gruppo (requisito 2.4): chi ha recensito di piu' e il posto
 * con la media piu' alta, nel mese in corso, nel gruppo attivo. Stessa
 * infrastruttura di useMyStats -- aggregazione lato client su un volume
 * ridotto (le recensioni di un mese in un gruppo) -- query in piu', non una
 * vista dedicata.
 */
export function useGroupLeaderboard(groupId: string | undefined) {
  return useQuery({
    queryKey: qk.leaderboard(groupId ?? 'none'),
    enabled: Boolean(groupId),
    queryFn: async (): Promise<GroupLeaderboard> => {
      const monthStart = startOfMonthIso();
      const { data, error } = await supabase
        .from('reviews')
        .select('author_id, place_id, overall')
        .eq('group_id', groupId as string)
        .gte('created_at', monthStart);
      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) return { topReviewer: null, topPlace: null };

      const countByAuthor = new Map<string, number>();
      const byPlace = new Map<string, { sum: number; count: number }>();
      for (const row of rows) {
        countByAuthor.set(row.author_id, (countByAuthor.get(row.author_id) ?? 0) + 1);
        const agg = byPlace.get(row.place_id) ?? { sum: 0, count: 0 };
        agg.sum += row.overall;
        agg.count += 1;
        byPlace.set(row.place_id, agg);
      }

      let topAuthorId: string | null = null;
      let topAuthorCount = 0;
      for (const [id, count] of countByAuthor) {
        if (count > topAuthorCount) {
          topAuthorId = id;
          topAuthorCount = count;
        }
      }

      let topPlaceId: string | null = null;
      let topPlaceAvg = -Infinity;
      let topPlaceCount = 0;
      for (const [id, agg] of byPlace) {
        const avg = agg.sum / agg.count;
        if (avg > topPlaceAvg) {
          topPlaceId = id;
          topPlaceAvg = avg;
          topPlaceCount = agg.count;
        }
      }

      const [authorRes, placeRes] = await Promise.all([
        topAuthorId
          ? supabase.from('profiles').select(AUTHOR_COLUMNS).eq('id', topAuthorId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        topPlaceId
          ? supabase.from('places').select('name').eq('id', topPlaceId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (authorRes.error) throw authorRes.error;
      if (placeRes.error) throw placeRes.error;

      return {
        topReviewer: topAuthorId
          ? {
              author: authorRes.data ?? unknownAuthor(topAuthorId),
              reviewCount: topAuthorCount,
            }
          : null,
        topPlace:
          topPlaceId && placeRes.data
            ? {
                placeId: topPlaceId,
                placeName: placeRes.data.name,
                avgOverall: roundLikeDb(topPlaceAvg),
                reviewCount: topPlaceCount,
              }
            : null,
      };
    },
  });
}
