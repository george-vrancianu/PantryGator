import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { createVoiceNote, type VoiceNote, type VoiceNotice } from './voiceNote';
import { MicrophoneError, type MicrophoneSession } from './microphone';
import type { VoiceNoteRequest, VoiceNoteResult } from './voice';

const action = (id: string) =>
  ({ id, kind: 'add', quantity: 1, name: id }) as never;

const result = (...ids: string[]): VoiceNoteResult =>
  ({ transcript: 'milk and eggs', actions: ids.map(action) }) as never;

const recording = {
  blob: new Blob(['x']),
  mimeType: 'audio/webm',
  durationMs: 2000,
};

const options = {
  spokenLanguage: 'en',
  defaultTarget: 'shopping',
} as const;

/** A live fake microphone session that stops with `audio`. */
const fakeSession = (audio = recording) => ({
  stop: vi.fn(() => Promise.resolve(audio)),
  cancel: vi.fn(),
  level: vi.fn(() => 0),
});

/** Lets every promise already on its way settle. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** Records with the fake microphone and lets go: the note is sent to be read. */
async function record(
  note: VoiceNote,
  startOptions: {
    spokenLanguage: 'en' | 'ro';
    defaultTarget: 'shopping' | 'pantry';
  } = options,
) {
  await note.start(startOptions);
  await note.stop();
}

