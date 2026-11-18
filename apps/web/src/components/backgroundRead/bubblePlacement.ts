export type Side = 'left' | 'right';

/** Where the bubble rests: a side edge and how far it sits above its lowest spot (the Dock's top, or the bottom inset). */
export type Placement = { side: Side; lift: number };

export const DEFAULT_PLACEMENT: Placement = { side: 'right', lift: 0 };
/** The bubble's diameter, px. */
export const BUBBLE_SIZE = 56;
export const PLACEMENT_KEY = 'pp.gatorBubble';

/** The free band between the header and the Dock, in viewport px. */
export type Bounds = { top: number; bottom: number };

/** Where a drag ended: the bubble's centre column and top edge. */
export function snapPlacement(
  drop: { centreX: number; top: number },
  viewport: { width: number },
  bounds: Bounds,
  size: number = BUBBLE_SIZE,
): Placement {
  const room = Math.max(0, bounds.bottom - bounds.top - size);
  const top = Math.min(Math.max(drop.top, bounds.top), bounds.top + room);
  return {
    side: drop.centreX < viewport.width / 2 ? 'left' : 'right',
    lift: Math.round(bounds.bottom - (top + size)),
  };
}

/** Left and Right arrows: to that edge, keeping the height. */
export const moveToEdge = (placement: Placement, side: Side): Placement => ({
  ...placement,
  side,
});

export function loadPlacement(storage: Pick<Storage, 'getItem'>): Placement {
  try {
    const raw = storage.getItem(PLACEMENT_KEY);
    if (!raw) return DEFAULT_PLACEMENT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_PLACEMENT;
    }
    const { side, lift } = parsed as Record<string, unknown>;
    if (
      (side !== 'left' && side !== 'right') ||
      typeof lift !== 'number' ||
      !Number.isFinite(lift) ||
      lift < 0
    ) {
      return DEFAULT_PLACEMENT;
    }
    return { side, lift };
  } catch {
    // Storage blocked or the value is not JSON: the bubble rests at its default.
    return DEFAULT_PLACEMENT;
  }
}

export function savePlacement(
  storage: Pick<Storage, 'setItem'>,
  placement: Placement,
): void {
  try {
    storage.setItem(PLACEMENT_KEY, JSON.stringify(placement));
  } catch {
    // Private mode or a full store: the place is just not remembered.
  }
}
