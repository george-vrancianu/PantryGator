import { tokens } from '@pocket-pantry/ui';

/**
 * A Theme colour at `percent` opacity. The camera screen is forced into
 * Dark-first, so these resolve to its colours whatever the Member's Theme.
 */
export const translucent = (colour: string, percent: number) =>
  `color-mix(in srgb, ${colour} ${percent}%, transparent)`;

/** Dark-first's background as a scrim or drop shadow over the camera feed. */
export const shade = (percent: number) => translucent(tokens.color.bg, percent);

export const glassFocusRing = {
  outline: `2px solid ${tokens.color.accent}`,
  outlineOffset: 2,
};

/** The see-through bar over the feed (the camera's top bar and footer): glass with a blur, never a solid fill. */
export const glassBar = {
  backgroundColor: translucent(tokens.color.bg, 55),
  backdropFilter: 'blur(14px) saturate(1.2)',
};
