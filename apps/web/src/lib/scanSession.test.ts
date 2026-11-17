import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { nextBackgroundOrder } from '../components/background/backgroundItem';
import { MAX_RECEIPT_SECTIONS } from './receiptSections';
import type { ProposedLine } from './scan';
import {
  MAX_CONCURRENT_READS,
  MAX_SESSION_SCANS,
  announcedScanFailed,
  announceScanFailed,
  dispatchScanSession,
  getScanSessionOrder,
  isBarcodeCard,
  type SessionScan,
  resetScanSession,
  sessionHeld,
  canMerge,
  canRetry,
  emptySession,
  pendingCount,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from './scanSession';
import { reviewLinesOf, toReviewLine } from './review';

const line: ProposedLine = {
  name: 'Milk',
  match: null,
  lowConfidence: false,
  quantity: null,
  unit: null,
  expiryDate: null,
  sourceText: null,
  productDescription: null,
};

const enqueue = (
  id: string,
  extra: Partial<Extract<SessionAction, { type: 'enqueue' }>['scan']> = {},
): SessionAction => ({
  type: 'enqueue',
  scan: {
    id,
    mode: 'product',
    scanLanguage: 'en',
    image: `image-${id}`,
    thumbnail: `thumb-${id}`,
    ...extra,
  },
});

const run = (...actions: SessionAction[]): SessionState =>
  actions.reduce(sessionReducer, emptySession);
const status = (state: SessionState) =>
  state.scans.map((scan) => [scan.id, scan.status]);

describe('Scan Session reducer', () => {
  it('starts empty', () => {
    expect(emptySession.scans).toEqual([]);
    expect(pendingCount(emptySession)).toBe(0);
  });

  it('allows 2 reads at a time', () => {
    expect(MAX_CONCURRENT_READS).toBe(2);
  });

  describe('enqueue', () => {
    it('appends a Scan in capture order, waiting to be read', () => {
      const state = run(enqueue('a'), enqueue('b'), enqueue('c'));
      expect(state.scans.map((scan) => scan.id)).toEqual(['a', 'b', 'c']);
      expect(state.scans.every((scan) => scan.status === 'queued')).toBe(true);
    });

    it('keeps each Scan own mode, Scan Language, image and thumbnail', () => {
      const state = run(
        enqueue('a', { mode: 'receipt', scanLanguage: 'ro' }),
        enqueue('b', { mode: 'plate', scanLanguage: undefined }),
      );
      expect(state.scans[0]).toMatchObject({
        mode: 'receipt',
        scanLanguage: 'ro',
        image: 'image-a',
        thumbnail: 'thumb-a',
      });
      expect(state.scans[1]).toMatchObject({ mode: 'plate' });
      expect(state.scans[1].scanLanguage).toBeUndefined();
    });

    it('does not start a read by itself', () => {
      const state = run(enqueue('a'));
      expect(status(state)).toEqual([['a', 'queued']]);
    });

    it('does not change the earlier state', () => {
      const before = run(enqueue('a'));
      sessionReducer(before, enqueue('b'));
      expect(before.scans).toHaveLength(1);
    });
  });

  describe('a gallery receipt', () => {
    const source = new Blob(['x']);

    it('waits uncropped when it is enqueued with its source photo', () => {
      const state = run(enqueue('a', { mode: 'receipt', source }));
      expect(status(state)).toEqual([['a', 'uncropped']]);
    });

    it('is not started by start', () => {
      const state = run(enqueue('a', { mode: 'receipt', source }), {
        type: 'start',
      });
      expect(status(state)).toEqual([['a', 'uncropped']]);
    });

    it('does not use up a read slot', () => {
      const state = run(
        enqueue('a', { mode: 'receipt', source }),
        enqueue('b'),
        enqueue('c'),
        { type: 'start' },
      );
      expect(status(state)).toEqual([
        ['a', 'uncropped'],
        ['b', 'reading'],
        ['c', 'reading'],
      ]);
    });

    it('is pending until it is cropped and read', () => {
      expect(pendingCount(run(enqueue('a', { source })))).toBe(1);
    });

    it('crop gives it the cropped image and queues it for reading', () => {
      const state = run(enqueue('a', { mode: 'receipt', source }), {
        type: 'crop',
        id: 'a',
        image: 'cropped',
      });
      expect(status(state)).toEqual([['a', 'queued']]);
      expect(state.scans[0].image).toBe('cropped');
      expect(state.scans[0].source).toBeUndefined();
      expect(sessionReducer(state, { type: 'start' }).scans[0].status).toBe(
        'reading',
      );
    });

    it('crop leaves the other Scans alone', () => {
      const state = run(enqueue('a', { source }), enqueue('b', { source }), {
        type: 'crop',
        id: 'b',
        image: 'cropped',
      });
      expect(status(state)).toEqual([
        ['a', 'uncropped'],
        ['b', 'queued'],
      ]);
    });
  });

  describe('start', () => {
    it('starts the oldest waiting Scans, at most 2 reading at once', () => {
      const state = run(
        enqueue('a'),
        enqueue('b'),
        enqueue('c'),
        enqueue('d'),
        { type: 'start' },
      );
      expect(status(state)).toEqual([
        ['a', 'reading'],
        ['b', 'reading'],
        ['c', 'queued'],
        ['d', 'queued'],
      ]);
    });

    it('starts only one when one read is already running', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        enqueue('b'),
        enqueue('c'),
        {
          type: 'start',
        },
      );
      expect(status(state)).toEqual([
        ['a', 'reading'],
        ['b', 'reading'],
        ['c', 'queued'],
      ]);
    });

    it('does nothing with an empty Scan Session', () => {
      expect(sessionReducer(emptySession, { type: 'start' })).toEqual(
        emptySession,
      );
    });

    it('is idempotent', () => {
      const once = run(enqueue('a'), enqueue('b'), enqueue('c'), {
        type: 'start',
      });
      expect(sessionReducer(once, { type: 'start' })).toEqual(once);
    });
  });

  describe('read', () => {
    it('marks the Scan read and keeps its lines', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        {
          type: 'read',
          id: 'a',
          lines: [line],
        },
      );
      expect(state.scans[0]).toMatchObject({ status: 'read', lines: [line] });
    });

    it('frees a slot so the next waiting Scan can start', () => {
      const state = run(
        enqueue('a'),
        enqueue('b'),
        enqueue('c'),
        { type: 'start' },
        { type: 'read', id: 'a', lines: [line] },
        { type: 'start' },
      );
      expect(status(state)).toEqual([
        ['a', 'read'],
        ['b', 'reading'],
        ['c', 'reading'],
      ]);
    });

    it('leaves the other Scans alone', () => {
      const state = run(
        enqueue('a'),
        enqueue('b'),
        { type: 'start' },
        {
          type: 'read',
          id: 'b',
          lines: [line],
        },
      );
      expect(status(state)).toEqual([
        ['a', 'reading'],
        ['b', 'read'],
      ]);
    });

    it('ignores a read for a Scan that was removed meanwhile', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        { type: 'remove', id: 'a' },
        { type: 'read', id: 'a', lines: [line] },
      );
      expect(state.scans).toEqual([]);
    });
  });

  describe('remove', () => {
    it('drops the Scan and keeps the order of the rest', () => {
      const state = run(enqueue('a'), enqueue('b'), enqueue('c'), {
        type: 'remove',
        id: 'b',
      });
      expect(state.scans.map((scan) => scan.id)).toEqual(['a', 'c']);
    });

    it('frees the read slot of a Scan removed while reading', () => {
      const state = run(
        enqueue('a'),
        enqueue('b'),
        enqueue('c'),
        { type: 'start' },
        { type: 'remove', id: 'a' },
        { type: 'start' },
      );
      expect(status(state)).toEqual([
        ['b', 'reading'],
        ['c', 'reading'],
      ]);
    });

    it('ignores an unknown id', () => {
      const before = run(enqueue('a'));
      expect(sessionReducer(before, { type: 'remove', id: 'zzz' })).toEqual(
        before,
      );
    });
  });

  describe('pendingCount', () => {
    it('counts the Scans still waiting or reading, not the read ones', () => {
      const state = run(
        enqueue('a'),
        enqueue('b'),
        enqueue('c'),
        {
          type: 'start',
        },
        { type: 'read', id: 'a', lines: [line] },
      );
      expect(pendingCount(state)).toBe(2);
    });

    it('is zero when every Scan is read', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        {
          type: 'read',
          id: 'a',
          lines: [line],
        },
      );
      expect(pendingCount(state)).toBe(0);
    });
  });

  describe('fail', () => {
    it('marks a reading Scan failed and keeps its image for a retry', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        {
          type: 'fail',
          id: 'a',
          reason: 'error',
        },
      );
      expect(state.scans[0]).toMatchObject({
        status: 'failed',
        failure: 'error',
        image: 'image-a',
        thumbnail: 'thumb-a',
      });
    });

    it('records the Scan Cap as its own reason', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        {
          type: 'fail',
          id: 'a',
          reason: 'cap',
        },
      );
      expect(state.scans[0]).toMatchObject({
        status: 'failed',
        failure: 'cap',
      });
    });

    it('leaves the other Scans alone and frees the read slot', () => {
      const state = run(
        enqueue('a'),
        enqueue('b'),
        enqueue('c'),
        { type: 'start' },
        { type: 'fail', id: 'a', reason: 'error' },
        { type: 'start' },
      );
      expect(status(state)).toEqual([
        ['a', 'failed'],
        ['b', 'reading'],
        ['c', 'reading'],
      ]);
    });

    it('does not count a failed Scan as pending', () => {
      const state = run(
        enqueue('a'),
        enqueue('b'),
        { type: 'start' },
        {
          type: 'fail',
          id: 'a',
          reason: 'error',
        },
      );
      expect(pendingCount(state)).toBe(1);
    });

    it('keeps the order of the Scans', () => {
      const state = run(
        enqueue('a'),
        enqueue('b'),
        { type: 'start' },
        {
          type: 'fail',
          id: 'a',
          reason: 'error',
        },
      );
      expect(state.scans.map((scan) => scan.id)).toEqual(['a', 'b']);
    });
  });

  describe('fail with an error code', () => {
    const failedWith = () =>
      run(
        enqueue('a'),
        { type: 'start' },
        {
          type: 'fail',
          id: 'a',
          reason: 'error',
          code: 'scan.too_many_items',
          params: { max: 50 },
        },
      );

    it('keeps the code and params apart from the failure reason', () => {
      expect(failedWith().scans[0]).toMatchObject({
        status: 'failed',
        failure: 'error',
        errorCode: 'scan.too_many_items',
        errorParams: { max: 50 },
      });
    });

    it('stores no code when none is given', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        {
          type: 'fail',
          id: 'a',
          reason: 'error',
        },
      );
      expect(state.scans[0].errorCode).toBeUndefined();
    });

    it('forgets the code on retry', () => {
      const state = sessionReducer(failedWith(), { type: 'retry', id: 'a' });
      expect(state.scans[0].errorCode).toBeUndefined();
      expect(state.scans[0].errorParams).toBeUndefined();
    });
  });

  describe('retry', () => {
    const failed = (reason: 'error' | 'cap' = 'error') =>
      run(enqueue('a'), { type: 'start' }, { type: 'fail', id: 'a', reason });

    it('puts a failed Scan back in line with the same image', () => {
      const state = sessionReducer(failed(), { type: 'retry', id: 'a' });
      expect(state.scans[0]).toMatchObject({
        status: 'queued',
        image: 'image-a',
        thumbnail: 'thumb-a',
      });
      expect(state.scans[0].failure).toBeUndefined();
    });

    it('is read again by the next start', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        { type: 'fail', id: 'a', reason: 'error' },
        { type: 'retry', id: 'a' },
        { type: 'start' },
      );
      expect(status(state)).toEqual([['a', 'reading']]);
    });

    it('only acts on failed Scans', () => {
      const reading = run(enqueue('a'), { type: 'start' });
      expect(sessionReducer(reading, { type: 'retry', id: 'a' })).toEqual(
        reading,
      );
      const read = run(
        enqueue('b'),
        { type: 'start' },
        {
          type: 'read',
          id: 'b',
          lines: [line],
        },
      );
      expect(sessionReducer(read, { type: 'retry', id: 'b' })).toEqual(read);
    });

    it('does nothing for an unknown Scan', () => {
      const state = failed();
      expect(sessionReducer(state, { type: 'retry', id: 'zzz' })).toEqual(
        state,
      );
    });

    it('can fail and be retried again', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        { type: 'fail', id: 'a', reason: 'error' },
        { type: 'retry', id: 'a' },
        { type: 'start' },
        { type: 'fail', id: 'a', reason: 'error' },
      );
      expect(status(state)).toEqual([['a', 'failed']]);
    });
  });

  describe('sessionHeld', () => {
    it('is false for an empty Scan Session and for ordinary failures', () => {
      expect(sessionHeld(emptySession)).toBe(false);
      expect(
        sessionHeld(
          run(
            enqueue('a'),
            { type: 'start' },
            {
              type: 'fail',
              id: 'a',
              reason: 'error',
            },
          ),
        ),
      ).toBe(false);
    });

    it('is true while a Scan failed on the Scan Cap', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        {
          type: 'fail',
          id: 'a',
          reason: 'cap',
        },
      );
      expect(sessionHeld(state)).toBe(true);
    });

    it('is lifted by removing that Scan or retrying it', () => {
      const state = run(
        enqueue('a'),
        { type: 'start' },
        {
          type: 'fail',
          id: 'a',
          reason: 'cap',
        },
      );
      expect(
        sessionHeld(sessionReducer(state, { type: 'remove', id: 'a' })),
      ).toBe(false);
      expect(
        sessionHeld(sessionReducer(state, { type: 'retry', id: 'a' })),
      ).toBe(false);
    });
  });
});

