import type { PlaceListItem } from './hooks/usePlaces';

/**
 * Avviso di posto duplicato (requisito 2.3): un suggerimento, non un blocco.
 * Due posti con lo stesso nome in citta' diverse sono legittimi (es. una
 * catena), quindi il nome da solo non basta: quando ENTRAMBI i posti hanno
 * coordinate, deve valere anche la vicinanza. Un posto manuale senza
 * coordinate ricade sul solo confronto per nome, perche' la distanza non e'
 * calcolabile -- meglio un falso positivo occasionale che perderne uno vero.
 */
export const DUPLICATE_DISTANCE_METERS = 200;

function normalizePlaceName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distanza fra due coordinate, formula dell'emisenoverso (accurata quanto serve su scala urbana). */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export type DuplicateCandidate = {
  name: string;
  lat: number | null;
  lng: number | null;
};

/**
 * Cerca, fra i posti gia' nel gruppo, uno "simile" al candidato: stesso nome
 * normalizzato e, se le coordinate ci sono su entrambi i lati, entro
 * DUPLICATE_DISTANCE_METERS. Restituisce il primo trovato o null.
 */
export function findSimilarPlace(
  existing: PlaceListItem[],
  candidate: DuplicateCandidate,
): PlaceListItem | null {
  const candidateName = normalizePlaceName(candidate.name);
  if (!candidateName) return null;

  for (const item of existing) {
    if (normalizePlaceName(item.place.name) !== candidateName) continue;

    if (
      candidate.lat != null &&
      candidate.lng != null &&
      item.place.lat != null &&
      item.place.lng != null
    ) {
      const distance = haversineMeters(
        { lat: candidate.lat, lng: candidate.lng },
        { lat: item.place.lat, lng: item.place.lng },
      );
      if (distance > DUPLICATE_DISTANCE_METERS) continue;
    }

    return item;
  }
  return null;
}
