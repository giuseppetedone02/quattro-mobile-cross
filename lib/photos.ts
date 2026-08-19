import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { supabase } from './supabase';

export type PreparedPhoto = {
  /** URI locale del file gia' ridimensionato e ricompresso. */
  uri: string;
  width: number;
  height: number;
};

export const MAX_PHOTOS_PER_REVIEW = 6;
const MAX_EDGE = 1600;
const QUALITY = 0.8;

/**
 * Seleziona foto dalla libreria e le prepara per l'upload.
 *
 * Tre dettagli che evitano tre bug reali:
 *  - `mediaTypes: ['images']`: MediaTypeOptions e' deprecato in SDK 57.
 *  - `ImageManipulator.manipulate()`: l'API contestuale. manipulateAsync e'
 *    deprecato e non ha un pacchetto sostitutivo.
 *  - WebP a 1600px con qualita' 0.8 porta una foto da telefono da ~4 MB a
 *    ~200 KB. Sul piano Supabase gratuito da 1 GB e' la differenza fra ~250 e
 *    ~5.000 foto.
 */
export async function pickPhotos(limit = MAX_PHOTOS_PER_REVIEW): Promise<PreparedPhoto[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Serve il permesso di accedere alle foto per allegarle a una recensione.");
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  });
  if (picked.canceled) return [];

  return Promise.all(picked.assets.map((a) => prepare(a.uri)));
}

export async function takePhoto(): Promise<PreparedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Serve il permesso di usare la fotocamera.');

  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (shot.canceled || !shot.assets[0]) return null;
  return prepare(shot.assets[0].uri);
}

async function prepare(uri: string): Promise<PreparedPhoto> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: MAX_EDGE }).renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.WEBP, compress: QUALITY });
  return { uri: saved.uri, width: ref.width, height: ref.height };
}

/**
 * Carica su Supabase Storage.
 *
 * Legge i byte con `new File(uri).bytes()` invece di `fetch(uri).arrayBuffer()`:
 * da Expo SDK 56 `expo/fetch` ha sostituito il fetch globale e ha una
 * regressione documentata su `Response.blob()` in ambiente nativo. L'API a
 * classi di expo-file-system aggira il problema del tutto.
 *
 * `contentType` e' obbligatorio: senza, Supabase salva
 * application/octet-stream e la CDN non serve l'immagine correttamente.
 */
export async function uploadPhoto(
  bucket: string,
  path: string,
  photo: PreparedPhoto,
): Promise<{ path: string; width: number; height: number }> {
  const bytes = await new File(photo.uri).bytes();

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw error;

  return { path, width: photo.width, height: photo.height };
}

export function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * URL firmati in batch per i bucket privati (review-photos, place-photos).
 * Una sola chiamata invece di N: su una lista di recensioni con 3 foto
 * ciascuna la differenza e' visibile.
 */
export async function signedUrls(
  bucket: string,
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error) throw error;

  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

export const BUCKETS = {
  avatars: 'avatars',
  groupImages: 'group-images',
  placePhotos: 'place-photos',
  reviewPhotos: 'review-photos',
} as const;
