import {
  DEFAULT_THEME_FAMILY,
  DEFAULT_THEME_PREFERENCE,
  parseTheme,
  serializeTheme,
} from '@/features/profile/theme';
import { PALETTE_FAMILIES } from '@/theme/palettes';
import type { PaletteFamily } from '@/theme/tokens';
import type { ThemePreference } from '@/theme/ThemeProvider';

const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

/**
 * `profiles.theme` e' una colonna testuale scritta dal client: il valore puo'
 * arrivare da una versione futura dell'app, da un backup, o corrotto a mano.
 * Se il parsing lasciasse passare spazzatura, l'app resterebbe senza tema --
 * un difetto invisibile in sviluppo e permanente per l'utente che lo subisce.
 */
describe('serializzazione del tema sul profilo', () => {
  it('fa round-trip su ogni combinazione famiglia/preferenza', () => {
    for (const family of PALETTE_FAMILIES) {
      for (const preference of PREFERENCES) {
        const serialized = serializeTheme(family, preference);
        expect(serialized).toBe(`${family}:${preference}`);
        expect(parseTheme(serialized)).toEqual({ family, preference });
      }
    }
  });

  it('copre tutte e cinque le famiglie', () => {
    expect(PALETTE_FAMILIES).toHaveLength(5);
    expect(PALETTE_FAMILIES).toEqual(
      expect.arrayContaining(['sunset', 'ocean', 'forest', 'plum', 'charcoal']),
    );
  });

  it('conserva charcoal con preferenza chiaro', () => {
    expect(parseTheme('charcoal:light')).toEqual({ family: 'charcoal', preference: 'light' });
  });

  it('tollera spazi e maiuscole', () => {
    expect(parseTheme('  Ocean:DARK ')).toEqual({ family: 'ocean', preference: 'dark' });
  });

  it('ricade sul default quando il valore e vuoto, nullo o non una stringa', () => {
    const fallback = { family: DEFAULT_THEME_FAMILY, preference: DEFAULT_THEME_PREFERENCE };
    expect(parseTheme('')).toEqual(fallback);
    expect(parseTheme(null)).toEqual(fallback);
    expect(parseTheme(undefined)).toEqual(fallback);
    expect(parseTheme(':')).toEqual(fallback);
    expect(parseTheme('   ')).toEqual(fallback);
  });

  it('ricade sul default su valori di spazzatura', () => {
    const fallback = { family: DEFAULT_THEME_FAMILY, preference: DEFAULT_THEME_PREFERENCE };
    for (const garbage of [
      'neon:ultraviolet',
      'sunsetdark',
      '{"family":"ocean"}',
      'ocean:dark:extra:ancora',
      '42',
      'null',
      'undefined',
      'forest ocean',
      '<script>alert(1)</script>',
    ]) {
      const parsed = parseTheme(garbage);
      expect(PALETTE_FAMILIES).toContain(parsed.family);
      expect(PREFERENCES).toContain(parsed.preference);
      if (garbage !== 'ocean:dark:extra:ancora' && garbage !== 'sunsetdark') {
        expect(parsed).toEqual(fallback);
      }
    }
  });

  it('conserva il pezzo valido quando l uno o l altro non lo e', () => {
    expect(parseTheme('ocean:qualcosa')).toEqual({
      family: 'ocean',
      preference: DEFAULT_THEME_PREFERENCE,
    });
    expect(parseTheme('neon:dark')).toEqual({ family: DEFAULT_THEME_FAMILY, preference: 'dark' });
  });

  it('la preferenza di un tema salvato torna sempre applicabile', () => {
    // Un valore letto dal database entra direttamente nello store: entrambi i
    // campi devono essere fra quelli che il provider sa gestire.
    const cases = ['plum:light', 'charcoal:system', 'sciocchezze', 'forest'];
    for (const value of cases) {
      const parsed = parseTheme(value);
      const family: PaletteFamily = parsed.family;
      const preference: ThemePreference = parsed.preference;
      expect(serializeTheme(family, preference)).toBe(`${family}:${preference}`);
    }
  });
});
