import { describe, expect, it } from 'vitest';
import type { BackgroundItem, BackgroundStatus } from '../backgroundItem';
import {
  ringArcs,
  ringShares,
  summarizeBubble,
  summarySignature,
} from './bubbleState';

const job = (id: string, status: BackgroundStatus): BackgroundItem => ({
  kind: 'photo',
  id,
  title: id,
  detail: '',
  status,
  createdAt: 1,
  actions: [],
});

describe('summarizeBubble', () => {
  it('is null for an empty queue', () => {
    expect(summarizeBubble([])).toBeNull();
  });

  it('is Reading while nothing is ready or failed', () => {
    expect(summarizeBubble([job('a', 'reading'), job('b', 'reading')])).toEqual(
      { state: 'reading', reading: 2, ready: 0, failed: 0, total: 2 },
    );
  });

  it('is Some ready when some are ready and the rest are reading', () => {
    expect(
      summarizeBubble([job('a', 'ready'), job('b', 'reading')])?.state,
    ).toBe('someReady');
  });

  it('is All done when every Job is ready', () => {
    expect(summarizeBubble([job('a', 'ready'), job('b', 'ready')])?.state).toBe(
      'allDone',
    );
  });

  it('is Could not read as soon as one Job failed, whatever else is going on', () => {
    expect(
      summarizeBubble([job('a', 'ready'), job('b', 'failed')])?.state,
    ).toBe('couldNotRead');
    expect(
      summarizeBubble([job('a', 'reading'), job('b', 'failed')])?.state,
    ).toBe('couldNotRead');
  });
});

describe('ringShares', () => {
  it('draws a lone Job as a full ring', () => {
    expect(ringShares({ ready: 0, failed: 0, reading: 1 })).toEqual([
      { kind: 'reading', from: 0, to: 1 },
    ]);
  });

  it('orders ready, failed, reading with a gap between shares', () => {
    const shares = ringShares({ ready: 1, failed: 1, reading: 1 });
    expect(shares.map((s) => s.kind)).toEqual(['ready', 'failed', 'reading']);
    expect(shares[0]!.to).toBeLessThan(shares[1]!.from);
    expect(shares[1]!.to).toBeLessThan(shares[2]!.from);
  });

  it('is empty for no Jobs', () => {
    expect(ringShares({ ready: 0, failed: 0, reading: 0 })).toEqual([]);
  });
});

describe('ringArcs', () => {
  it('merges neighbouring shares of one kind', () => {
    const arcs = ringArcs(ringShares({ ready: 2, failed: 0, reading: 1 }));
    expect(arcs.map((a) => a.kind)).toEqual(['ready', 'reading']);
  });
});

describe('summarySignature', () => {
  it('changes with the state or any count', () => {
    const a = summarizeBubble([job('a', 'reading')])!;
    const b = summarizeBubble([job('a', 'reading'), job('b', 'reading')])!;
    expect(summarySignature(a)).not.toBe(summarySignature(b));
    expect(summarySignature(a)).toBe(summarySignature({ ...a }));
  });
});
