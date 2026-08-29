import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Storage per la sessione Supabase basato su expo-secure-store (Keychain su
 * iOS, Keystore su Android), non piu' su expo-sqlite/localStorage in chiaro.
 *
 * PERCHE' NON expo-secure-store DIRETTAMENTE.
 * SecureStore ha un limite documentato di circa 2048 byte per valore (e' un
 * limite di SharedPreferences su Android, dietro cui SecureStore si
 * appoggia). Il payload di una sessione Supabase (access_token JWT +
 * refresh_token + metadati utente, tutto in JSON) lo supera facilmente non
 * appena il JWT include piu' di pochi claim: scrivere una sessione cosi'
 * grande con SecureStore fallisce silenziosamente su alcuni dispositivi
 * Android, con l'utente sloggato ad ogni riavvio senza un errore chiaro da
 * cui partire.
 *
 * La soluzione qui non introduce una libreria di crittografia in piu' (aes-js
 * o simili): spezza il valore in blocchi sotto la soglia e li scrive come
 * voci SecureStore separate, ciascuna gia' cifrata dal sistema operativo
 * allo stesso modo di un valore singolo piu' piccolo. Non e' cifratura
 * "fatta in casa", e' lo stesso SecureStore usato piu' volte.
 */

const CHUNK_SIZE = 1800; // margine sotto il limite di ~2048 byte di SecureStore
const CHUNK_COUNT_SUFFIX = '__chunks';

function chunkKey(baseKey: string, index: number): string {
  return `${baseKey}__${index}`;
}

class ChunkedSecureStore {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX);
    if (countRaw === null) return null;

    const count = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      // I blocchi vanno letti in ordine per ricostruire la stringa: non c'e'
      // vantaggio a parallelizzare.
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null; // stato parziale/corrotto: tratta come assente
      parts.push(part);
    }
    return parts.join('');
  }

  async setItem(key: string, value: string): Promise<void> {
    // Pulisce prima eventuali blocchi residui di una scrittura precedente
    // piu' lunga, altrimenti un valore piu' corto lascerebbe in giro blocchi
    // finali non sovrascritti che il prossimo getItem non leggerebbe (il
    // nuovo count e' piu' basso) ma che restano comunque salvati.
    await this.removeItem(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    // Nessun blocco (valore vuoto): scrive comunque un manifest con 0 blocchi,
    // cosi' getItem distingue "chiave mai scritta" da "chiave con stringa vuota".
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
    await SecureStore.setItemAsync(key + CHUNK_COUNT_SUFFIX, String(chunks.length));
  }

  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX);
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    for (let i = 0; i < count; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    await SecureStore.deleteItemAsync(key + CHUNK_COUNT_SUFFIX);
  }
}

/**
 * SecureStore non esiste sul web (non c'e' Keychain/Keystore in un browser):
 * su quella piattaforma la sessione resta sullo storage passato come
 * fallback (lo stesso `localStorage` gia' in uso prima di questa modifica).
 * L'app e' pensata per iOS/Android, ma questo evita un crash silenzioso se
 * mai venisse eseguita in un contesto web (es. Expo Router in dev tools).
 */
export function createSupabaseAuthStorage(
  webFallback: Storage,
): typeof webFallback | ChunkedSecureStore {
  if (Platform.OS === 'web') return webFallback;
  return new ChunkedSecureStore();
}
