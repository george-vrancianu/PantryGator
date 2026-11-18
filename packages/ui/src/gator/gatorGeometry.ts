/** A rectangle in SVG user units: x, y, width, height. */
export type Box = readonly [x: number, y: number, w: number, h: number];

/**
 * Per Gator: the `drawing` box (the viewBox of the original static art, the
 * space the layout has always given that Gator) and the `view` box (the
 * padded viewBox shared by its four motion files). The padding is the
 * difference, so `Gator` hangs it outside the layout box: 8 units each side,
 * 36 on top for the hop and the hat flip, and 20 at the bottom for the Soft
 * clay drop shadow. A test compares every `view` with the viewBox in the art
 * files, so a new export can't drift.
 */
export const GATOR_GEOMETRY = {
  'shopping-buddy': { drawing: [0, -12, 280, 242], view: [-8, -48, 296, 298] },
  'app-icon': { drawing: [0, 0, 200, 200], view: [-8, -36, 216, 256] },
  talking: { drawing: [0, -30, 260, 196], view: [-8, -66, 276, 252] },
  happy: { drawing: [0, -30, 248, 200], view: [-8, -66, 264, 256] },
  proud: { drawing: [0, -36, 280, 196], view: [-8, -72, 296, 252] },
  listening: { drawing: [-16, -30, 264, 200], view: [-24, -66, 280, 256] },
  thinking: { drawing: [0, -30, 248, 200], view: [-8, -66, 264, 256] },
  'list-keeper': { drawing: [0, -4, 280, 244], view: [-8, -40, 296, 300] },
  worried: { drawing: [0, -30, 248, 200], view: [-8, -66, 264, 256] },
  chef: { drawing: [0, -6, 280, 246], view: [-8, -42, 296, 302] },
  'chef-flop': { drawing: [0, -6, 280, 252], view: [-8, -42, 296, 308] },
} as const satisfies Record<string, { drawing: Box; view: Box }>;

/** Every Gator mood. All 11 have the four motion files. */
export type GatorMood = keyof typeof GATOR_GEOMETRY;
/** Kept for callers that named the animated subset while chef-flop was a still. */
export type AnimatedGatorMood = GatorMood;
export const GATOR_MOODS = Object.keys(GATOR_GEOMETRY) as GatorMood[];

/**
 * How to size the image so the drawing renders `size` wide and keeps the
 * layout box it always had; the padding hangs out through negative margins.
 */
export function gatorLayout(mood: GatorMood, size: number) {
  const { drawing, view } = GATOR_GEOMETRY[mood];
  const scale = size / drawing[2];
  return {
    /** The layout box: what the old static art took up. */
    box: { width: drawing[2] * scale, height: drawing[3] * scale },
    width: view[2] * scale,
    height: view[3] * scale,
    marginTop: (view[1] - drawing[1]) * scale,
    marginLeft: (view[0] - drawing[0]) * scale,
    marginRight: (view[0] + view[2] - drawing[0] - drawing[2]) * -scale,
    marginBottom: (view[1] + view[3] - drawing[1] - drawing[3]) * -scale,
  };
}
