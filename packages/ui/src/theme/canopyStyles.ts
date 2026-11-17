import { canopy } from './themeVars';

/**
 * The Canopy's labelled / icon chip: a raised dark-green fill with a hairline and a top highlight.
 * Shared by `HeaderButton`, `IconButton` (tone `canopyChip`) and the Recipes tag button, so they cannot drift.
 */
export const canopyChipStyle = {
  backgroundColor: canopy.chip,
  color: canopy.ink,
  border: `1px solid ${canopy.chipLine}`,
  boxShadow: canopy.chipHighlight,
} as const;

/**
 * The Canopy's gold key (the "+" and Save): a gold gradient with dark ink, hairline and lift.
 * Shared by `HeaderButton` and `IconButton` (tone `key`). Painted with `background` because `keyBg` is a gradient.
 */
export const canopyKeyStyle = {
  background: canopy.keyBg,
  color: canopy.goldInk,
  border: `1px solid ${canopy.keyLine}`,
  boxShadow: canopy.keyShadow,
} as const;
