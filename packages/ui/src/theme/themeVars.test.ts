import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ppCssVariables } from './theme';
import { THEME_IDS } from './themes';

const usedKeys = [
  ...new Set(
    [
      ...readFileSync(
        join(import.meta.dirname, 'themeVars.ts'),
        'utf8',
      ).matchAll(/\bpp\('([^']+)'\)/g),
    ].map((match) => match[1]),
  ),
];

describe('themeVars', () => {
  it('uses at least one token', () => {
    expect(usedKeys.length).toBeGreaterThan(10);
  });

  it.each(THEME_IDS)(
    'every pp() token it references is emitted for %s',
    (id) => {
      const selector = Object.keys(ppCssVariables()).find((key) =>
        key.includes(`data-theme="${id}"`),
      );
      const emitted = ppCssVariables()[selector ?? ''] ?? {};
      const missing = usedKeys.filter((key) => !(`--pp-${key}` in emitted));
      expect(missing).toEqual([]);
    },
  );
});
