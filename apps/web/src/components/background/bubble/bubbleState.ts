import { countBackground, type BackgroundItem } from '../backgroundItem';

/** The bubble's four looks (handoff section 9.1). */
export type BubbleState = 'reading' | 'someReady' | 'allDone' | 'couldNotRead';

export type RingShare = {
  kind: 'ready' | 'failed' | 'reading';
  /** Where the share starts and ends round the ring, 0 to 1. */
  from: number;
  to: number;
};

export type BubbleSummary = {
  state: BubbleState;
  reading: number;
  ready: number;
  failed: number;
  total: number;
};

/** What the bubble shows for the Jobs the Member's device holds; `null` when the queue is empty (the bubble is hidden). */
export function summarizeBubble(items: BackgroundItem[]): BubbleSummary | null {
  const counts = countBackground(items);
  if (counts.total === 0) return null;
  const { reading, ready, failed, total } = counts;
  const state: BubbleState =
    failed > 0
      ? 'couldNotRead'
      : ready === total
        ? 'allDone'
        : ready > 0
          ? 'someReady'
          : 'reading';
  return { state, reading, ready, failed, total };
}

/** Fraction of a full turn left empty between two shares. */
const GAP = 0.03;

/**
 * One share per Job in the order ready, failed, reading, a small gap between shares. A lone share
 * is a full ring (no gap). Real progress is not known, so each reading Job takes its full share.
 */
export function ringShares({
  ready,
  failed,
  reading,
}: Pick<BubbleSummary, 'ready' | 'failed' | 'reading'>): RingShare[] {
  const order: RingShare['kind'][] = [
    ...Array<'ready'>(ready).fill('ready'),
    ...Array<'failed'>(failed).fill('failed'),
    ...Array<'reading'>(reading).fill('reading'),
  ];
  const total = order.length;
  if (total === 0) return [];
  if (total === 1) return [{ kind: order[0]!, from: 0, to: 1 }];
  const slot = 1 / total;
  return order.map((kind, i) => ({
    kind,
    from: i * slot + GAP / 2,
    to: (i + 1) * slot - GAP / 2,
  }));
}

/** Merge neighbouring shares of one kind into one arc, so the ring draws as few paths as it can. */
export function ringArcs(shares: RingShare[]): RingShare[] {
  const arcs: RingShare[] = [];
  for (const share of shares) {
    const last = arcs.at(-1);
    // Within one gap of each other: the same arc, gap kept only between kinds.
    if (last && last.kind === share.kind) {
      last.to = share.to;
    } else {
      arcs.push({ ...share });
    }
  }
  return arcs;
}

/** A change worth announcing and showing as a label: the state or any count moved. */
export const summarySignature = (s: BubbleSummary): string =>
  `${s.state}:${s.reading}:${s.ready}:${s.failed}`;
