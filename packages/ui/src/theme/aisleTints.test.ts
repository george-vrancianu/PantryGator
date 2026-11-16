import { describe, expect, it } from 'vitest';
import { AISLE_TINT_NAMES, AISLE_TINTS, aisleTint } from './aisleTints';
import { THEME_IDS } from './themes';

/** WCAG 2 relative luminance of a `#RRGGBB` colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('Aisle tints', () => {
  it('gives every Theme a pair for every tinted Aisle group', () => {
    for (const id of THEME_IDS) {
      expect(Object.keys(AISLE_TINTS[id]).sort()).toEqual(
        [...AISLE_TINT_NAMES].sort(),
      );
    }
  });

  it('keeps text on the tint at 4.5:1 or more in Dark-first', () => {
    for (const name of AISLE_TINT_NAMES) {
      const { bg, fg } = AISLE_TINTS.dark[name];
      expect(contrast(bg, fg), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses the shopping handoff's dark pairs in Dark and keeps the light pairs in Light", () => {
    expect(AISLE_TINTS.dark.produce).toEqual({ bg: '#1F3A2A', fg: '#9FE0B4' });
    expect(AISLE_TINTS.dark.bakery).toEqual({ bg: '#3A3118', fg: '#F2CF72' });
    expect(AISLE_TINTS.dark.dairy).toEqual({ bg: '#1D2C38', fg: '#9CC3E3' });
    expect(AISLE_TINTS.dark.meat).toEqual({ bg: '#3F241B', fg: '#FFA27E' });
    expect(AISLE_TINTS.dark.pantry).toEqual({ bg: '#26312A', fg: '#B9C7BC' });
    expect(AISLE_TINTS.dark.frozen).toEqual({ bg: '#232842', fg: '#AEB9EA' });
    expect(AISLE_TINTS.dark.drinks).toEqual({ bg: '#33243A', fg: '#D7B3DF' });
    expect(AISLE_TINTS.light.produce).toEqual({
      bg: '#DDEBE2',
      fg: '#2E6A4D',
    });
  });

  it('keeps the groups apart in Dark: no two share a tint', () => {
    const backgrounds = AISLE_TINT_NAMES.map((n) => AISLE_TINTS.dark[n].bg);
    expect(new Set(backgrounds).size).toBe(AISLE_TINT_NAMES.length);
  });
});

describe('aisleTint', () => {
  it('follows the Theme through CSS variables for a seeded Aisle', () => {
    expect(aisleTint('244cde4d-f9a5-5df8-9f40-5e1f48fd4fcf')).toEqual({
      name: 'dairy',
      bg: 'var(--pp-aisle-dairy-bg)',
      fg: 'var(--pp-aisle-dairy-fg)',
    });
  });

  it('gives an unknown Aisle the neutral chip', () => {
    expect(aisleTint('made-up-aisle').name).toBe('neutral');
    expect(aisleTint(null).name).toBe('neutral');
  });
});
