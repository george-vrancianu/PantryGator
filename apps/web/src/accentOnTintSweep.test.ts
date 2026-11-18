import { describe, expect, it } from 'vitest';

/**
 * Plain `accent` text on an `accentTint` fill falls short of 4.5:1 in the
 * old Warm editorial Theme (4.49:1); the Themes define `accentOnTint` for that fill (US25).
 */
const sources = import.meta.glob<string>(
  [
    './**/*.tsx',
    '../../../packages/ui/src/**/*.tsx',
    '!./**/*.test.tsx',
    '!**/*.stories.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const TINT_FILL = /\b(?:bgcolor|backgroundColor|bg):\s*[^,]*accentTint/;
const ACCENT_TEXT =
  /\b(?:color|fg):\s*(?:palette\('pp-accent'\)|'pp\.accent'|shade\.accent\w*|color\.accent\b(?!\w))/;

/**
 * Accent on a tint that is not text. QuickRow's icon tile is aria-hidden and
 * decorative, so the 3:1 non-text ratio applies, not 4.5:1.
 */
const NOT_TEXT = [
  'pages/Pantry/components/QuickRow/QuickRow.tsx:' + "color: 'pp.accent',",
];

function offences() {
  const found: string[] = [];
  for (const [path, source] of Object.entries(sources)) {
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (!TINT_FILL.test(line)) return;
      const from = Math.max(0, index - 4);
      lines.slice(from, index + 4).forEach((near, offset) => {
        if (!ACCENT_TEXT.test(near)) return;
        if (NOT_TEXT.some((ok) => `${path}:${near.trim()}`.endsWith(ok)))
          return;
        found.push(`${path}:${from + 1 + offset} ${near.trim()}`);
      });
    });
  }
  return found;
}

describe('accent text on an accent tint', () => {
  it('scans the app and UI package source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });

  it('uses accentOnTint, never accent, for text on an accentTint fill', () => {
    expect(offences()).toEqual([]);
  });
});
