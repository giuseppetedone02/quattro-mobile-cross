import { z } from 'zod';
import type { PlaceSource } from '@/lib/database.types';

/**
 * I limiti corrispondono ai CHECK constraint di public.places: se divergono,
 * l'utente compila un form valido e poi vede un errore al salvataggio.
 *   name  -> between 1 and 140 (dopo btrim)
 *   notes -> <= 1000
 */
export const NAME_MAX = 140;
export const NOTES_MAX = 1000;

export type PlacePhotoDraft = {
  /** Id locale, serve solo alla PhotoPicker per la chiave di lista. */
  id: string;
  uri: string;
  width: number;
  height: number;
};

export const placeFormSchema = z.object({
  name: z.string().trim().min(1, 'Serve un nome.').max(NAME_MAX, `Massimo ${NAME_MAX} caratteri.`),
  address: z.string().trim().max(300, 'Indirizzo troppo lungo.'),
  cuisine: z.string().trim().max(80, 'Massimo 80 caratteri.'),
  notes: z.string().trim().max(NOTES_MAX, `Massimo ${NOTES_MAX} caratteri.`),
  groupId: z.string().min(1, 'Scegli un gruppo.'),
});

export type PlaceFormValues = {
  name: string;
  address: string;
  cuisine: string;
  notes: string;
  /** Il gruppo in cui il posto viene inserito. */
  groupId: string;
  coverPhoto: PlacePhotoDraft | null;
  lat: number | null;
  lng: number | null;
  /** Presente solo se il posto arriva dalla ricerca Google. */
  googlePlaceId: string | null;
  source: PlaceSource;
};

export type PlaceFormErrors = Partial<
  Record<'name' | 'address' | 'cuisine' | 'notes' | 'groupId', string>
>;

/** Valida i campi testuali e restituisce gli errori per campo, non un throw:
 *  il form li mostra tutti insieme sotto le rispettive etichette. */
export function validatePlaceForm(values: PlaceFormValues): PlaceFormErrors {
  const result = placeFormSchema.safeParse({
    name: values.name,
    address: values.address,
    cuisine: values.cuisine,
    notes: values.notes,
    groupId: values.groupId,
  });
  if (result.success) return {};

  const errors: PlaceFormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (
      key === 'name' ||
      key === 'address' ||
      key === 'cuisine' ||
      key === 'notes' ||
      key === 'groupId'
    ) {
      errors[key] = errors[key] ?? issue.message;
    }
  }
  return errors;
}

export function emptyPlaceForm(groupId: string): PlaceFormValues {
  return {
    name: '',
    address: '',
    cuisine: '',
    notes: '',
    groupId,
    coverPhoto: null,
    lat: null,
    lng: null,
    googlePlaceId: null,
    source: 'manual',
  };
}
