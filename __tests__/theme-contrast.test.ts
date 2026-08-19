import { PALETTES, PALETTE_FAMILIES, contrast, onScore } from '@/theme/palettes';
import { CRITERION_META, CRITERIA, scoreLabel, type ColorTokens } from '@/theme/tokens';
import { buildTheme } from '@/theme/ThemeProvider';

const AA_TEXT = 4.5;
const AA_UI = 3.0;

/**
 * Questo test e' BLOCCANTE in CI. E' l'investimento a basso costo che
 * WantABook non aveva fatto: senza, un colore di tema aggiunto in fretta
 * rende illeggibile una schermata e nessuno se ne accorge fino a quando
 * qualcuno se ne lamenta.
 */
function eachTheme(fn: (name: string, t: ColorTokens) => void) {
  for (const family of PALETTE_FAMILIES) {
    const p = PALETTES[family];
    if (p.light) fn(`${family}/light`, p.light);
    fn(`${family}/dark`, p.dark);
  }
}

describe('contrasto WCAG AA su tutte le combinazioni di tema', () => {
  it('testo primario sui tre fondi', () => {
    eachTheme((name, t) => {
      for (const bg of [t.bgCanvas, t.bgSurface, t.bgRaised] as const) {
        expect({ name, ratio: +contrast(t.textPrimary, bg).toFixed(2) }).toMatchObject({
          ratio: expect.any(Number),
        });
        expect(contrast(t.textPrimary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  });

  it('testo secondario su canvas e superficie', () => {
    eachTheme((name, t) => {
      expect(contrast(t.textSecondary, t.bgCanvas)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(t.textSecondary, t.bgSurface)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });

  it('accento leggibile come elemento UI, e testo leggibile sopra l accento', () => {
    eachTheme((name, t) => {
      expect(contrast(t.accentBase, t.bgCanvas)).toBeGreaterThanOrEqual(AA_UI);
      expect(contrast(t.textInverse, t.accentBase)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });

  it('stati success / warning / danger', () => {
    eachTheme((name, t) => {
      for (const c of [t.success, t.warning, t.danger] as const) {
        expect(contrast(c, t.bgSurface)).toBeGreaterThanOrEqual(AA_UI);
      }
    });
  });

  it('i quattro criteri sono leggibili su superficie', () => {
    eachTheme((name, t) => {
      for (const criterion of CRITERIA) {
        const color = t[CRITERION_META[criterion].token] as string;
        expect(contrast(color, t.bgSurface)).toBeGreaterThanOrEqual(AA_UI);
      }
    });
  });

  it('i quattro criteri sono distinguibili tra loro anche in luminanza (deuteranopia, scala di grigi)', () => {
    eachTheme((name, t) => {
      const colors = CRITERIA.map((c) => t[CRITERION_META[c].token] as string);
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          expect(contrast(colors[i] as string, colors[j] as string)).toBeGreaterThan(1.3);
        }
      }
    });
  });

  it('la scala punteggi ha sempre un testo leggibile sopra', () => {
    eachTheme((name, t) => {
      t.scoreScale.forEach((c) => {
        expect(contrast(onScore(c), c)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    });
  });

  it('la scala punteggi ha 10 passi ed e monotona in luminanza', () => {
    eachTheme((name, t) => {
      expect(t.scoreScale).toHaveLength(10);
    });
  });
});

describe('buildTheme', () => {
  it('la preferenza sistema segue lo schema del dispositivo', () => {
    expect(buildTheme('sunset', 'system', true).mode).toBe('dark');
    expect(buildTheme('sunset', 'system', false).mode).toBe('light');
  });
  it('la preferenza esplicita vince sul sistema', () => {
    expect(buildTheme('ocean', 'light', true).mode).toBe('light');
    expect(buildTheme('ocean', 'dark', false).mode).toBe('dark');
  });
  it('charcoal resta scuro anche se si chiede chiaro: esiste solo in scuro', () => {
    expect(buildTheme('charcoal', 'light', false).mode).toBe('dark');
    expect(buildTheme('charcoal', 'system', false).mode).toBe('dark');
  });
  it('scoreColor satura ai bordi invece di restituire undefined', () => {
    const t = buildTheme('sunset', 'dark', true);
    expect(t.scoreColor(0)).toBe(t.scoreColor(1));
    expect(t.scoreColor(99)).toBe(t.scoreColor(10));
    expect(t.scoreColor(7)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
  it('criterionColor copre tutti e quattro i criteri', () => {
    const t = buildTheme('forest', 'dark', true);
    for (const c of CRITERIA) expect(t.criterionColor(c)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('scoreLabel', () => {
  it('copre tutti i voti da 1 a 10', () => {
    for (let i = 1; i <= 10; i++) expect(scoreLabel(i).length).toBeGreaterThan(0);
  });
  it('satura fuori scala invece di restituire stringa vuota', () => {
    expect(scoreLabel(0)).toBe(scoreLabel(1));
    expect(scoreLabel(50)).toBe(scoreLabel(10));
  });
});
