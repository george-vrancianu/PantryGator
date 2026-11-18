export type VerticalPlacement = { top: number; placement: 'above' | 'below' };

/**
 * Where the popover sits vertically: below its column, else above it, else squeezed between the top limit
 * and the Dock. `topLimit` is the status-bar inset plus a gap; `bottomLimit` is the Dock zone's top edge.
 */
export function placeVertically(args: {
  columnTop: number;
  columnBottom: number;
  height: number;
  gap: number;
  topLimit: number;
  bottomLimit: number;
}): VerticalPlacement {
  const { columnTop, columnBottom, height, gap, topLimit, bottomLimit } = args;
  const below = columnBottom + gap;
  if (below + height <= bottomLimit) return { top: below, placement: 'below' };
  const above = columnTop - gap - height;
  if (above > topLimit) return { top: above, placement: 'above' };
  return {
    top: Math.max(topLimit, bottomLimit - height),
    placement: 'below',
  };
}
