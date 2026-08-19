import { PALETTES } from '@/theme/palettes';
import type { PaletteFamily } from '@/theme/tokens';
import type { ThemePreference } from '@/theme/ThemeProvider';

/**
 * Il tema scelto vive in due posti con ruoli diversi: lo store persistito lo
 * applica all'avvio senza rete, `profiles.theme` lo porta sugli altri
 * dispositivi. Il formato e' una stringa compatta "famiglia:preferenza"
 * (es. "sunset:dark") invece di due colonne o di JSON: una colonna testuale
 * basta e il valore resta leggibile a occhio nel database.
 *
 * Queste due funzioni sono pure e testate: un valore sconosciuto -- scritto da
 * una versione futura, o corrotto -- non deve mai lasciare l'app senza tema.
 */

export const DEFAULT_THEME_FAMILY: PaletteFamily = 'sunset';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export type ParsedTheme = { family: PaletteFamily; preference: ThemePreference };

export function serializeTheme(family: PaletteFamily, preference: ThemePreference): string {
  return `${family}:${preference}`;
}

function isFamily(value: string): value is PaletteFamily {
  return Object.prototype.hasOwnProperty.call(PALETTES, value);
}

function isPreference(value: string): value is ThemePreference {
  return (PREFERENCES as readonly string[]).includes(value);
}

/**
 * Tollerante per scelta: ogni pezzo si convalida da solo, cosi' un valore
 * mezzo valido ("ocean:qualcosa") conserva almeno la famiglia.
 * NOTA: charcoal esiste solo in scuro, ma la preferenza si conserva comunque
 * cosi' com'e' -- e' buildTheme() a forzare la modalita' scura, e cambiare
 * famiglia non deve far perdere all'utente la scelta "chiaro".
 */
export function parseTheme(value: string | null | undefined): ParsedTheme {
  const fallback: ParsedTheme = {
    family: DEFAULT_THEME_FAMILY,
    preference: DEFAULT_THEME_PREFERENCE,
  };
  if (typeof value !== 'string') return fallback;

  const [rawFamily = '', rawPreference = ''] = value.trim().toLowerCase().split(':');

  return {
    family: isFamily(rawFamily) ? rawFamily : fallback.family,
    preference: isPreference(rawPreference) ? rawPreference : fallback.preference,
  };
}
