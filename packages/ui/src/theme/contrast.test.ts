import { describe, expect, it } from 'vitest';
import { THEME_IDS, THEMES, type ThemeTokens } from './themes';

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

type Key = keyof ThemeTokens;

/** Text (or an accent mark) and the fill it sits on, per handoff sections 3 and 4. */
const PAIRS: ReadonlyArray<[text: Key, fill: Key]> = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  // Unselected segment labels sit on the `chip` track.
  ['muted', 'chip'],
  ['primary-ink', 'primary'],
  ['accent-ink', 'accent'],
  // Accent text: ghost buttons and links.
  ['accent', 'bg'],
  ['accent', 'surface'],
  ['accent-on-tint', 'accent-tint'],
  ['butter-ink', 'butter'],
  ['seg-on-ink', 'seg-on'],
  ['toast-ink', 'toast-bg'],
  ['toast-action', 'toast-bg'],
  // Status tags.
  ['urgent-fg', 'urgent-bg'],
  ['soon-fg', 'soon-bg'],
  ['ok-fg', 'ok-bg'],
  // Canopy tokens (handoff section 2).
  ['canopy-ink', 'canopy-base'],
  ['gold', 'canopy-base'],
  ['gold-ink', 'gold'],
  ['ink-2', 'card-bg'],
  ['ink-2', 'surface'],
  // Not covered here: pairs with a gradient or rgba side cannot go through
  // this hex-only test: `hero-*` on `hero-bg`, `dock-on` / `dock-off` on
  // `dock-bg`, `cap-ink` on `cap-bg`, and `canopy-muted`. Add them when a
  // test can composite them (used by #806/#807).
];

describe('Theme contrast (US25: 4.5:1 for every text and accent pair)', () => {
  it('measures contrast as WCAG 2 does', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  const failures = THEME_IDS.flatMap((id) =>
    PAIRS.filter(
      ([text, fill]) => contrast(THEMES[id][text], THEMES[id][fill]) < 4.5,
    ).map(([text, fill]) => `${id} ${text}/${fill}` as const),
  );

  // Canopy values that fall short of 4.5:1 are listed here and taken back to
  // design rather than adjusted. The list is exact: a new failure, or a
  // design fix, trips the test.
  const KNOWN_HANDOFF_FAILURES: readonly string[] = [];

  it('meets 4.5:1 in every Theme except the known handoff failures', () => {
    expect(failures).toEqual(KNOWN_HANDOFF_FAILURES);
  });

  it.each(THEME_IDS)('uses plain hex values for the pairs in %s', (id) => {
    for (const [text, fill] of PAIRS) {
      expect(THEMES[id][text]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(THEMES[id][fill]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe('The Intro ground (Light, green): text meets 4.5:1', () => {
  const light = THEMES.light;
  it.each([
    ['cream text', light.surface, light.accent],
    [
      'cream text on the darker green cards',
      light.surface,
      light['accent-on-tint'],
    ],
    ['butter-ink on butter buttons', light['butter-ink'], light.butter],
    ['ink on the cream speech bubble', light.ink, light['card-bg']],
  ])('%s', (_name, text, fill) => {
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
  });
});