/** A fake sender whose answers the test settles by hand. */
function setup(retryDelayMs = 0) {
  const requests: VoiceNoteRequest[] = [];
  const pending: Array<{
    resolve: (value: VoiceNoteResult) => void;
    reject: (error: unknown) => void;
  }> = [];
  const send = vi.fn((request: VoiceNoteRequest) => {
    requests.push(request);
    return new Promise<VoiceNoteResult>((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  });
  // One release per lock taken, so the tests can tell whose lock was let go.
  const releases: Array<ReturnType<typeof vi.fn>> = [];
  const keepScreenAwake = vi.fn(() => {
    const release = vi.fn();
    releases.push(release);
    return release;
  });
  const notices: VoiceNotice[] = [];
  // The microphone hands out a session per start; a test can hold a start back with `micOpens`.
  const sessions: Array<ReturnType<typeof fakeSession>> = [];
  const startMicrophone = vi.fn((): Promise<MicrophoneSession> => {
    const live = fakeSession();
    sessions.push(live);
    return Promise.resolve(live);
  });
  const note = createVoiceNote({
    send,
    keepScreenAwake,
    startMicrophone,
    retryDelayMs,
    notify: (notice) => notices.push(notice),
  });
  const answer = (value: VoiceNoteResult, at = pending.length - 1) =>
    pending[at].resolve(value);
  const refuse = (error: unknown, at = pending.length - 1) =>
    pending[at].reject(error);
  /** Releases made so far, in the order the locks were taken. */
  const released = () => releases.map((r) => r.mock.calls.length);
  return {
    note,
    startMicrophone,
    sessions,
    send,
    requests,
    notices,
    keepScreenAwake,
    releases,
    released,
    answer,
    refuse,
  };
}

async function inReview(...ids: string[]) {
  const ctx = setup();
  await record(ctx.note, options);
  ctx.answer(result(...ids));
  await settle();
  // A note that is ready waits in the Voice Inbox until it is opened.
  ctx.note.openReady();
  return ctx;
}

/** Reads one recording and fails it with `error`. */
async function failedWith(error: unknown) {
  const ctx = setup();
  await record(ctx.note, options);
  ctx.refuse(error);
  await settle();
  // A network error is tried once more by itself before it fails.
  if (error instanceof ApiError && error.code === 'network_error') {
    ctx.refuse(error);
    await settle();
  }
  return ctx;
}

/** The first failed note in the Voice Inbox. */
const failure = (note: VoiceNote) =>
  note.getState().inbox.notes.find((n) => n.phase === 'failed');
/** Dismisses every failed note in the Voice Inbox. */
const dismissFailures = (note: VoiceNote) => {
  for (const n of note.getState().inbox.notes) {
    if (n.phase === 'failed') note.dismiss(n.id);
  }
};

/** Cancels the oldest Voice Note being read. */
const cancelFirst = (note: VoiceNote) =>
  note.cancelReading(
    note.getState().inbox.notes.find((n) => n.phase === 'reading')?.id,
  );

const ids = (note: ReturnType<typeof createVoiceNote>) =>
  note.getState().proposal?.actions.map((a) => a.id);

describe('Voice Note module', () => {
  describe('Review edits', () => {
    it('removes a Voice Action', async () => {
      const { note } = await inReview('a', 'b');
      note.remove('a');
      expect(ids(note)).toEqual(['b']);
    });

    it('edits one Voice Action and leaves the others', async () => {
      const { note } = await inReview('a', 'b');
      note.edit('b', { quantity: 7 });
      const [a, b] = note.getState().proposal!.actions;
      expect([a.quantity, b.quantity]).toEqual([1, 7]);
    });

    it('drops the Shopping Item row of the old Match when the Match changes', async () => {
      const ctx = setup();
      await record(ctx.note, options);
      ctx.answer({
        transcript: 'x',
        actions: [
          {
            id: 'a',
            target: 'shopping',
            op: 'check',
            rows: { shoppingItem: { id: 'row-1', name: 'Milk' } },
          },
        ],
      } as never);
      await settle();
      ctx.note.openReady();
      ctx.note.edit('a', { ingredient: { id: 'ing-eggs' } as never });
      expect(ctx.note.getState().proposal!.actions[0].rows.shoppingItem).toBe(
        undefined,
      );
    });

    it('takes the Shopping Item row an edit brings along with a new Match', async () => {
      const ctx = setup();
      await record(ctx.note, options);
      ctx.answer({
        transcript: 'x',
        actions: [{ id: 'a', target: 'shopping', op: 'check', rows: {} }],
      } as never);
      await settle();
      ctx.note.openReady();
      const item = {
        id: 'row-2',
        name: 'Eggs',
        quantity: null,
        unit: null,
        checked: false,
      };
      ctx.note.edit('a', {
        ingredient: { id: 'ing-eggs' } as never,
        shoppingItem: item,
      });
      expect(
        ctx.note.getState().proposal!.actions[0].rows.shoppingItem,
      ).toEqual(item);
    });

    it('ignores edits outside Review', () => {
      const { note } = setup();
      note.remove('a');
      note.edit('a', { quantity: 2 });
      expect(note.getState().proposal).toBeUndefined();
    });

    it('notifies subscribers of an edit', async () => {
      const { note } = await inReview('a');
      const listener = vi.fn();
      note.subscribe(listener);
      note.remove('a');
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('Apply', () => {
    it('applies only from Review', async () => {
      const { note, answer } = setup();
      note.applying();
      expect(note.getState().phase).toBe('idle');
      await record(note, options);
      note.applying();
      expect(note.getState().inbox.reading).toBe(1);
      answer(result('a'));
      await settle();
      // Ready, but not opened yet.
      note.applying();
      expect(note.getState().phase).toBe('idle');
      note.openReady();
      note.applying();
      expect(note.getState().phase).toBe('applying');
    });

    it('goes back to Review with the edits kept when Apply fails', async () => {
      const { note } = await inReview('a', 'b');
      note.remove('a');
      note.edit('b', { quantity: 9 });
      note.applying();
      note.applyFailed();
      expect(note.getState().phase).toBe('review');
      expect(ids(note)).toEqual(['b']);
      expect(note.getState().proposal!.actions[0].quantity).toBe(9);
    });

    it('ignores apply failed outside applying', async () => {
      const { note } = await inReview('a');
      note.applyFailed();
      expect(note.getState().phase).toBe('review');
    });

    it('ignores edits while applying', async () => {
      const { note } = await inReview('a');
      note.applying();
      note.remove('a');
      expect(ids(note)).toEqual(['a']);
    });

    it('ignores discard while applying', async () => {
      const { note } = await inReview('a');
      note.applying();
      note.discard();
      expect(note.getState().phase).toBe('applying');
    });

    it('discards from Review', async () => {
      const { note } = await inReview('a');
      note.discard();
      expect(note.getState().phase).toBe('idle');
      expect(note.getState().proposal).toBeUndefined();
    });

    it('returns to idle once applied', async () => {
      const { note } = await inReview('a');
      note.applying();
      note.applied();
      expect(note.getState()).toMatchObject({ phase: 'idle' });
      expect(note.getState().proposal).toBeUndefined();
    });

    it('ignores applied outside applying', async () => {
      const { note } = await inReview('a');
      note.applied();
      expect(note.getState().phase).toBe('review');
    });
  });

  describe('sending', () => {
    it('sends the recording with its language, page and local date', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 19, 12));
      try {
        const { note, requests, answer } = setup();
        await record(note, {
          spokenLanguage: 'ro',
          defaultTarget: 'pantry',
        });
        expect(note.getState().inbox.reading).toBe(1);
        expect(requests[0]).toMatchObject({
          recording,
          spokenLanguage: 'ro',
          defaultTarget: 'pantry',
          today: '2026-10-19',
        });
        answer(result('a'));
        await settle();
        note.openReady();
        expect(note.getState()).toMatchObject({
          phase: 'review',
          defaultTarget: 'pantry',
          proposal: { transcript: 'milk and eggs' },
          recording: { spokenLanguage: 'ro', durationMs: 2000 },
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('reads two notes at once and starts the rest in recording order', async () => {
      const { note, send, requests, answer } = setup();
      for (const defaultTarget of ['shopping', 'pantry', 'shopping'] as const) {
        await record(note, { spokenLanguage: 'en', defaultTarget });
      }
      expect(send).toHaveBeenCalledTimes(2);
      expect(note.getState().inbox).toMatchObject({ reading: 3, ready: 0 });
      answer(result('a'), 1);
      await settle();
      // The second one was ready first, and the waiting third took its place.
      expect(send).toHaveBeenCalledTimes(3);
      expect(requests.map((r) => r.defaultTarget)).toEqual([
        'shopping',
        'pantry',
        'shopping',
      ]);
      expect(note.getState().inbox).toMatchObject({ reading: 2, ready: 1 });
    });

    it('sends each note with its own Default List and Spoken Language', async () => {
      const { note, requests, answer } = setup();
      await record(note, { spokenLanguage: 'ro', defaultTarget: 'pantry' });
      await record(note, { spokenLanguage: 'en', defaultTarget: 'shopping' });
      answer(result('a'), 1);
      answer(result('b'), 0);
      await settle();
      expect(requests.map((r) => [r.spokenLanguage, r.defaultTarget])).toEqual([
        ['ro', 'pantry'],
        ['en', 'shopping'],
      ]);
      // Oldest first, whichever was read first.
      note.openReady();
      expect(note.getState()).toMatchObject({
        defaultTarget: 'pantry',
        recording: { spokenLanguage: 'ro' },
      });
      expect(ids(note)).toEqual(['b']);
    });

    it('refuses a sixth Voice Note and says so', async () => {
      const { note, startMicrophone, notices } = setup();
      for (let i = 0; i < 5; i++) await record(note, options);
      expect(note.startBlocker()).toBe('full');
      expect(await note.start(options)).toBe('refused');
      expect(startMicrophone).toHaveBeenCalledTimes(5);
      expect(notices).toEqual(['inboxFull']);
    });

    it('records again once a note is out of the Voice Inbox', async () => {
      const { note, answer } = setup();
      for (let i = 0; i < 5; i++) await record(note, options);
      answer(result('a'), 0);
      await settle();
      note.openReady();
      note.discard();
      expect(note.startBlocker()).toBe('none');
    });

    it('refuses to start while a Review is open, and works again once it closes', async () => {
      const { note, startMicrophone } = await inReview('a');
      expect(note.startBlocker()).toBe('review');
      expect(await note.start(options)).toBe('refused');
      expect(startMicrophone).toHaveBeenCalledOnce();
      note.discard();
      expect(note.startBlocker()).toBe('none');
    });

    it('discarding or applying removes only that note', async () => {
      const { note, answer } = setup();
      await record(note, options);
      await record(note, options);
      answer(result('a'), 0);
      answer(result('b'), 1);
      await settle();
      note.openReady();
      expect(ids(note)).toEqual(['a']);
      note.applying();
      note.applied();
      expect(note.getState().inbox).toMatchObject({ total: 1, ready: 1 });
      note.openReady();
      expect(ids(note)).toEqual(['b']);
    });

    it('vibrates through the notifier once per note that becomes ready', async () => {
      const { note, notices, answer, refuse } = setup();
      await record(note, options);
      await record(note, options);
      answer(result('a'), 0);
      await settle();
      expect(notices).toEqual(['noteReady']);
      refuse(new ApiError('network_error', 0), 1);
      await settle();
      expect(notices).toEqual(['noteReady']);
    });

    it('registers a beforeunload prompt while a note is unapplied, and drops it when empty', async () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      const calls = (spy: typeof add) =>
        spy.mock.calls.filter(([type]) => type === 'beforeunload').length;
      const { note, answer } = setup();
      expect(calls(add)).toBe(0);
      await record(note, options);
      await record(note, options);
      expect(calls(add)).toBe(1);
      answer(result('a'), 0);
      answer(result('b'), 1);
      await settle();
      note.openReady();
      note.discard();
      expect(calls(remove)).toBe(0);
      note.openReady();
      note.discard();
      expect(calls(remove)).toBe(1);
      add.mockRestore();
      remove.mockRestore();
    });

    it('is emptied by clear: reads aborted, lock released, prompt removed', async () => {
      const remove = vi.spyOn(window, 'removeEventListener');
      const { note, requests, released } = setup();
      await record(note, options);
      await record(note, options);
      note.clear();
      expect(requests.every((r) => r.signal?.aborted)).toBe(true);
      expect(released()).toEqual([1]);
      expect(note.getState().inbox.total).toBe(0);
      expect(remove.mock.calls.some(([type]) => type === 'beforeunload')).toBe(
        true,
      );
      remove.mockRestore();
    });

    it('cancels one read by its own handle and starts the next waiting one', async () => {
      const { note, send, requests } = setup();
      for (let i = 0; i < 3; i++) await record(note, options);
      const [first] = note.getState().inbox.notes;
      note.cancelReading(first.id);
      expect(requests[0].signal?.aborted).toBe(true);
      expect(requests[1].signal?.aborted).toBe(false);
      expect(send).toHaveBeenCalledTimes(3);
      expect(note.getState().inbox.reading).toBe(2);
    });

    it('keeps recording and reading while a failed note waits in the Voice Inbox', async () => {
      const { note, send } = await failedWith(new ApiError('network_error', 0));
      expect(note.startBlocker()).toBe('none');
      await record(note, options);
      // Two tries for the failed note, one for the new one.
      expect(send).toHaveBeenCalledTimes(3);
      expect(note.getState().phase).toBe('idle');
      expect(note.getState().inbox).toMatchObject({ reading: 1, failed: 1 });
    });
  });

  describe('failures', () => {
    it('hears nothing from an empty transcript', async () => {
      const ctx = setup();
      await record(ctx.note, options);
      ctx.answer({ transcript: '  ', actions: [] } as never);
      await settle();
      // The note stays in the Voice Inbox with its own Spoken Language and its recording.
      expect(failure(ctx.note)).toMatchObject({
        error: 'nothingHeard',
        spokenLanguage: 'en',
        canRetry: true,
      });
      expect(ctx.note.getState().phase).toBe('idle');
      expect(ctx.released()).toEqual([1]);
    });

    it.each([
      ['voice.nothing_heard', 'nothingHeard', true],
      ['voice.too_long', 'tooLong', false],
      ['voice.unsupported_audio', 'unsupported', false],
    ] as const)(
      'maps %s to %s (recording kept: %s)',
      async (code, error, kept) => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { note, released } = await failedWith(new ApiError(code, 422));
        expect(failure(note)).toMatchObject({
          error,
          canRetry: kept,
          rawError: undefined,
          spokenLanguage: 'en',
          durationMs: 2000,
        });
        expect(released()).toEqual([1]);
      },
    );

    it.each(['network_error', 'voice.provider_unavailable'])(
      'keeps the recording for Retry when %s, with no raw error',
      async (code) => {
        const { note } = await failedWith(new ApiError(code, 503));
        const failed = failure(note);
        expect(failed).toMatchObject({ error: 'failed', canRetry: true });
        expect(failed?.rawError).toBeUndefined();
      },
    );

    it('keeps the raw code and parameters of any other API error', async () => {
      const { note } = await failedWith(
        new ApiError('voice.audio_unreadable', 422, { limit: 3 }),
      );
      expect(failure(note)).toMatchObject({
        error: 'failed',
        rawError: { code: 'voice.audio_unreadable', params: { limit: 3 } },
        canRetry: true,
      });
    });

    it('keeps an unknown code for an error that is not an API error', async () => {
      const { note } = await failedWith(new TypeError('boom'));
      expect(failure(note)).toMatchObject({
        error: 'failed',
        rawError: { code: 'unknown', params: {} },
      });
    });

    it('ignores a failure from the wrong phase', async () => {
      const { note } = await inReview('a');
      note.fail('unavailable');
      expect(note.getState().phase).toBe('review');
    });

    it('does not fail a read in flight', async () => {
      const { note } = setup();
      await record(note, options);
      note.fail('unavailable');
      expect(note.getState().inbox.reading).toBe(1);
    });

    it('fails before a read, for a browser that cannot record', () => {
      const { note, notices } = setup();
      note.fail('unavailable');
      expect(failure(note)).toMatchObject({
        error: 'unavailable',
        canRetry: false,
      });
      expect(notices).toEqual([]);
    });

    it('drops the note quietly when Voice Notes are switched off', async () => {
      const { note, notices, released } = await failedWith(
        new ApiError('voice.not_configured', 503),
      );
      expect(note.getState()).toMatchObject({ phase: 'idle' });
      expect(note.getState().recording).toBeUndefined();
      expect(notices).toEqual(['switchedOff']);
      expect(released()).toEqual([1]);
    });
  });

  describe('Dismiss', () => {
    it('closes a failure that kept no recording without a notice', async () => {
      const { note, notices } = await failedWith(
        new ApiError('voice.too_long', 400),
      );
      expect(failure(note)?.canRetry).toBe(false);
      note.dismiss(failure(note)?.id ?? -1);
      expect(note.getState().inbox.total).toBe(0);
      expect(notices).toEqual([]);
    });

    it('discards a failure that kept its recording, with a notice', async () => {
      const { note, notices } = await failedWith(
        new ApiError('network_error', 0),
      );
      expect(failure(note)?.canRetry).toBe(true);
      note.dismiss(failure(note)?.id ?? -1);
      expect(note.getState().inbox.total).toBe(0);
      expect(notices).toEqual(['discarded']);
    });

    it('ignores a note that is not a failure', async () => {
      const { note, notices } = await inReview('a');
      note.dismiss(1);
      expect(note.getState().phase).toBe('review');
      expect(notices).toEqual(['noteReady']);
    });
  });

  describe('Voice Cap', () => {
    const capped = (resetsAt?: unknown) =>
      failedWith(new ApiError('voice.cap_reached', 429, { cap: 5, resetsAt }));

    it('is in force until the reset time the server gave', async () => {
      const { note } = await capped('2999-01-01T00:00:00.000Z');
      const reset = Date.parse('2999-01-01T00:00:00.000Z');
      expect(failure(note)).toMatchObject({ error: 'capReached' });
      expect(note.getState().voiceCap).toEqual({ cap: 5, resetsAt: reset });
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(reset - 1);
        expect(note.isCapReached()).toBe(true);
        vi.setSystemTime(reset);
        expect(note.isCapReached()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ['missing', undefined],
      ['unreadable', 'tomorrow-ish'],
      ['not a string', 12345],
    ])(
      'lifts at the next UTC midnight when the reset time is %s',
      async (_, resetsAt) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.UTC(2026, 9, 19, 23, 30));
        try {
          const { note } = await capped(resetsAt);
          const midnight = Date.UTC(2026, 9, 20);
          expect(note.getState().voiceCap?.resetsAt).toBe(midnight);
          vi.setSystemTime(midnight - 1);
          expect(note.isCapReached()).toBe(true);
          vi.setSystemTime(midnight);
          expect(note.isCapReached()).toBe(false);
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it('keeps the cap through a new Voice Note', async () => {
      const { note } = await capped('2999-01-01T00:00:00.000Z');
      dismissFailures(note);
      await record(note, options);
      expect(note.isCapReached()).toBe(true);
    });

    it('lifts by itself: subscribers hear it and see a new state', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(Date.UTC(2026, 9, 19, 10));
        const { note } = await capped(
          new Date(Date.UTC(2026, 9, 19, 11)).toISOString(),
        );
        dismissFailures(note);
        const before = note.getState();
        const listener = vi.fn();
        note.subscribe(listener);
        expect(note.isCapReached()).toBe(true);

        vi.advanceTimersByTime(60 * 60 * 1000 - 1);
        expect(listener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);

        expect(listener).toHaveBeenCalledOnce();
        expect(note.getState()).not.toBe(before);
        expect(note.isCapReached()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignores a reset time already past', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(Date.UTC(2026, 9, 19, 10));
        const { note } = await capped('2026-10-19T09:00:00.000Z');
        const listener = vi.fn();
        note.subscribe(listener);
        vi.runAllTimers();
        expect(listener).not.toHaveBeenCalled();
        expect(note.isCapReached()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Review all limit', () => {
    const actions = (prefix: string, count: number, status: string) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${prefix}${i}`,
        status,
      }));
    async function twoNotes(first: unknown[], second: unknown[]) {
      const ctx = setup();
      await record(ctx.note, options);
      await record(ctx.note, options);
      ctx.answer({ transcript: 'a', actions: first } as never, 0);
      ctx.answer({ transcript: 'b', actions: second } as never, 1);
      await settle();
      return ctx;
    }

    it('counts only Voice Actions Apply can send toward the 50', async () => {
      const ctx = await twoNotes(
        [...actions('a', 30, 'ready'), ...actions('n', 10, 'notUnderstood')],
        [...actions('b', 20, 'ready'), ...actions('f', 10, 'notFound')],
      );
      expect(ctx.note.openMerged()).toBe('opened');
    });

    it('refuses more than 50 sendable Voice Actions', async () => {
      const ctx = await twoNotes(
        actions('a', 26, 'ready'),
        actions('b', 25, 'needsBatch'),
      );
      expect(ctx.note.openMerged()).toBe('tooMany');
    });
  });

  describe('automatic retry', () => {
    it('sends a network error once more by itself, and reads the note if that works', async () => {
      const ctx = setup();
      await record(ctx.note, options);
      ctx.refuse(new ApiError('network_error', 0));
      await settle();
      expect(ctx.send).toHaveBeenCalledTimes(2);
      expect(ctx.requests[1]).toMatchObject({
        recording,
        spokenLanguage: 'en',
      });
      expect(ctx.note.getState().inbox).toMatchObject({
        reading: 1,
        failed: 0,
      });
      ctx.answer(result('a'));
      await settle();
      expect(ctx.note.getState().inbox).toMatchObject({ ready: 1, failed: 0 });
      // One lock for the whole read, released once.
      expect(ctx.released()).toEqual([1]);
    });

    it('waits before the second try, and stops waiting if the note is cancelled', async () => {
      vi.useFakeTimers();
      try {
        const ctx = setup(1500);
        await record(ctx.note, options);
        ctx.refuse(new ApiError('network_error', 0));
        await vi.advanceTimersByTimeAsync(1499);
        expect(ctx.send).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        expect(ctx.send).toHaveBeenCalledTimes(2);

        const second = setup(1500);
        await record(second.note, options);
        second.refuse(new ApiError('network_error', 0));
        await settle();
        cancelFirst(second.note);
        await vi.advanceTimersByTimeAsync(5000);
        expect(second.send).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });

    it('fails with the recording kept when the second try fails too, and does not try a third', async () => {
      const ctx = await failedWith(new ApiError('network_error', 0));
      expect(ctx.send).toHaveBeenCalledTimes(2);
      expect(failure(ctx.note)).toMatchObject({
        error: 'failed',
        canRetry: true,
      });
    });

    it.each([
      ['voice.provider_unavailable'],
      ['voice.audio_unreadable'],
      ['voice.too_long'],
    ])('does not retry %s by itself', async (code) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const ctx = await failedWith(new ApiError(code, 500));
      expect(ctx.send).toHaveBeenCalledOnce();
    });

    it('gives a Member Retry a fresh automatic retry', async () => {
      const ctx = await failedWith(new ApiError('network_error', 0));
      void ctx.note.retry(failure(ctx.note)?.id);
      ctx.refuse(new ApiError('network_error', 0));
      await settle();
      expect(ctx.send).toHaveBeenCalledTimes(4);
    });

    it('stops at an abort between the tries', async () => {
      const ctx = setup();
      await record(ctx.note, options);
      cancelFirst(ctx.note);
      ctx.refuse(new ApiError('network_error', 0));
      await settle();
      expect(ctx.send).toHaveBeenCalledOnce();
      expect(ctx.note.getState().inbox.total).toBe(0);
    });
  });

  describe('Voice Cap across the Voice Inbox', () => {
    const cap = () =>
      new ApiError('voice.cap_reached', 429, {
        cap: 5,
        resetsAt: '2999-01-01T00:00:00.000Z',
      });

    /** Three notes: the first two are in flight, the third waits. */
    async function threeNotes() {
      const ctx = setup();
      for (let i = 0; i < 3; i++) await record(ctx.note, options);
      return ctx;
    }

    it('fails the note that reached the cap and those waiting behind it, and leaves earlier notes usable', async () => {
      const ctx = setup();
      for (let i = 0; i < 4; i++) await record(ctx.note, options);
      // The first is read, so the third starts; the second reaches the cap while the fourth waits.
      ctx.answer(result('a'), 0);
      await settle();
      ctx.refuse(cap(), 1);
      await settle();
      const { notes } = ctx.note.getState().inbox;
      expect(notes.map((n) => n.phase)).toEqual([
        'review',
        'failed',
        'reading',
        'failed',
      ]);
      expect(notes.map((n) => n.error)).toEqual([
        undefined,
        'capReached',
        undefined,
        'capReached',
      ]);
      expect(notes.filter((n) => n.error).every((n) => n.canRetry)).toBe(true);
      // The fourth was never sent.
      expect(ctx.send).toHaveBeenCalledTimes(3);
    });

    it('does not send the waiting note once the cap failed it', async () => {
      const ctx = setup();
      for (let i = 0; i < 4; i++) await record(ctx.note, options);
      ctx.refuse(cap(), 0);
      await settle();
      // Note 2 is still in flight; 3 and 4 failed with the cap without being sent.
      expect(ctx.send).toHaveBeenCalledTimes(2);
      expect(ctx.note.getState().inbox.notes.map((n) => n.error)).toEqual([
        'capReached',
        undefined,
        'capReached',
        'capReached',
      ]);
    });

    it('releases every note that failed with the cap when one is retried', async () => {
      const ctx = await threeNotes();
      ctx.refuse(cap(), 0);
      await settle();
      ctx.refuse(cap(), 1);
      await settle();
      expect(ctx.note.getState().inbox).toMatchObject({
        failed: 3,
        reading: 0,
      });
      void ctx.note.retry(ctx.note.getState().inbox.notes[1].id);
      expect(ctx.note.getState().inbox).toMatchObject({
        failed: 0,
        reading: 3,
      });
      // Two read at once again; the cap is no longer assumed.
      expect(ctx.send).toHaveBeenCalledTimes(4);
      expect(ctx.note.isCapReached()).toBe(false);
    });

    it('does not release a note that failed for another reason', async () => {
      const ctx = setup();
      await record(ctx.note, options);
      await record(ctx.note, options);
      ctx.refuse(new ApiError('voice.audio_unreadable', 422), 0);
      await settle();
      ctx.refuse(cap(), 1);
      await settle();
      void ctx.note.retry(ctx.note.getState().inbox.notes[1].id);
      const { notes } = ctx.note.getState().inbox;
      expect(notes.map((n) => n.phase)).toEqual(['failed', 'reading']);
    });
  });

  describe('Out of Credits across the Voice Inbox', () => {
    const outOfCredits = () =>
      new ApiError('credits.insufficient', 402, { price: 1, balance: 0 });

    it('fails the note that was refused and those waiting behind it, keeping their recordings', async () => {
      const ctx = setup();
      for (let i = 0; i < 3; i++) await record(ctx.note, options);
      ctx.refuse(outOfCredits(), 0);
      await settle();
      const { notes } = ctx.note.getState().inbox;
      expect(notes.map((n) => n.error)).toEqual([
        'outOfCredits',
        undefined,
        'outOfCredits',
      ]);
      expect(notes.filter((n) => n.error).every((n) => n.canRetry)).toBe(true);
      // The third was never sent, and no Voice Cap was assumed.
      expect(ctx.send).toHaveBeenCalledTimes(2);
      expect(ctx.note.isCapReached()).toBe(false);
    });

    it('Read again releases the notes it held and sends them', async () => {
      const ctx = setup();
      for (let i = 0; i < 3; i++) await record(ctx.note, options);
      ctx.refuse(outOfCredits(), 0);
      await settle();
      void ctx.note.retry(ctx.note.getState().inbox.notes[0].id);
      expect(ctx.note.getState().inbox).toMatchObject({
        failed: 0,
        reading: 3,
      });
      expect(ctx.send.mock.calls.length).toBeGreaterThan(2);
    });
  });

  describe('nothing heard', () => {
    it('stays in the Voice Inbox until retried or discarded', async () => {
      vi.useFakeTimers();
      try {
        const ctx = setup();
        await record(ctx.note, options);
        ctx.answer({ transcript: '', actions: [] } as never);
        await settle();
        expect(ctx.note.getState().inbox.failed).toBe(1);
        vi.advanceTimersByTime(60_000);
        expect(ctx.note.getState().inbox.total).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Retry', () => {
    it('resends the kept recording in its language and for its page', async () => {
      const ctx = setup();
      await record(ctx.note, {
        spokenLanguage: 'ro',
        defaultTarget: 'pantry',
      });
      ctx.refuse(new ApiError('network_error', 0));
      await settle();

      ctx.refuse(new ApiError('network_error', 0));
      await settle();
      const second = ctx.note.retry(failure(ctx.note)?.id);
      expect(ctx.note.getState().inbox.reading).toBe(1);
      expect(ctx.requests[2]).toMatchObject({
        recording,
        spokenLanguage: 'ro',
        defaultTarget: 'pantry',
      });
      ctx.answer(result('a'));
      await second;
      await settle();
      ctx.note.openReady();
      expect(ctx.note.getState()).toMatchObject({
        phase: 'review',
        defaultTarget: 'pantry',
      });
    });

    it('takes the screen lock again and releases it once', async () => {
      const ctx = setup();
      await record(ctx.note, options);
      ctx.refuse(new ApiError('network_error', 0));
      await settle();
      ctx.refuse(new ApiError('network_error', 0));
      await settle();
      expect(ctx.released()).toEqual([1]);

      const second = ctx.note.retry(failure(ctx.note)?.id);
      expect(ctx.released()).toEqual([1, 0]);
      ctx.answer(result('a'));
      await second;
      expect(ctx.released()).toEqual([1, 1]);
    });

    it('does nothing without a kept recording', async () => {
      const ctx = await failedWith(new ApiError('voice.too_long', 413));
      void ctx.note.retry(failure(ctx.note)?.id);
      expect(ctx.send).toHaveBeenCalledOnce();
      expect(failure(ctx.note)).toBeDefined();
    });
  });

  describe('Cancel reading', () => {
    it('aborts the request, drops the note and tells the Member', async () => {
      const { note, requests, notices, released } = setup();
      await record(note, options);
      cancelFirst(note);
      expect(requests[0].signal?.aborted).toBe(true);
      expect(note.getState()).toMatchObject({ phase: 'idle' });
      expect(note.getState().recording).toBeUndefined();
      expect(notices).toEqual(['readCancelled']);
      expect(released()).toEqual([1]);
    });

    it('ignores a late answer', async () => {
      const { note, answer } = setup();
      await record(note, options);
      cancelFirst(note);
      answer(result('a'));
      await settle();
      expect(note.getState()).toMatchObject({ phase: 'idle' });
      expect(note.getState().proposal).toBeUndefined();
    });

    it('ignores a late failure', async () => {
      const { note, refuse, notices } = setup();
      await record(note, options);
      cancelFirst(note);
      refuse(new ApiError('voice.not_configured', 503));
      await settle();
      expect(note.getState().phase).toBe('idle');
      expect(notices).toEqual(['readCancelled']);
    });

    it('does nothing outside a read', async () => {
      const { note, notices } = await inReview('a');
      cancelFirst(note);
      expect(note.getState().phase).toBe('review');
      expect(notices).toEqual(['noteReady']);
    });

    it('leaves a read that settled alone', async () => {
      const { note, notices } = await failedWith(
        new ApiError('network_error', 0),
      );
      cancelFirst(note);
      expect(failure(note)).toBeDefined();
      expect(notices).toEqual([]);
    });
  });

  describe('recording', () => {
    it('goes live on a page, stamped with the time it started', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 19, 12));
      try {
        const { note, startMicrophone } = setup();
        const outcome = await note.start({
          ...options,
          defaultTarget: 'pantry',
        });
        expect(outcome).toBe('started');
        expect(startMicrophone).toHaveBeenCalledOnce();
        expect(note.getState()).toMatchObject({
          phase: 'recording',
          defaultTarget: 'pantry',
          startedAt: Date.now(),
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('sends what it recorded when the Member lets go', async () => {
      const { note, requests } = setup();
      await note.start({
        spokenLanguage: 'ro',
        defaultTarget: 'pantry',
      });
      expect(await note.stop()).toBe('sent');
      expect(note.getState().inbox.reading).toBe(1);
      expect(note.getState().startedAt).toBeUndefined();
      expect(requests[0]).toMatchObject({
        recording,
        spokenLanguage: 'ro',
        defaultTarget: 'pantry',
      });
    });

    it('reads the input level through the live session, and 0 otherwise', async () => {
      const { note, sessions } = setup();
      expect(note.level()).toBe(0);
      await note.start(options);
      sessions[0].level.mockReturnValue(0.6);
      expect(note.level()).toBe(0.6);
      await note.stop();
      expect(note.level()).toBe(0);
    });

    it('drops a recording that is too short, without a read', async () => {
      const { note, send, notices, released, startMicrophone } = setup();
      startMicrophone.mockResolvedValueOnce(
        fakeSession({ ...recording, durationMs: 299 }),
      );
      await note.start(options);
      expect(await note.stop()).toBe('tooShort');
      expect(send).not.toHaveBeenCalled();
      expect(note.getState().phase).toBe('idle');
      expect(notices).toEqual([]);
      expect(released()).toEqual([1]);
    });

    it('reads a recording of exactly the minimum length', async () => {
      const { note, send, startMicrophone } = setup();
      startMicrophone.mockResolvedValueOnce(
        fakeSession({ ...recording, durationMs: 300 }),
      );
      await note.start(options);
      expect(await note.stop()).toBe('sent');
      expect(send).toHaveBeenCalledOnce();
    });

    it('has nothing to stop when nothing records', async () => {
      const { note, released } = setup();
      expect(await note.stop()).toBe('notStarted');
      expect(released()).toEqual([]);
    });

    it('fails when the audio cannot be finalised', async () => {
      const { note, startMicrophone, released } = setup();
      const broken = fakeSession();
      broken.stop.mockRejectedValue(new Error('boom'));
      startMicrophone.mockResolvedValueOnce(broken);
      await note.start(options);
      expect(await note.stop()).toBe('notStarted');
      expect(failure(note)).toMatchObject({ error: 'unavailable' });
      expect(released()).toEqual([1]);
    });

    it('starts one microphone at a time', async () => {
      const { note, startMicrophone } = setup();
      const first = note.start(options);
      expect(await note.start(options)).toBe('refused');
      await first;
      expect(await note.start(options)).toBe('refused');
      expect(startMicrophone).toHaveBeenCalledOnce();
    });

    it('shuts the session when a failure arrives mid-recording', async () => {
      const { note, sessions, released } = setup();
      await note.start(options);
      note.fail('unavailable');
      expect(sessions[0].cancel).toHaveBeenCalledOnce();
      expect(failure(note)).toBeDefined();
      expect(released()).toEqual([1]);
    });

    it('does not send when the note ended while the audio was finalised', async () => {
      const { note, send, startMicrophone, released } = setup();
      let finish!: (audio: typeof recording) => void;
      const slow = fakeSession();
      slow.stop.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      startMicrophone.mockResolvedValueOnce(slow);
      await note.start(options);
      const stopped = note.stop();
      note.fail('unavailable');
      finish(recording);
      expect(await stopped).toBe('notStarted');
      expect(send).not.toHaveBeenCalled();
      expect(failure(note)).toBeDefined();
      expect(released()).toEqual([1]);
    });
  });

  describe('letting go before the microphone is live', () => {
    /** A microphone that opens only when the test says so. */
    function slowMicrophone() {
      const ctx = setup();
      const live = fakeSession();
      let open!: () => void;
      ctx.startMicrophone.mockReturnValueOnce(
        new Promise((resolve) => (open = () => resolve(live))),
      );
      return { ...ctx, live, open };
    }

    it('cancels the stream when it arrives and never records', async () => {
      const { note, send, live, open, released } = slowMicrophone();
      const started = note.start(options);
      expect(await note.stop()).toBe('notStarted');
      expect(live.cancel).not.toHaveBeenCalled();
      open();
      expect(await started).toBe('cancelled');
      expect(live.cancel).toHaveBeenCalledOnce();
      expect(note.getState().phase).toBe('idle');
      expect(send).not.toHaveBeenCalled();
      expect(released()).toEqual([1]);
    });

    it('cancels the stream when it arrives after a cancel, and says so', async () => {
      const { note, live, open, notices, released } = slowMicrophone();
      const started = note.start(options);
      note.cancel();
      open();
      expect(await started).toBe('cancelled');
      expect(live.cancel).toHaveBeenCalledOnce();
      expect(notices).toEqual(['recordingCancelled']);
      expect(released()).toEqual([1]);
    });

    it('says so for a cancel before the module was asked to start, and starts nothing', () => {
      const { note, notices, startMicrophone } = slowMicrophone();
      note.cancel({ beforeStart: true });
      expect(notices).toEqual(['recordingCancelled']);
      expect(startMicrophone).not.toHaveBeenCalled();
    });

    it('lets the screen sleep at once, not when the stream arrives', async () => {
      const { note, released } = slowMicrophone();
      void note.start(options);
      expect(released()).toEqual([0]);
      await note.stop();
      expect(released()).toEqual([1]);
    });

    it('does not let a new note start until the old stream is dealt with', async () => {
      const { note, live, open, startMicrophone } = slowMicrophone();
      const started = note.start(options);
      await note.stop();
      expect(await note.start(options)).toBe('refused');
      open();
      await started;
      expect(live.cancel).toHaveBeenCalledOnce();
      expect(startMicrophone).toHaveBeenCalledOnce();
    });

    it('reports a refused microphone even if the Member already let go', async () => {
      const { note, startMicrophone, released } = setup();
      let refuse!: (error: unknown) => void;
      startMicrophone.mockReturnValueOnce(
        new Promise((_, reject) => (refuse = reject)),
      );
      const started = note.start(options);
      await note.stop();
      refuse(new MicrophoneError('denied'));
      expect(await started).toBe('denied');
      expect(note.getState().phase).toBe('idle');
      expect(released()).toEqual([1]);
    });
  });

  describe('microphone refusals', () => {
    it('leaves the note idle when the microphone is denied, for the permission sheets', async () => {
      const { note, startMicrophone, released } = setup();
      startMicrophone.mockRejectedValueOnce(new MicrophoneError('denied'));
      expect(await note.start(options)).toBe('denied');
      expect(note.getState().phase).toBe('idle');
      expect(released()).toEqual([1]);
    });

    it.each([
      ['no microphone', new MicrophoneError('unavailable')],
      ['an unknown error', new Error('boom')],
    ])('fails the note on %s', async (_, error) => {
      const { note, startMicrophone, released } = setup();
      startMicrophone.mockRejectedValueOnce(error);
      expect(await note.start(options)).toBe('unavailable');
      expect(failure(note)).toMatchObject({ error: 'unavailable' });
      expect(released()).toEqual([1]);
    });
  });

  describe('start blocker', () => {
    it('is none when idle, and for a failure with no kept recording', async () => {
      const { note } = setup();
      expect(note.startBlocker()).toBe('none');
      const failed = await failedWith(new ApiError('voice.too_long', 413));
      expect(failed.note.startBlocker()).toBe('none');
    });

    it('is active while the microphone is starting', async () => {
      const ctx = setup();
      let open!: () => void;
      ctx.startMicrophone.mockReturnValueOnce(
        new Promise((resolve) => (open = () => resolve(fakeSession()))),
      );
      const started = ctx.note.start(options);
      expect(ctx.note.startBlocker()).toBe('active');
      expect(await ctx.note.start(options)).toBe('refused');
      expect(ctx.startMicrophone).toHaveBeenCalledOnce();
      open();
      expect(await started).toBe('started');
    });

    it('is active while recording', async () => {
      const { note, startMicrophone } = setup();
      await note.start(options);
      expect(note.startBlocker()).toBe('active');
      expect(await note.start(options)).toBe('refused');
      expect(startMicrophone).toHaveBeenCalledOnce();
    });

    it('is active while the audio is being finalised', async () => {
      const ctx = setup();
      let finish!: () => void;
      const live = fakeSession();
      live.stop.mockReturnValueOnce(
        new Promise((resolve) => (finish = () => resolve(recording))),
      );
      ctx.startMicrophone.mockReturnValueOnce(Promise.resolve(live));
      await ctx.note.start(options);
      const stopped = ctx.note.stop();
      expect(ctx.note.startBlocker()).toBe('active');
      expect(await ctx.note.start(options)).toBe('refused');
      finish();
      expect(await stopped).toBe('sent');
      expect(ctx.note.startBlocker()).toBe('none');
    });

    it('is free while notes are being read: a start begins a new note', async () => {
      const { note, startMicrophone } = setup();
      await record(note);
      expect(note.startBlocker()).toBe('none');
      expect(await note.start(options)).toBe('started');
      expect(startMicrophone).toHaveBeenCalledTimes(2);
      expect(note.getState().phase).toBe('recording');
      expect(note.getState().inbox.reading).toBe(1);
    });

    it('is none while a failed note waits for Retry: it never blocks recording', async () => {
      const { note, startMicrophone } = await failedWith(
        new ApiError('network_error', 0),
      );
      expect(note.startBlocker()).toBe('none');
      expect(await note.start(options)).toBe('started');
      expect(startMicrophone).toHaveBeenCalledTimes(2);
      expect(failure(note)).toMatchObject({ error: 'failed' });
    });

    it('counts failures with a kept recording toward the limit, and others not', async () => {
      const { note } = setup();
      // Four failures with no recording (the Voice Cap on a press) do not fill the Voice Inbox.
      for (let i = 0; i < 4; i++) note.fail('unavailable');
      for (let i = 0; i < 5; i++) await record(note, options);
      expect(note.getState().inbox.total).toBe(6);
      expect(note.startBlocker()).toBe('full');
    });

    it('is capped after the Voice Cap, and a capped start fails the note', async () => {
      const { note, startMicrophone } = await failedWith(
        new ApiError('voice.cap_reached', 429, {
          cap: 5,
          resetsAt: '2999-01-01T00:00:00.000Z',
        }),
      );
      dismissFailures(note);
      expect(note.startBlocker()).toBe('capped');
      expect(await note.start(options)).toBe('refused');
      expect(startMicrophone).toHaveBeenCalledOnce();
      expect(failure(note)).toMatchObject({
        error: 'capReached',
        canRetry: false,
      });
    });

    it('does not take the wake lock for a capped start', async () => {
      const ctx = await failedWith(
        new ApiError('voice.cap_reached', 429, {
          cap: 5,
          resetsAt: '2999-01-01T00:00:00.000Z',
        }),
      );
      dismissFailures(ctx.note);
      await ctx.note.start(options);
      expect(ctx.keepScreenAwake).toHaveBeenCalledOnce();
      expect(ctx.released()).toEqual([1]);
    });

    it('starts after a failure with no kept recording', async () => {
      const { note } = await failedWith(new ApiError('voice.too_long', 413));
      expect(await note.start(options)).toBe('started');
      expect(note.getState().phase).toBe('recording');
      // Not blocking, and not hidden by the next press either.
      expect(failure(note)).toMatchObject({ error: 'tooLong' });
    });

    it('refuses to start over Review', async () => {
      const { note, startMicrophone } = await inReview('a');
      expect(await note.start(options)).toBe('refused');
      expect(note.getState().phase).toBe('review');
      expect(startMicrophone).toHaveBeenCalledOnce();
    });
  });

  describe('the 60-second limit', () => {
    afterEach(() => vi.useRealTimers());

    it('stops, tells the Member and sends the note', async () => {
      vi.useFakeTimers();
      const { note, notices, requests, sessions } = setup();
      await note.start(options);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(note.getState().phase).toBe('recording');
      expect(notices).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(notices).toEqual(['stoppedAtLimit']);
      expect(sessions[0].stop).toHaveBeenCalledOnce();
      expect(note.getState().inbox.reading).toBe(1);
      expect(requests).toHaveLength(1);
    });

    it('is not kept running by a recording that was let go', async () => {
      vi.useFakeTimers();
      const { note, notices, send } = setup();
      await note.start(options);
      await note.stop();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(notices).toEqual([]);
      expect(send).toHaveBeenCalledOnce();
    });

    it('is not kept running by a cancelled recording', async () => {
      vi.useFakeTimers();
      const { note, notices, sessions } = setup();
      await note.start(options);
      note.cancel({ quiet: true });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(notices).toEqual([]);
      expect(sessions[0].stop).not.toHaveBeenCalled();
    });

    it('starts counting when the microphone is live, not when asked', async () => {
      vi.useFakeTimers();
      const { note, startMicrophone, notices } = setup();
      let open!: () => void;
      startMicrophone.mockReturnValueOnce(
        new Promise((resolve) => (open = () => resolve(fakeSession()))),
      );
      const started = note.start(options);
      await vi.advanceTimersByTimeAsync(50_000);
      open();
      await started;
      await vi.advanceTimersByTimeAsync(59_000);
      expect(notices).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(notices).toEqual(['stoppedAtLimit']);
    });
  });

  describe('cancel', () => {
    it('throws the recording away and says so', async () => {
      const { note, sessions, send, notices, released } = setup();
      await note.start(options);
      note.cancel();
      expect(sessions[0].cancel).toHaveBeenCalledOnce();
      expect(note.getState()).toMatchObject({ phase: 'idle' });
      expect(send).not.toHaveBeenCalled();
      expect(notices).toEqual(['recordingCancelled']);
      expect(released()).toEqual([1]);
    });

    it('says nothing when quiet (the page was left)', async () => {
      const { note, sessions, notices, released } = setup();
      await note.start(options);
      note.cancel({ quiet: true });
      expect(sessions[0].cancel).toHaveBeenCalledOnce();
      expect(note.getState().phase).toBe('idle');
      expect(notices).toEqual([]);
      expect(released()).toEqual([1]);
    });

    it.each([[false], [true]])(
      'leaves a read in flight and its wake lock alone (quiet: %s)',
      async (quiet) => {
        const { note, requests, notices, released } = setup();
        await record(note);
        note.cancel({ quiet });
        expect(note.getState().inbox.reading).toBe(1);
        expect(requests[0].signal?.aborted).toBe(false);
        expect(notices).toEqual([]);
        expect(released()).toEqual([0]);
      },
    );

    it('does nothing, and says nothing, with nothing recording', () => {
      const { note, notices, released } = setup();
      note.cancel();
      expect(notices).toEqual([]);
      expect(released()).toEqual([]);
    });

    it('cancels once however often it is called', async () => {
      const { note, sessions, notices, released } = setup();
      await note.start(options);
      note.cancel();
      note.cancel();
      expect(sessions[0].cancel).toHaveBeenCalledOnce();
      expect(notices).toEqual(['recordingCancelled']);
      expect(released()).toEqual([1]);
    });
  });

  describe('wake lock', () => {
    it('is taken at start and kept while recording', async () => {
      const { note, keepScreenAwake, released } = setup();
      await note.start(options);
      expect(keepScreenAwake).toHaveBeenCalledOnce();
      expect(released()).toEqual([0]);
    });

    it('is taken as the microphone is asked for, before it is live', async () => {
      const { note, keepScreenAwake, startMicrophone } = setup();
      startMicrophone.mockReturnValueOnce(new Promise(() => {}));
      void note.start(options);
      expect(keepScreenAwake).toHaveBeenCalledOnce();
    });

    it('is the same lock from start through the read, released once when the read settles', async () => {
      const { note, answer, keepScreenAwake, released } = setup();
      await record(note);
      expect(keepScreenAwake).toHaveBeenCalledOnce();
      expect(released()).toEqual([0]);
      answer(result('a'));
      await settle();
      note.openReady();
      expect(note.getState().phase).toBe('review');
      expect(released()).toEqual([1]);
    });

    it('is held while any read is in flight, released when the last settles', async () => {
      const { note, answer, keepScreenAwake, released } = setup();
      await record(note);
      await record(note);
      expect(keepScreenAwake).toHaveBeenCalledOnce();
      answer(result('a'), 0);
      await settle();
      expect(released()).toEqual([0]);
      answer(result('b'), 1);
      await settle();
      expect(released()).toEqual([1]);
    });

    it.each([
      ['fails', new ApiError('network_error', 0)],
      ['is refused', new ApiError('voice.too_long', 413)],
    ])('is released once when the read %s', async (_, error) => {
      const { note, refuse, released } = setup();
      await record(note);
      refuse(error);
      await settle();
      if (error.code === 'network_error') {
        refuse(error);
        await settle();
      }
      expect(released()).toEqual([1]);
    });

    it('is released once when nothing was heard', async () => {
      const { note, answer, released } = setup();
      await record(note);
      answer({ transcript: '', actions: [] } as never);
      await settle();
      expect(released()).toEqual([1]);
    });

    it('is released when Voice Notes are switched off', async () => {
      const { released } = await failedWith(
        new ApiError('voice.not_configured', 503),
      );
      expect(released()).toEqual([1]);
    });

    it('is released once when the Member cancels while recording', async () => {
      const { note, released } = setup();
      await note.start(options);
      note.cancel();
      note.cancel({ quiet: true });
      expect(released()).toEqual([1]);
    });

    it('takes the lock again for a Retry and releases it once', async () => {
      const ctx = await failedWith(new ApiError('network_error', 0));
      expect(ctx.released()).toEqual([1]);
      void ctx.note.retry(failure(ctx.note)?.id);
      expect(ctx.released()).toEqual([1, 0]);
      ctx.answer(result('a'));
      await settle();
      expect(ctx.released()).toEqual([1, 1]);
    });

    it('keeps the screen awake across a page switch while reading', async () => {
      const { note, answer, released } = setup();
      await note.start(options);
      await note.stop();
      // The page that started the note unmounts.
      note.cancel({ quiet: true });
      expect(released()).toEqual([0]);
      answer(result('a'));
      await settle();
      expect(released()).toEqual([1]);
    });

    it('leaks nothing when a transition is a no-op because of a phase guard', async () => {
      const ctx = await inReview('a');
      // A start over Review, a stop and a cancel with nothing recording: none may take or keep a lock.
      await ctx.note.start(options);
      await ctx.note.stop();
      ctx.note.cancel();
      expect(ctx.keepScreenAwake).toHaveBeenCalledOnce();
      expect(ctx.released()).toEqual([1]);

      // A start while one is already starting takes no second lock.
      const busy = setup();
      busy.startMicrophone.mockReturnValueOnce(new Promise(() => {}));
      void busy.note.start(options);
      await busy.note.start(options);
      expect(busy.keepScreenAwake).toHaveBeenCalledOnce();
    });

    it('is released when something fails the note while the microphone is starting', async () => {
      const ctx = setup();
      let open!: () => void;
      ctx.startMicrophone.mockReturnValueOnce(
        new Promise((resolve) => (open = () => resolve(fakeSession()))),
      );
      const started = ctx.note.start(options);
      ctx.note.fail('unavailable');
      expect(ctx.released()).toEqual([1]);
      open();
      expect(await started).toBe('cancelled');
      expect(ctx.released()).toEqual([1]);
      expect(failure(ctx.note)).toBeDefined();
    });

    it('lets a cancelled read release nothing of a newer note', async () => {
      const ctx = setup();
      await record(ctx.note);
      cancelFirst(ctx.note);
      expect(ctx.released()).toEqual([1]);

      // A new note takes its own lock before the old answer arrives.
      await ctx.note.start(options);
      expect(ctx.keepScreenAwake).toHaveBeenCalledTimes(2);
      ctx.refuse(new ApiError('network_error', 0), 0);
      await settle();

      expect(ctx.released()).toEqual([1, 0]);
      expect(ctx.note.getState().phase).toBe('recording');
    });

    it('lets a cancelled read that answers late release nothing of a newer read', async () => {
      const ctx = setup();
      await record(ctx.note);
      cancelFirst(ctx.note);
      await record(ctx.note);
      ctx.answer(result('a'), 0);
      await settle();
      expect(ctx.released()).toEqual([1, 0]);
      expect(ctx.note.getState().inbox.reading).toBe(1);
      ctx.answer(result('b'), 1);
      await settle();
      expect(ctx.released()).toEqual([1, 1]);
      ctx.note.openReady();
      expect(ids(ctx.note)).toEqual(['b']);
    });
  });

  describe('notifier', () => {
    it('can be attached after the module is made, and detached', async () => {
      const note = createVoiceNote({
        send: () => new Promise(() => {}),
        keepScreenAwake: () => () => {},
        startMicrophone: () => Promise.resolve(fakeSession()),
      });
      const heard: VoiceNotice[] = [];
      const detach = note.attachNotifier((notice) => heard.push(notice));
      await record(note, options);
      cancelFirst(note);
      detach();
      await record(note, options);
      cancelFirst(note);
      expect(heard).toEqual(['readCancelled']);
    });
  });
});
