import {
  parseAmountToCents,
  parseItalianDate,
  parsePartySize,
  progressiveScores,
  formatItalianDate,
  NEUTRAL_SCORE,
} from '@/features/reviews/schema';
import { validatePlaceForm, emptyPlaceForm } from '@/features/places/schema';
import { sortPlaceItems, type PlaceListItem } from '@/features/places/hooks/usePlaces';
import type { Place, PlaceScores } from '@/lib/database.types';

// Il client Supabase importa expo-sqlite (modulo nativo): in Node non si
// risolve, e questi test non ne toccano nemmeno una funzione.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('parseAmountToCents', () => {
  it('accetta virgola e punto', () => {
    expect(parseAmountToCents('12,50')).toBe(1250);
    expect(parseAmountToCents('12.50')).toBe(1250);
    expect(parseAmountToCents('12')).toBe(1200);
  });

  it('ignora i simboli di valuta e gli spazi', () => {
    expect(parseAmountToCents(' 8,90 EUR')).toBe(890);
  });

  it('restituisce null su vuoto o valore illeggibile', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('999999999')).toBeNull();
  });
});

describe('parsePartySize', () => {
  it('resta nei limiti del CHECK di Postgres', () => {
    expect(parsePartySize('4')).toBe(4);
    expect(parsePartySize('0')).toBeNull();
    expect(parsePartySize('51')).toBeNull();
    expect(parsePartySize('')).toBeNull();
  });
});

describe('parseItalianDate', () => {
  const today = new Date(2026, 2, 20);

  it('converte in ISO', () => {
    expect(parseItalianDate('12/03/2026', today)).toBe('2026-03-12');
    expect(parseItalianDate('1-3-2026', today)).toBe('2026-03-01');
  });

  it('rifiuta date inesistenti e future', () => {
    expect(parseItalianDate('31/02/2026', today)).toBeNull();
    expect(parseItalianDate('21/03/2026', today)).toBeNull();
    expect(parseItalianDate('marzo', today)).toBeNull();
  });

  it('e simmetrica con formatItalianDate', () => {
    expect(formatItalianDate(parseItalianDate('12/03/2026', today))).toBe('12/03/2026');
  });
});

describe('progressiveScores', () => {
  const scores = { location: 9, service: 8, menu: 7, value: 6 };

  it('tiene i criteri votati e neutralizza gli altri', () => {
    expect(progressiveScores(scores, 2)).toEqual({
      location: 9,
      service: 8,
      menu: NEUTRAL_SCORE,
      value: NEUTRAL_SCORE,
    });
  });

  it('con tutti i passi fatti non cambia nulla', () => {
    expect(progressiveScores(scores, 4)).toEqual(scores);
  });
});

describe('validatePlaceForm', () => {
  it('pretende il nome', () => {
    expect(validatePlaceForm(emptyPlaceForm('g1')).name).toBeDefined();
  });

  it('accetta un form minimo valido', () => {
    expect(validatePlaceForm({ ...emptyPlaceForm('g1'), name: 'Da Peppino' })).toEqual({});
  });
});

describe('sortPlaceItems', () => {
  const place = (id: string, name: string): Place => ({
    id,
    source: 'manual',
    google_place_id: null,
    google_linked_at: null,
    place_id_refreshed_at: null,
    name,
    address: null,
    cuisine: null,
    notes: null,
    cover_photo_path: null,
    lat: null,
    lng: null,
    coords_refreshed_at: null,
    official_override_pending: false,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });

  const scores = (last: string | null): PlaceScores => ({
    group_id: 'g1',
    place_id: 'p',
    review_count: last ? 1 : 0,
    avg_location: null,
    avg_service: null,
    avg_menu: null,
    avg_value: null,
    avg_overall: null,
    avg_cost_per_person_cents: null,
    last_review_at: last,
  });

  it('mette in cima l ultima recensita e ordina il resto per nome', () => {
    const items: PlaceListItem[] = [
      { place: place('1', 'Zaza'), scores: scores(null), addedAt: '2026-01-01T00:00:00Z' },
      { place: place('2', 'Bar'), scores: scores(null), addedAt: '2026-01-01T00:00:00Z' },
      {
        place: place('3', 'Peppino'),
        scores: scores('2026-02-01T00:00:00Z'),
        addedAt: '2026-01-01T00:00:00Z',
      },
    ];
    expect(sortPlaceItems(items).map((i) => i.place.name)).toEqual(['Peppino', 'Bar', 'Zaza']);
  });
});
