import { color } from '@pocket-pantry/ui';

/** Keyboard rings are the olive page colour by default, which vanishes on the olive ground: make them cream. */
export const creamFocus = {
  '&& :focus-visible, && .Mui-focusVisible, && label:has(:focus-visible), && a:focus-visible':
    { outlineColor: color.cardBg },
} as const;
