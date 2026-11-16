import { describe, expect, it } from 'vitest';
import { THEME_IDS, THEME_META, THEMES, migrateTheme } from './themes';

describe('Themes', () => {
  it('are Light and Dark', () => {
    expect([...THEME_IDS]).toEqual(['light', 'dark']);
    expect(THEME_META.light.scheme).toBe('light');
    expect(THEME_META.dark.scheme).toBe('dark');
  });

  it('define every token key in both Themes, each with a value', () => {
    const keys = Object.keys(THEMES.light).sort();
    // 51 existing keys, 60 new Canopy ones, and the 3 reading-art hues kept.
    expect(keys.length).toBeGreaterThanOrEqual(111);
    for (const id of THEME_IDS) {
      expect(Object.keys(THEMES[id]).sort(), id).toEqual(keys);
      for (const key of keys) {
        const value = THEMES[id][key as keyof (typeof THEMES)[typeof id]];
        expect(value, `${id} ${key}`).toEqual(expect.any(String));
        expect(value, `${id} ${key}`).not.toBe('');
      }
    }
  });
});

describe('migrateTheme', () => {
  it.each([
    ['warm', 'light'],
    ['minimal', 'light'],
    ['light', 'light'],
    ['dark', 'dark'],
  ])('%s is %s', (stored, expected) => {
    expect(migrateTheme(stored)).toBe(expected);
  });

  it('has no Theme for anything else', () => {
    expect(migrateTheme('sage')).toBeNull();
    expect(migrateTheme(undefined)).toBeNull();
  });
});
