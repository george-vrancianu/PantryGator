import { describe, expect, it } from 'vitest';

/**
 * Guards the token sweep (#249): screens follow the Theme only if they read
 * its variables, so the app's source (including the always-dark Scan screen,
 * which reads the Dark-first Theme's variables) carries no fixed colours,
 * radii or old font names.
 */
const sources = import.meta.glob<string>(
  ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./test/**'],
  { query: '?raw', import: 'default', eager: true },
);

/** The UI package's source too: nothing is a pill, in the app or in the atoms. */
const uiSources = import.meta.glob<string>(
  [
    '../../../packages/ui/src/**/*.{ts,tsx}',
    '!../../../packages/ui/src/**/*.test.{ts,tsx}',
    '!../../../packages/ui/src/**/*.stories.{ts,tsx}',
    '!../../../packages/ui/src/test/**',
  ],
  { query: '?raw', import: 'default', eager: true },
);

type Rule = { name: string; find: (line: string) => boolean };

/** A `borderRadius` value that follows the Theme, or is a shape (circle, square). */
const THEMED_RADIUS =
  /^(?:radius\.\w+|[A-Z_]*RADIUS|0|'50%'|`[^`]*(?:var\(--pp-r-|\$\{radius\.)[^`]*`|'[^']*var\(--pp-r-[^']*'|\w+\(.*\))$/;

const rules: Rule[] = [
  {
    name: 'hex colour',
    find: (line) => /['"`(\s]#[0-9A-Fa-f]{3,8}\b/.test(line),
  },
  { name: 'rgb/hsl colour', find: (line) => /\b(?:rgba?|hsla?)\(/.test(line) },
  { name: 'old font name', find: (line) => /Bricolage|DM Sans/.test(line) },
  {
    name: 'root-only legacy variable',
    find: (line) =>
      /var\(--(?:font-display|font-body|shadow-dock|r-[a-z]+)\)/.test(line),
  },
  { name: 'fixed radius token', find: (line) => /tokens\.radius/.test(line) },
  {
    name: 'fixed borderRadius',
    find: (line) => {
      // The value runs to the next top-level comma or brace.
      const match =
        /\bborderRadius:\s*((?:[^,{}()`']|\([^)]*\)|`[^`]*`|'[^']*')+)/.exec(
          line,
        );
      return match ? !THEMED_RADIUS.test(match[1].trim()) : false;
    },
  },
];

function offences() {
  const found: string[] = [];
  for (const [path, source] of Object.entries(sources)) {
    source.split('\n').forEach((line, index) => {
      for (const rule of rules) {
        if (rule.find(line)) {
          found.push(`${path}:${index + 1} ${rule.name}: ${line.trim()}`);
        }
      }
    });
  }
  return found;
}

/**
 * A pill: a radius so large that any size becomes a capsule (the token
 * `radius.pill`, `'pill'`/`'full'`, or any literal of 50 or more, number or px
 * string). Percentages such as '50%' (circles) are allowed.
 */
const PILL =
  /\bradius\.pill\b|\bborderRadius:\s*(?:['"`]?(?:[5-9]\d|\d{3,})(?:\.\d+)?(?:px)?(?![\d%.])|['"`](?:pill|full))/;

function pillOffences() {
  const found: string[] = [];
  for (const [path, source] of Object.entries({ ...sources, ...uiSources })) {
    source.split('\n').forEach((line, index) => {
      if (PILL.test(line)) found.push(`${path}:${index + 1} ${line.trim()}`);
    });
  }
  return found;
}

describe('Theme token sweep', () => {
  it('scans the app source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('leaves no hard-coded colours, radii or old font names', () => {
    expect(offences()).toEqual([]);
  });

  // Nothing is a pill: the only circles are the health hub and the Gator bubble ('50%').
  it('uses no pill radius in the app or the UI package', () => {
    expect(Object.keys(uiSources).length).toBeGreaterThan(50);
    expect(pillOffences()).toEqual([]);
  });
});
