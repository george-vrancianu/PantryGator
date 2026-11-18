import { PAGE_GUTTERS } from '@/components/layout/LayoutFrame/LayoutFrame';

/** The layout's gutter on each side (`LayoutFrame`'s own, so a bleeding row always lines up with it). */
const left = PAGE_GUTTERS.pl;
const right = PAGE_GUTTERS.pr;
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
