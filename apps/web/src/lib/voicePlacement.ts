import { aboveDock, DOCK_HEIGHT } from '@pocket-pantry/ui';

// The Voice Note's notices all hang above the Dock's mic, from `micBottom` up: just above the capsule,
// which overhangs the Dock.

/** CSS `bottom` of the spot just above the capsule, which overhangs the Dock. */
export const micBottom = {
  xs: aboveDock(DOCK_HEIGHT.xs),
  md: aboveDock(DOCK_HEIGHT.md),
};

/** CSS `bottom` of something sitting `gap` px above the capsule (the Listening card, the tip). */
export const aboveMic = (gap: number) => ({
  xs: `calc(${micBottom.xs} + ${gap}px)`,
  md: `calc(${micBottom.md} + ${gap}px)`,
});

/** Where a toast sits so it clears the Dock's mic. */
export const toastBottom = aboveMic(10);

/** The Listening card sits this far above the capsule, px. */
export const CARD_OFFSET = 10;
/** The height of the Background Read strip above the Dock (a title line, a one-line hint and its padding), px. */
export const STRIP_HEIGHT = 60;
/** The air kept above the strip, px. */
export const STRIP_GAP = 8;

/** CSS `bottom` of the Listening card. */
export const cardBottom = aboveMic(CARD_OFFSET);

/** The spot clear above the Background Read strip. */
export const aboveStrip = aboveMic(CARD_OFFSET + STRIP_HEIGHT + STRIP_GAP);

/**
 * Options for a voice toast: polite and clear of the mic. A toast clears the Background Read strip
 * on its own, through the toast floor the strip registers.
 */
export const voiceToast = () => ({
  polite: true as const,
  bottom: toastBottom,
});

/** Stacking of the voice layers; the app's toasts (1400) stay above all of them. */
export const VOICE_LAYER = {
  scrim: 1100,
  /** The Dock while a Voice Note is held: above the scrim, so the mic is not dimmed. */
  dock: 1150,
  /** The Listening card and the tip. */
  card: 1250,
} as const;
