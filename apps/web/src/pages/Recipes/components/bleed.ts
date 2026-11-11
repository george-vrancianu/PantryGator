import { gutterLeft, gutterRight } from '@pocket-pantry/ui';

/** `PageLayout`'s gutter on one side: 20 px on phones, 48 px from `md`, or the device's side inset when larger. */
const left = { xs: gutterLeft(20), md: gutterLeft(48) };
const right = { xs: gutterRight(20), md: gutterRight(48) };
const negate = (v: string) => `calc(-1 * ${v})`;

/** Lets a scrolling row run to the screen edges while its first item still lines up with the page gutter. */
export const bleedSx = {
  ml: { xs: negate(left.xs), md: negate(left.md) },
  mr: { xs: negate(right.xs), md: negate(right.md) },
  pl: left,
  pr: right,
  scrollPaddingInline: {
    xs: `${left.xs} ${right.xs}`,
    md: `${left.md} ${right.md}`,
  },
} as const;
