import { describe, expect, it } from 'vitest';

/**
 * Guards the token sweep (#248): components follow the Theme only if they read
 * its variables, so the UI package carries no fixed colours or radii outside
 * the Theme definitions (themes.ts, aisleTints.ts).
 */
const sources = import.meta.glob<string>(
  [
    './**/*.{ts,tsx}',
    '../.storybook/**/*.{ts,tsx}',
    '!./**/*.test.{ts,tsx}',
    '!./test/**',
    '!./theme/themes.ts',
    '!./theme/aisleTints.ts',
    // The helpers that name the Theme's variables.
    '!./theme/themeVars.ts',
    // Gator's art keeps its own colours and tile shape in every Theme (tile gradient, Dark rim).
    '!./gator/art/logoArt.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

type Rule = { name: string; find: (line: string) => boolean };

/** A `borderRadius` that follows the Theme, or is a shape (circle, square). */
const THEMED_RADIUS =
  /^(?:radius\.\w+|0|'50%'|`[^`]*\$\{radius\.[^`]*`|\w+\(.*\))$/;

const rules: Rule[] = [
  {
    name: 'hex colour',
    find: (line) => /['"`(\s]#[0-9A-Fa-f]{3,8}\b/.test(line),
  },
  { name: 'rgb/hsl colour', find: (line) => /\b(?:rgba?|hsla?)\(/.test(line) },
  { name: 'old font name', find: (line) => /Bricolage|DM Sans/.test(line) },
  {
    // Typed helpers in theme/themeVars.ts name every Theme variable.
    name: 'raw Theme variable',
    find: (line) => /var\(--(?:pp|mui-palette)-/.test(line),
  },
  { name: 'fixed radius token', find: (line) => /tokens\.radius/.test(line) },
  {
    name: 'fixed borderRadius',
    find: (line) => {
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
      // Comments may cite issues (#252).
      if (/^\s*(?:\*|\/\/)/.test(line)) return;
      for (const rule of rules) {
        if (rule.find(line)) {
          found.push(`${path}:${index + 1} ${rule.name}: ${line.trim()}`);
        }
      }
    });
  }
  return found;
}

describe('Theme token sweep', () => {
  it('scans the UI package source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(30);
  });

  it('leaves no hard-coded colours or radii outside the Theme definitions', () => {
    expect(offences()).toEqual([]);
  });
});
