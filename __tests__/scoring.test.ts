import {
  clampScore, overallScore, roundLikeDb, diamondPoints, diamondPath,
  criterionExtremes, type Scores,
} from '@/features/reviews/scoring';

const s = (l: number, se: number, m: number, v: number): Scores => ({
  location: l, service: se, menu: m, value: v,
});

describe('clampScore', () => {
  it('tiene i valori validi', () => {
    expect(clampScore(1)).toBe(1);
    expect(clampScore(7)).toBe(7);
    expect(clampScore(10)).toBe(10);
  });
  it('satura ai bordi invece di propagare valori fuori scala', () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(-5)).toBe(1);
    expect(clampScore(11)).toBe(10);
    expect(clampScore(999)).toBe(10);
  });
  it('arrotonda i decimali', () => {
    expect(clampScore(7.4)).toBe(7);
    expect(clampScore(7.5)).toBe(8);
  });
  it('non propaga NaN o Infinity', () => {
    expect(clampScore(NaN)).toBe(1);
    expect(clampScore(Infinity)).toBe(10);
    expect(clampScore(-Infinity)).toBe(1);
  });
});

describe('overallScore — deve coincidere con la colonna generata di Postgres', () => {
  it('media semplice dei quattro criteri', () => {
    // Verificato contro Postgres: 8+6+9+7 = 30 / 4 = 7.50
    expect(overallScore(s(8, 6, 9, 7))).toBeCloseTo(7.5, 10);
    // 6+8+7+9 = 30 / 4 = 7.50 — combinazione diversa, stessa media
    expect(overallScore(s(6, 8, 7, 9))).toBeCloseTo(7.5, 10);
  });
  it('estremi', () => {
    expect(overallScore(s(1, 1, 1, 1))).toBe(1);
    expect(overallScore(s(10, 10, 10, 10))).toBe(10);
  });
  it('nessun criterio pesa piu degli altri (decisione 22.3)', () => {
    const base = overallScore(s(5, 5, 5, 5));
    for (const bumped of [s(6, 5, 5, 5), s(5, 6, 5, 5), s(5, 5, 6, 5), s(5, 5, 5, 6)]) {
      expect(overallScore(bumped)).toBeCloseTo(base + 0.25, 10);
    }
  });
  it('produce valori rappresentabili da numeric(4,2)', () => {
    for (let a = 1; a <= 10; a++) {
      const v = roundLikeDb(overallScore(s(a, a, a, 10)));
      expect(Number(v.toFixed(2))).toBe(v);
    }
  });
});

describe('diamondPoints — la geometria del Diamante', () => {
  const R = 100;
  it('restituisce quattro vertici', () => {
    expect(diamondPoints(s(5, 5, 5, 5), R)).toHaveLength(4);
  });
  it('con tutti 10 i vertici toccano gli estremi degli assi', () => {
    const [top, right, bottom, left] = diamondPoints(s(10, 10, 10, 10), R) as [any, any, any, any];
    expect(top.x).toBeCloseTo(R, 5);   expect(top.y).toBeCloseTo(0, 5);
    expect(right.x).toBeCloseTo(2 * R, 5); expect(right.y).toBeCloseTo(R, 5);
    expect(bottom.x).toBeCloseTo(R, 5); expect(bottom.y).toBeCloseTo(2 * R, 5);
    expect(left.x).toBeCloseTo(0, 5);  expect(left.y).toBeCloseTo(R, 5);
  });
  it('con tutti 1 la forma resta visibile e non collassa nel centro', () => {
    const pts = diamondPoints(s(1, 1, 1, 1), R);
    for (const p of pts) {
      const d = Math.hypot(p.x - R, p.y - R);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeCloseTo(R * 0.14, 5);
    }
  });
  it('e simmetrico: punteggi uguali danno distanze uguali dal centro', () => {
    const dists = diamondPoints(s(7, 7, 7, 7), R).map((p) => Math.hypot(p.x - R, p.y - R));
    for (const d of dists) expect(d).toBeCloseTo(dists[0] as number, 10);
  });
  it('e monotono: un voto piu alto allontana il vertice dal centro', () => {
    const dist = (v: number) => {
      const p = diamondPoints(s(v, 5, 5, 5), R)[0] as { x: number; y: number };
      return Math.hypot(p.x - R, p.y - R);
    };
    for (let v = 1; v < 10; v++) expect(dist(v + 1)).toBeGreaterThan(dist(v));
  });
  it('forme diverse per posti diversi: e la firma visiva del locale', () => {
    const a = diamondPath(s(9, 3, 8, 4), R);
    const b = diamondPath(s(3, 9, 4, 8), R);
    expect(a).not.toBe(b);
  });
});

describe('diamondPath', () => {
  it('produce un path SVG chiuso e ben formato', () => {
    const p = diamondPath(s(8, 6, 9, 7), 50);
    expect(p).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+){3} Z$/);
  });
  it('non contiene NaN nemmeno con input degeneri', () => {
    expect(diamondPath(s(NaN, Infinity, -1, 100), 50)).not.toMatch(/NaN|Infinity/);
  });
});

describe('criterionExtremes', () => {
  it('restituisce null senza recensioni, invece di un criterio arbitrario', () => {
    expect(criterionExtremes([])).toBeNull();
  });
  it('trova il criterio piu severo e il piu generoso', () => {
    const r = criterionExtremes([s(8, 5, 9, 7), s(7, 6, 10, 6), s(9, 4, 8, 8)]);
    expect(r).not.toBeNull();
    expect(r!.harshest.criterion).toBe('service'); // media 5
    expect(r!.kindest.criterion).toBe('menu');     // media 9
    expect(r!.harshest.average).toBeCloseTo(5, 10);
    expect(r!.kindest.average).toBeCloseTo(9, 10);
  });
});
