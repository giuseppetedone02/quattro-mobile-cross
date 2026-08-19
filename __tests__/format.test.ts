import {
  formatCents, costPerPerson, formatScore, formatDate, formatRelative,
  initials, avatarHue, pluralize,
} from '@/lib/format';

describe('formatCents', () => {
  it('omette i decimali quando sono zero', () => {
    expect(formatCents(5600)).toMatch(/56/);
    expect(formatCents(5600)).not.toMatch(/,00/);
  });
  it('mostra i decimali quando servono', () => expect(formatCents(5650)).toMatch(/56,50/));
  it('gestisce zero e null', () => {
    expect(formatCents(0)).toMatch(/0/);
    expect(formatCents(null)).toBe('--');
    expect(formatCents(undefined)).toBe('--');
  });
});

describe('costPerPerson — i casi degeneri che una divisione ingenua sbaglia', () => {
  it('calcola il costo a testa', () => expect(costPerPerson(5600, 2)).toBe(2800));
  it('arrotonda al centesimo', () => expect(costPerPerson(1000, 3)).toBe(333));
  it('restituisce null con party_size a zero, non Infinity', () => {
    expect(costPerPerson(5600, 0)).toBeNull();
  });
  it('restituisce null con party_size negativo', () => expect(costPerPerson(5600, -2)).toBeNull());
  it('restituisce null con valori mancanti, non 0', () => {
    expect(costPerPerson(null, 2)).toBeNull();
    expect(costPerPerson(5600, null)).toBeNull();
    expect(costPerPerson(undefined, undefined)).toBeNull();
  });
  it('restituisce null con NaN o Infinity', () => {
    expect(costPerPerson(NaN, 2)).toBeNull();
    expect(costPerPerson(Infinity, 2)).toBeNull();
  });
});

describe('formatScore', () => {
  it('usa la virgola come separatore decimale', () => {
    expect(formatScore(7)).toBe('7,0');
    expect(formatScore(7.5)).toBe('7,5');
    expect(formatScore(10)).toBe('10,0');
  });
  it('gestisce i valori assenti', () => {
    expect(formatScore(null)).toBe('--');
    expect(formatScore(NaN)).toBe('--');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-08-17T12:00:00Z');
  it('oggi, ieri, giorni fa', () => {
    expect(formatRelative('2026-08-17T08:00:00Z', now)).toBe('oggi');
    expect(formatRelative('2026-08-16T22:00:00Z', now)).toBe('ieri');
    expect(formatRelative('2026-08-14T10:00:00Z', now)).toBe('3 giorni fa');
  });
  it('oltre la settimana passa alla data', () => {
    expect(formatRelative('2026-07-01T10:00:00Z', now)).not.toMatch(/giorni fa|oggi|ieri/);
  });
  it('non esplode su input non validi', () => {
    expect(formatRelative(null)).toBe('');
    expect(formatRelative('non-una-data')).toBe('');
  });
});

describe('formatDate', () => {
  it('formatta in italiano', () => expect(formatDate('2026-08-17T10:00:00Z', 'long')).toMatch(/agosto/));
  it('stringa vuota su input non valido', () => expect(formatDate('boh')).toBe(''));
});

describe('initials', () => {
  it('nome e cognome', () => expect(initials('Giuseppe Tedone')).toBe('GT'));
  it('solo nome', () => expect(initials('Giuseppe')).toBe('G'));
  it('piu di due parole usa la prima e l ultima', () => expect(initials('Anna Maria Rossi')).toBe('AR'));
  it('fallback su vuoto o assente', () => {
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('avatarHue', () => {
  it('e deterministico: lo stesso utente ha sempre lo stesso colore', () => {
    expect(avatarHue('abc-123')).toBe(avatarHue('abc-123'));
  });
  it('resta nell intervallo valido', () => {
    for (const seed of ['a', 'giuseppe', '11111111-1111-1111-1111-111111111111', '']) {
      const h = avatarHue(seed);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe('pluralize', () => {
  it('singolare e plurale', () => {
    expect(pluralize(1, 'recensione', 'recensioni')).toBe('1 recensione');
    expect(pluralize(0, 'recensione', 'recensioni')).toBe('0 recensioni');
    expect(pluralize(4, 'recensione', 'recensioni')).toBe('4 recensioni');
  });
});
