import type { ThemeId } from './themes';
import { palette } from './themeVars';

/** An Aisle tint: a background and the text that sits on it. */
export type AisleTint = { bg: string; fg: string };

export const AISLE_TINT_NAMES = [
  'produce',
  'bakery',
  'dairy',
  'meat',
  'frozen',
  'pantry',
  'drinks',
] as const;

/** A tinted Aisle group; `neutral` is any Aisle without one. */
export type AisleTintName = (typeof AISLE_TINT_NAMES)[number] | 'neutral';

/** An Aisle tint with its own colour pair in each Theme. */
type TintedAisleName = Exclude<AisleTintName, 'neutral'>;

/** The shopping handoff's pairs (docs/handoffs/shopping, section 4): the Light Theme's values. */
const light: Record<TintedAisleName, AisleTint> = {
  produce: { bg: '#DDEBE2', fg: '#2E6A4D' },
  bakery: { bg: '#F6EBC8', fg: '#6E5200' },
  dairy: { bg: '#E3ECF3', fg: '#2F5674' },
  meat: { bg: '#FBE6DA', fg: '#B54A17' },
  frozen: { bg: '#E6E9F4', fg: '#3E4C7A' },
  pantry: { bg: '#E2E8DD', fg: '#3C4A41' },
  drinks: { bg: '#EFE6F1', fg: '#6A3F72' },
};

/** Dark: the shopping handoff's dark pairs (docs/handoffs/shopping-import, section 7). */
const dark: Record<TintedAisleName, AisleTint> = {
  produce: { bg: '#1F3A2A', fg: '#9FE0B4' },
  bakery: { bg: '#3A3118', fg: '#F2CF72' },
  dairy: { bg: '#1D2C38', fg: '#9CC3E3' },
  meat: { bg: '#3F241B', fg: '#FFA27E' },
  pantry: { bg: '#26312A', fg: '#B9C7BC' },
  frozen: { bg: '#232842', fg: '#AEB9EA' },
  drinks: { bg: '#33243A', fg: '#D7B3DF' },
};

/** Aisle tints keyed by Theme, next to the Theme tokens. */
export const AISLE_TINTS: Readonly<
  Record<ThemeId, Record<TintedAisleName, AisleTint>>
> = { light, dark };

/**
 * Tints by Aisle id. The ids are the seeded Aisles' stable ids
 * (`seedId.aisle(slug)` in apps/api/src/catalog/seed/seed-catalog.ts); Aisles
 * have no slug column, so the slug is noted beside each.
 */
const tintByAisle: Readonly<Record<string, AisleTintName>> = {
  '1dff107d-5280-500f-807e-d694a53e24d9': 'produce', // fruit-veg
  '28ebc9e6-2bd5-5698-ba01-8a4a0b232e36': 'bakery', // bakery
  '5275409d-8e0e-584a-8b21-94dfdcf2edb0': 'meat', // meat-fish
  '244cde4d-f9a5-5df8-9f40-5e1f48fd4fcf': 'dairy', // dairy-eggs
  'b658eb31-01a3-52d2-8f87-255332e5c6c6': 'frozen', // frozen
  'b81caa56-7e3c-5d0d-a59d-f74137b77e08': 'pantry', // dry-goods
  '94e1e744-1a94-5ace-9390-7a379077ab77': 'pantry', // tins-jars
  '8e7904b6-9b1e-5bb1-b2fe-5be62dfd0750': 'bakery', // oils-spices
  '233a1edd-a872-5885-bbf3-d77182e67050': 'drinks', // snacks-drinks
};

/** `--pp-aisle-<name>-bg|fg` for one Theme, written per Theme selector. */
export function aisleTintCssVariables(id: ThemeId): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const name of AISLE_TINT_NAMES) {
    vars[`--pp-aisle-${name}-bg`] = AISLE_TINTS[id][name].bg;
    vars[`--pp-aisle-${name}-fg`] = AISLE_TINTS[id][name].fg;
  }
  return vars;
}

/**
 * An Aisle's tint as CSS variable references, so it follows the Theme of the
 * subtree it is painted in. No Aisle, "Other" and any Admin-created Aisle get
 * the neutral chip with muted text.
 */
export function aisleTint(
  aisleId?: string | null,
): AisleTint & { name: AisleTintName } {
  const name = (aisleId ? tintByAisle[aisleId] : undefined) ?? 'neutral';
  if (name === 'neutral') {
    return {
      name,
      bg: palette('pp-chip'),
      fg: palette('text-secondary'),
    };
  }
  return {
    name,
    bg: `var(--pp-aisle-${name}-bg)`,
    fg: `var(--pp-aisle-${name}-fg)`,
  };
}