describe('Scan Session reducer: Plate Scans', () => {
  const dishes = [{ title: 'Pancakes', confidence: 0.7 }];
  const plate = enqueue('p', { mode: 'plate', scanLanguage: undefined });
  const dishesRead = (...rest: SessionAction[]) =>
    run(
      plate,
      { type: 'start' },
      {
        type: 'readDishes',
        id: 'p',
        dishes,
        token: 'tok',
      },
      ...rest,
    );

  it('is read once its dish guesses arrive, with no lines yet', () => {
    const [scan] = dishesRead().scans;
    expect(scan).toMatchObject({
      status: 'read',
      dishes,
      plateToken: 'tok',
    });
    expect(scan.lines).toBeUndefined();
    expect(pendingCount(dishesRead())).toBe(0);
  });

  it('is queued again to be read again, without the old guesses', () => {
    const [scan] = dishesRead({ type: 'reread', id: 'p' }).scans;
    expect(scan.status).toBe('queued');
    expect(scan.dishes).toBeUndefined();
    expect(scan.plateToken).toBeUndefined();
    expect(scan.image).toBe('image-p');
  });
});

describe('Receipt merge and split', () => {
  const named = (name: string): ProposedLine => ({ ...line, name });
  const read = (id: string, lines: ProposedLine[]): SessionAction[] => [
    { type: 'read', id, lines },
  ];
  const readThree = () => {
    let state = run(
      enqueue('a', { mode: 'receipt' }),
      enqueue('b', { mode: 'receipt' }),
      enqueue('c', { mode: 'receipt' }),
      { type: 'start' },
      ...read('a', [named('A1'), named('A2')]),
      ...read('b', [named('B1')]),
    );
    state = sessionReducer(state, { type: 'start' });
    return sessionReducer(state, {
      type: 'read',
      id: 'c',
      lines: [named('C1')],
    });
  };

  it('joins a receipt card to the receipt card above it', () => {
    const state = sessionReducer(readThree(), { type: 'merge', id: 'b' });
    expect(state.scans.map((s) => s.id)).toEqual(['a', 'c']);
    expect(state.scans[0].status).toBe('read');
  });

  it('merges lines in order, as Receipt Sections do', () => {
    const state = sessionReducer(readThree(), { type: 'merge', id: 'b' });
    expect(state.scans[0].lines?.map((l) => l.name)).toEqual([
      'A1',
      'A2',
      'B1',
    ]);
  });

  it('keeps the first section Scan Language and photo', () => {
    let state = run(
      enqueue('a', { mode: 'receipt', scanLanguage: 'ro' }),
      enqueue('b', { mode: 'receipt', scanLanguage: 'da' }),
      { type: 'start' },
      ...read('a', [named('A1')]),
      ...read('b', [named('B1')]),
    );
    state = sessionReducer(state, { type: 'merge', id: 'b' });
    expect(state.scans).toHaveLength(1);
    expect(state.scans[0].scanLanguage).toBe('ro');
    expect(state.scans[0].thumbnail).toBe('thumb-a');
  });

  it('can merge a third card into an already merged one', () => {
    let state = sessionReducer(readThree(), { type: 'merge', id: 'b' });
    state = sessionReducer(state, { type: 'merge', id: 'c' });
    expect(state.scans.map((s) => s.id)).toEqual(['a']);
    expect(state.scans[0].lines?.map((l) => l.name)).toEqual([
      'A1',
      'A2',
      'B1',
      'C1',
    ]);
  });

  describe('canMerge', () => {
    it('is true for a read receipt card below a read receipt card', () => {
      expect(canMerge(readThree(), 'b')).toBe(true);
      expect(canMerge(readThree(), 'c')).toBe(true);
    });

    it('is false for the first card', () => {
      expect(canMerge(readThree(), 'a')).toBe(false);
    });

    it('is false for an unknown card', () => {
      expect(canMerge(readThree(), 'zzz')).toBe(false);
    });

    it('is false when either card is still reading or waiting', () => {
      const state = run(
        enqueue('a', { mode: 'receipt' }),
        enqueue('b', { mode: 'receipt' }),
        enqueue('c', { mode: 'receipt' }),
        { type: 'start' },
        ...read('a', [named('A1')]),
      );
      // b reading, c waiting
      expect(canMerge(state, 'b')).toBe(false);
      expect(canMerge(state, 'c')).toBe(false);
      const reading = sessionReducer(state, {
        type: 'read',
        id: 'b',
        lines: [],
      });
      // c is now the one that is not read; a and b are
      expect(canMerge(reading, 'b')).toBe(true);
      expect(canMerge(reading, 'c')).toBe(false);
    });

    it('is false when the card above is not a receipt, or this one is not', () => {
      const state = run(
        enqueue('a'),
        enqueue('b', { mode: 'receipt' }),
        enqueue('c'),
        { type: 'start' },
        ...read('a', [named('A1')]),
        ...read('b', [named('B1')]),
      );
      expect(canMerge(state, 'b')).toBe(false);
      expect(canMerge(state, 'c')).toBe(false);
    });

    it('is false when a receipt is not adjacent to another receipt', () => {
      const state = run(
        enqueue('a', { mode: 'receipt' }),
        enqueue('x'),
        enqueue('b', { mode: 'receipt' }),
        { type: 'start' },
        ...read('a', [named('A1')]),
        ...read('x', [named('X1')]),
      );
      const done = sessionReducer(sessionReducer(state, { type: 'start' }), {
        type: 'read',
        id: 'b',
        lines: [named('B1')],
      });
      expect(canMerge(done, 'b')).toBe(false);
    });

    it('stops at 10 sections in one receipt', () => {
      const ids = Array.from({ length: MAX_RECEIPT_SECTIONS + 1 }, (_, i) =>
        String(i),
      );
      let state = run(...ids.map((id) => enqueue(id, { mode: 'receipt' })));
      for (const id of ids) {
        state = sessionReducer(state, { type: 'start' });
        state = sessionReducer(state, { type: 'read', id, lines: [named(id)] });
      }
      for (const id of ids.slice(1, MAX_RECEIPT_SECTIONS)) {
        expect(canMerge(state, id)).toBe(true);
        state = sessionReducer(state, { type: 'merge', id });
      }
      // Cards: first (10 sections) and the eleventh.
      expect(state.scans.map((s) => s.id)).toEqual([
        '0',
        String(MAX_RECEIPT_SECTIONS),
      ]);
      expect(canMerge(state, String(MAX_RECEIPT_SECTIONS))).toBe(false);
      const refused = sessionReducer(state, {
        type: 'merge',
        id: String(MAX_RECEIPT_SECTIONS),
      });
      expect(refused).toBe(state);
    });
  });

  it('ignores a merge that is not allowed', () => {
    const state = readThree();
    expect(sessionReducer(state, { type: 'merge', id: 'a' })).toBe(state);
  });

  describe('split', () => {
    it('restores the separate cards, in place, with their own lines', () => {
      const before = readThree();
      let state = sessionReducer(before, { type: 'merge', id: 'b' });
      state = sessionReducer(state, { type: 'split', id: 'a' });
      expect(state.scans.map((s) => s.id)).toEqual(['a', 'b', 'c']);
      expect(state.scans.map((s) => s.lines?.map((l) => l.name))).toEqual([
        ['A1', 'A2'],
        ['B1'],
        ['C1'],
      ]);
      expect(state.scans.every((s) => s.status === 'read')).toBe(true);
    });

    it('restores every section of a card merged more than once', () => {
      let state = sessionReducer(readThree(), { type: 'merge', id: 'b' });
      state = sessionReducer(state, { type: 'merge', id: 'c' });
      state = sessionReducer(state, { type: 'split', id: 'a' });
      expect(state.scans.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    });

    it('does nothing to a card that was not merged', () => {
      const state = readThree();
      expect(sessionReducer(state, { type: 'split', id: 'a' })).toBe(state);
    });

    it('lets the Scans merge again afterwards', () => {
      let state = sessionReducer(readThree(), { type: 'merge', id: 'b' });
      state = sessionReducer(state, { type: 'split', id: 'a' });
      expect(canMerge(state, 'b')).toBe(true);
    });
  });

  it('removing a merged card removes all its sections', () => {
    let state = sessionReducer(readThree(), { type: 'merge', id: 'b' });
    state = sessionReducer(state, { type: 'remove', id: 'a' });
    expect(state.scans.map((s) => s.id)).toEqual(['c']);
  });
});

describe('Scan Cap (epic review #1)', () => {
  const capped = () =>
    run(
      enqueue('a'),
      enqueue('b'),
      enqueue('c'),
      enqueue('d'),
      { type: 'start' },
      { type: 'fail', id: 'a', reason: 'cap' },
    );

  it('fails the Scans waiting behind a capped Scan with the cap too', () => {
    const state = capped();
    expect(state.scans.find((s) => s.id === 'c')).toMatchObject({
      status: 'failed',
      failure: 'cap',
    });
    expect(state.scans.find((s) => s.id === 'd')).toMatchObject({
      status: 'failed',
      failure: 'cap',
    });
  });

  it('counts only the read still out as pending, so Add is not blocked', () => {
    expect(pendingCount(capped())).toBe(1);
  });

  it('re-queues every Scan failed by the cap when one is retried', () => {
    const state = sessionReducer(capped(), { type: 'retry', id: 'a' });
    expect(status(state)).toEqual([
      ['a', 'queued'],
      ['b', 'reading'],
      ['c', 'queued'],
      ['d', 'queued'],
    ]);
  });

  it('leaves Scans that failed for another reason failed', () => {
    const state = sessionReducer(
      run(
        enqueue('a'),
        enqueue('b'),
        enqueue('c'),
        { type: 'start' },
        { type: 'fail', id: 'b', reason: 'error' },
        { type: 'fail', id: 'a', reason: 'cap' },
      ),
      { type: 'retry', id: 'a' },
    );
    expect(state.scans.find((s) => s.id === 'b')?.status).toBe('failed');
  });
});

describe('Split limit (epic review #21)', () => {
  it('refuses to split when the result would pass the Scan Session limit', () => {
    let state = run(
      enqueue('r1', { mode: 'receipt' }),
      enqueue('r2', { mode: 'receipt' }),
      { type: 'start' },
      { type: 'read', id: 'r1', lines: [line] },
      { type: 'read', id: 'r2', lines: [line] },
      { type: 'merge', id: 'r2' },
    );
    for (let i = 0; i < MAX_SESSION_SCANS - 1; i += 1)
      state = sessionReducer(state, enqueue(`p${i}`));
    expect(state.scans).toHaveLength(MAX_SESSION_SCANS);
    expect(sessionReducer(state, { type: 'split', id: 'r1' })).toBe(state);
  });
});

describe('thumbnails of merged Scans (epic review #6)', () => {
  const revoke = vi.fn();
  afterEach(() => {
    resetScanSession();
    revoke.mockReset();
  });

  it('keeps the absorbed receipt thumbnail alive through Merge, so Split can show it', () => {
    URL.revokeObjectURL = revoke;
    for (const id of ['r1', 'r2'])
      dispatchScanSession(
        enqueue(id, { mode: 'receipt', thumbnail: `blob:${id}` }),
      );
    dispatchScanSession({ type: 'start' });
    dispatchScanSession({ type: 'read', id: 'r1', lines: [line] });
    dispatchScanSession({ type: 'read', id: 'r2', lines: [line] });
    dispatchScanSession({ type: 'merge', id: 'r2' });
    dispatchScanSession({ type: 'split', id: 'r1' });
    expect(revoke).not.toHaveBeenCalledWith('blob:r2');
    expect(revoke).not.toHaveBeenCalledWith('blob:r1');
  });
});

describe('merging after an edit (N1)', () => {
  it('keeps the lower receipt lines when the upper one was edited first', () => {
    const edited = [toReviewLine({ ...line, name: 'Eggs' }, 'k', new Date())];
    const state = run(
      enqueue('a', { mode: 'receipt' }),
      enqueue('b', { mode: 'receipt' }),
      { type: 'start' },
      { type: 'read', id: 'a', lines: [line] },
      { type: 'read', id: 'b', lines: [{ ...line, name: 'Jam' }] },
      { type: 'edit', id: 'a', lines: edited },
      { type: 'merge', id: 'b' },
    );
    expect(reviewLinesOf(state.scans[0]).map((l) => l.name)).toEqual([
      'Eggs',
      'Jam',
    ]);
  });
});

describe('Scans arriving after the Scan Cap (N2)', () => {
  const capHit = () =>
    run(
      enqueue('a'),
      { type: 'start' },
      { type: 'fail', id: 'a', reason: 'cap' },
    );

  it('fails a Scan enqueued after the cap with the cap', () => {
    const state = sessionReducer(capHit(), enqueue('late'));
    expect(state.scans[1]).toMatchObject({ status: 'failed', failure: 'cap' });
  });

  it('fails a cropped receipt with the cap', () => {
    const state = sessionReducer(
      sessionReducer(
        capHit(),
        enqueue('g', { mode: 'receipt', source: new Blob() }),
      ),
      { type: 'crop', id: 'g', image: 'cropped' },
    );
    expect(state.scans[1]).toMatchObject({ status: 'failed', failure: 'cap' });
  });

  it('fails a retried non-cap failure with the cap', () => {
    const base = run(
      enqueue('a'),
      enqueue('b'),
      { type: 'start' },
      { type: 'fail', id: 'b', reason: 'error' },
      { type: 'fail', id: 'a', reason: 'cap' },
    );
    const state = sessionReducer(base, { type: 'retry', id: 'b' });
    expect(state.scans[1]).toMatchObject({ status: 'failed', failure: 'cap' });
  });

  it('counts none of them as pending', () => {
    expect(pendingCount(sessionReducer(capHit(), enqueue('late')))).toBe(0);
  });
});

describe('Barcode cards in the Scan Session reducer', () => {
  const barcode = (id: string) =>
    enqueue(id, {
      mode: 'barcode',
      code: '5941234567899',
      image: undefined,
      scanLanguage: undefined,
    });

  it('holds a Barcode card with a code and no image, reading at once', () => {
    const state = run(barcode('a'));
    expect(state.scans[0]).toMatchObject({
      status: 'reading',
      code: '5941234567899',
    });
    expect(state.scans[0].image).toBeUndefined();
  });

  it('is not held by the Scan Cap, and never counts toward it', () => {
    const capped = run(
      enqueue('p'),
      { type: 'start' },
      { type: 'fail', id: 'p', reason: 'cap' },
    );
    expect(sessionHeld(capped)).toBe(true);
    expect(sessionReducer(capped, barcode('b')).scans[1].status).toBe(
      'reading',
    );

    const failed = run(barcode('b'), {
      type: 'fail',
      id: 'b',
      reason: 'cap',
    });
    expect(failed.scans[0].failure).toBe('error');
    expect(sessionHeld(failed)).toBe(false);
  });

  it('does not take a photo read slot', () => {
    const state = run(
      barcode('b1'),
      barcode('b2'),
      enqueue('p1'),
      enqueue('p2'),
      {
        type: 'start',
      },
    );
    expect(status(state)).toEqual([
      ['b1', 'reading'],
      ['b2', 'reading'],
      ['p1', 'reading'],
      ['p2', 'reading'],
    ]);
  });

  it('retries a failed lookup straight to reading, even while the cap holds Scans', () => {
    const state = run(
      enqueue('p'),
      { type: 'start' },
      { type: 'fail', id: 'p', reason: 'cap' },
      barcode('b'),
      { type: 'fail', id: 'b', reason: 'error' },
      { type: 'retry', id: 'b' },
    );
    expect(state.scans[1].status).toBe('reading');
  });
});

describe('canRetry, the one rule for the retry buttons', () => {
  const failed = (errorCode?: string) => ({
    id: 'x',
    mode: 'product' as const,
    thumbnail: '',
    status: 'failed' as const,
    errorCode,
  });

  it.each(['network_error', 'internal', 'barcode.rate_limited', undefined])(
    'lets a failure with %s be retried',
    (code) => {
      expect(canRetry(failed(code))).toBe(true);
    },
  );

  it.each([
    'scan.too_many_items',
    'scan.image_too_large',
    'scan.image_invalid',
    'scan.nothing_found',
  ])('does not let a failure with %s be retried', (code) => {
    expect(canRetry(failed(code))).toBe(false);
  });
});

describe('the Scan Session as a background item', () => {
  afterEach(() => resetScanSession());
  const scan = (id: string) => ({
    id,
    mode: 'receipt' as const,
    scanLanguage: 'en' as const,
    image: 'data:image/jpeg;base64,YQ==',
    thumbnail: 'data:image/jpeg;base64,YQ==',
  });

  it('is stamped on the shared clock when its first Scan joins, not again by later Scans', () => {
    const before = nextBackgroundOrder();
    dispatchScanSession({ type: 'enqueue', scan: scan('a') });
    const stamped = getScanSessionOrder();
    expect(stamped).toBeGreaterThan(before);
    dispatchScanSession({ type: 'enqueue', scan: scan('b') });
    expect(getScanSessionOrder()).toBe(stamped);
    expect(nextBackgroundOrder()).toBeGreaterThan(stamped);
  });

  it('forgets the failures it announced when it ends', () => {
    announceScanFailed(2);
    expect(announcedScanFailed()).toBe(2);
    resetScanSession();
    expect(announcedScanFailed()).toBe(0);
  });
});

describe('isBarcodeCard', () => {
  it('narrows a list of Session scans to Barcode cards', () => {
    const scans: SessionScan[] = [
      { id: 'a', mode: 'barcode', status: 'queued', thumbnail: 't' },
      { id: 'b', mode: 'product', status: 'queued', thumbnail: 't' },
    ];
    const barcodes = scans.filter(isBarcodeCard);
    expect(barcodes.map((scan) => scan.id)).toEqual(['a']);
    expectTypeOf(barcodes[0].mode).toEqualTypeOf<'barcode'>();
  });
});
