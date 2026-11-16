import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  prePaintScript,
  resolveTheme,
} from './appearance';

const LIGHT_BG = '#EDECE5';
const DARK_BG = '#101511';

/** A bare document like the HTML entry before React mounts: two media-qualified `theme-color` tags. */
function bareDocument() {
  const doc = document.implementation.createHTMLDocument('Pocket Pantry');
  for (const media of [
    '(prefers-color-scheme: light)',
    '(prefers-color-scheme: dark)',
  ]) {
    const meta = doc.createElement('meta');
    meta.name = 'theme-color';
    meta.media = media;
    meta.content = '#000000';
    doc.head.append(meta);
  }
  return doc;
}

/** Run the inline script the HTML entry ships, against a document and a window with this storage and system scheme. */
function runPrePaint({
  stored,
  systemDark = false,
}: {
  stored?: string;
  systemDark?: boolean;
}) {
  const doc = bareDocument();
  const storage = new Map<string, string>();
  if (stored !== undefined) storage.set('pp.appearance', stored);
  const win = {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null },
    matchMedia: (query: string) => ({
      matches: systemDark && query === '(prefers-color-scheme: dark)',
    }),
  };
  new Function('document', 'window', prePaintScript())(doc, win);
  const themeColors = [
    ...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  ].map((meta) => meta.content);
  return { theme: doc.documentElement.dataset.theme, themeColors };
}

const stored = (theme: string, matchSystem: boolean) =>
  JSON.stringify({ theme, matchSystem });

describe('Match system', () => {
  it('is Dark when the device is dark and Light otherwise', () => {
    const appearance = { theme: 'light', matchSystem: true } as const;
    expect(resolveTheme(appearance, true)).toBe('dark');
    expect(resolveTheme(appearance, false)).toBe('light');
    expect(resolveTheme({ theme: 'dark', matchSystem: true }, false)).toBe(
      'light',
    );
  });

  it('leaves the chosen Theme alone when off', () => {
    expect(resolveTheme({ theme: 'light', matchSystem: false }, true)).toBe(
      'light',
    );
    expect(resolveTheme({ theme: 'dark', matchSystem: false }, false)).toBe(
      'dark',
    );
  });

  it('is on by default, with Light as the Theme', () => {
    expect(DEFAULT_APPEARANCE).toEqual({ theme: 'light', matchSystem: true });
  });
});

describe('a stored appearance', () => {
  it.each([
    ['warm', 'light'],
    ['minimal', 'light'],
    ['light', 'light'],
    ['dark', 'dark'],
  ])('reads %s as %s', (theme, expected) => {
    expect(parseAppearance(stored(theme, false))).toEqual({
      theme: expected,
      matchSystem: false,
    });
  });

  it('reads an unknown Theme as the default', () => {
    expect(parseAppearance(stored('sage', false))).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('the pre-paint script', () => {
  it.each(['light', 'warm', 'minimal'])(
    'applies a stored %s as Light when Match system is off, whatever the system scheme',
    (theme) => {
      expect(
        runPrePaint({ stored: stored(theme, false), systemDark: true }),
      ).toEqual({ theme: 'light', themeColors: [LIGHT_BG, LIGHT_BG] });
    },
  );

  it('applies Dark when it is stored, whatever the system scheme', () => {
    expect(runPrePaint({ stored: stored('dark', false) })).toEqual({
      theme: 'dark',
      themeColors: [DARK_BG, DARK_BG],
    });
  });

  it('follows the system with no stored preference: Light in light mode', () => {
    expect(runPrePaint({})).toEqual({
      theme: 'light',
      themeColors: [LIGHT_BG, LIGHT_BG],
    });
  });

  it('follows the system with no stored preference: Dark in dark mode', () => {
    expect(runPrePaint({ systemDark: true })).toEqual({
      theme: 'dark',
      themeColors: [DARK_BG, DARK_BG],
    });
  });

  it('falls back to Light when the stored preference is malformed JSON', () => {
    expect(runPrePaint({ stored: '{not json' }).theme).toBe('light');
  });

  it('falls back to the default when the stored Theme is unknown', () => {
    expect(runPrePaint({ stored: stored('sage', false) }).theme).toBe('light');
  });

  it.each(['light', 'dark', 'warm'])(
    'uses Dark in system dark mode with Match system on (stored %s)',
    (theme) => {
      expect(
        runPrePaint({ stored: stored(theme, true), systemDark: true }).theme,
      ).toBe('dark');
    },
  );

  it.each(['light', 'dark', 'minimal'])(
    'uses Light in system light mode with Match system on (stored %s)',
    (theme) => {
      expect(runPrePaint({ stored: stored(theme, true) }).theme).toBe('light');
    },
  );

  it('does not throw when storage is blocked', () => {
    const doc = bareDocument();
    const win = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
      },
      matchMedia: () => ({ matches: false }),
    };
    new Function('document', 'window', prePaintScript())(doc, win);
    expect(doc.documentElement.dataset.theme).toBe('light');
  });
});
