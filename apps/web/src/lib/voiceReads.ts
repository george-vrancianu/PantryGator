import type { ScanLanguage } from '../i18n/resources';
import { ApiError } from './api';
import type { Recording } from './microphone';
import { localIso } from './pantry';
import type { VoiceDefaultTarget, VoiceNoteResult } from './voice';
import type { Inbox } from './voiceInbox';
import type { BudgetError, VoiceNoteAdapters } from './voiceNoteTypes';

/** The longest delay `setTimeout` takes. */
const MAX_TIMEOUT = 2 ** 31 - 1;

/** How many Voice Notes are read at once; the rest wait in recording order. */
const MAX_READS = 2;

/** A network error waits this long before its one automatic retry: a dropped signal needs a moment to come back. */
export const NETWORK_RETRY_DELAY_MS = 1500;

const pause = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : undefined;

const nextUtcMidnight = (now: number) => {
  const day = new Date(now);
  return Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate() + 1,
  );
};

/**
 * Everything between a recording and its answer: the queue of notes waiting for a read, the reads
 * in flight (Cancel aborts one), the network retry, the Voice Cap and Credits holds, and what a
 * failed note can do (Retry, Dismiss). A read outlives the page that started it.
 */
export function createReads(
  inbox: Inbox,
  adapters: Pick<VoiceNoteAdapters, 'send' | 'retryDelayMs'>,
) {
  const reads = new Map<number, AbortController>();
  /** Told when a read settles, kept or failed (a kept read costs Credits). */
  const settledListeners = new Set<() => void>();
  let capTimer: ReturnType<typeof setTimeout> | undefined;

  /** Whether the Voice Cap is still in force. It lifts at the server's reset time. */
  function isCapReached() {
    const { voiceCap } = inbox.get();
    return voiceCap !== undefined && Date.now() < voiceCap.resetsAt;
  }

  /** Renders again when the Voice Cap lifts: the state itself would not change. */
  function watchCap() {
    clearTimeout(capTimer);
    const { voiceCap } = inbox.get();
    if (!voiceCap) return;
    const wait = voiceCap.resetsAt - Date.now();
    if (wait <= 0) return;
    capTimer = setTimeout(
      () => {
        // A new object, so subscribers that compare snapshots render again.
        inbox.emit();
        watchCap();
      },
      Math.min(wait, MAX_TIMEOUT),
    );
  }

  /**
   * The server refused for the Voice Cap; `resetsAt` is an ISO timestamp. One that is missing or
   * unreadable counts as the next UTC midnight (the Voice Cap's day is a UTC day), so the button
   * is never stuck capped for good nor wrongly free at once.
   */
  function setCap(cap: { cap: number; resetsAt?: string }) {
    const parsed = Date.parse(cap.resetsAt ?? '');
    inbox.set({
      ...inbox.get(),
      voiceCap: {
        cap: cap.cap,
        resetsAt: Number.isNaN(parsed) ? nextUtcMidnight(Date.now()) : parsed,
      },
    });
    watchCap();
  }

  /**
   * The Voice Cap was reached by this read: it fails with the cap, and so does every note still
   * waiting behind it. Their recordings are kept, so Retry on any one releases them all. Notes
   * already read stay as they are. Running out of Credits does the same, with its own error.
   */
  function failHeld(id: number, error: BudgetError = 'capReached') {
    const store = inbox.get();
    inbox.set({
      ...store,
      notes: store.notes.map((n) =>
        n.id === id || (n.phase === 'reading' && !reads.has(n.id))
          ? { ...n, phase: 'failed', error, rawError: undefined }
          : n,
      ),
    });
    inbox.emit();
  }

  /** Maps what went wrong with the read to the state the note shows. */
  function settleFailure(id: number, error: unknown, audio: Recording) {
    if (error instanceof ApiError) {
      switch (error.code) {
        case 'voice.nothing_heard':
          return inbox.failNote(id, 'nothingHeard', { keepRecording: true });
        case 'voice.cap_reached':
          setCap({
            cap: Number(error.params.cap) || 0,
            resetsAt:
              typeof error.params.resetsAt === 'string'
                ? error.params.resetsAt
                : undefined,
          });
          return failHeld(id);
        case 'credits.insufficient':
          return failHeld(id, 'outOfCredits');
        case 'voice.too_long':
          return inbox.failNote(id, 'tooLong');
        case 'voice.unsupported_audio':
          console.error('Voice Note format not supported', audio.mimeType);
          return inbox.failNote(id, 'unsupported');
        case 'voice.not_configured':
          // Voice went away on the server: drop the note without a word.
          inbox.removeNote(id);
          return inbox.notify('switchedOff');
      }
    }
    // No signal and a provider that is down share the failure's own wording; anything else says what it was.
    const offline =
      error instanceof ApiError &&
      (error.code === 'network_error' ||
        error.code === 'voice.provider_unavailable');
    inbox.failNote(id, 'failed', {
      rawError: offline
        ? undefined
        : error instanceof ApiError
          ? { code: error.code, params: error.params }
          : { code: 'unknown', params: {} },
      keepRecording: true,
    });
  }

  /** Starts reading the oldest waiting notes while fewer than MAX_READS are in flight. */
  function pump() {
    while (reads.size < MAX_READS) {
      const next = inbox
        .get()
        .notes.find(
          (n) => n.phase === 'reading' && n.recording && !reads.has(n.id),
        );
      if (!next) return;
      void read(next.id);
    }
  }

  /** Reads one Voice Note with its own Default List and Spoken Language. Everything after an abort is ignored. */
  async function read(id: number) {
    const note = inbox.get().notes.find((n) => n.id === id);
    if (!note?.recording) return;
    const { defaultTarget, recording: kept } = note;
    const audio: Recording = {
      blob: kept.blob,
      mimeType: kept.mimeType,
      durationMs: kept.durationMs,
    };
    const request = new AbortController();
    reads.set(id, request);
    inbox.keepAwake(id);
    const settled = () => {
      reads.delete(id);
      inbox.letSleep(id);
      settledListeners.forEach((listener) => listener());
    };
    let result: VoiceNoteResult;
    // A network error is tried once more by itself before the note fails.
    for (let attempt = 0; ; attempt++) {
      try {
        result = await adapters.send({
          recording: audio,
          spokenLanguage: kept.spokenLanguage,
          defaultTarget,
          today: localIso(new Date()),
          signal: request.signal,
        });
        break;
      } catch (error) {
        // Cancelled: the note is already gone, and so is its lock.
        if (request.signal.aborted) return;
        if (
          attempt === 0 &&
          error instanceof ApiError &&
          error.code === 'network_error'
        ) {
          await pause(adapters.retryDelayMs ?? NETWORK_RETRY_DELAY_MS);
          // Cancelled while waiting: the note is already gone.
          if (request.signal.aborted) return;
          continue;
        }
        settled();
        settleFailure(id, error, audio);
        pump();
        return;
      }
    }
    if (request.signal.aborted) return;
    settled();
    if (result.transcript.trim() === '') {
      inbox.failNote(id, 'nothingHeard', { keepRecording: true });
    } else {
      const answers = result.answers ?? [];
      // Only Pantry Questions: the answer sheet, with nothing to review or apply.
      const answersOnly = result.actions.length === 0 && answers.length > 0;
      inbox.patchNote(id, (n) => ({
        ...n,
        phase: answersOnly ? 'answers' : 'review',
        proposal: {
          transcript: result.transcript,
          actions: result.actions,
          answers,
        },
      }));
      inbox.emit();
      inbox.notify('noteReady');
    }
    pump();
  }

  return {
    isCapReached,

    /** Puts a recording in the Voice Inbox (after the others) and reads it as soon as a read is free. */
    enqueue(
      audio: Recording,
      spokenLanguage: ScanLanguage | undefined,
      defaultTarget: VoiceDefaultTarget,
    ) {
      inbox.append({
        phase: 'reading',
        defaultTarget,
        spokenLanguage,
        durationMs: audio.durationMs,
        recording: {
          blob: audio.blob,
          mimeType: audio.mimeType,
          durationMs: audio.durationMs,
          spokenLanguage,
        },
      });
      inbox.emit();
      pump();
    },

    /** Calls `listener` whenever a read settles, kept or failed. Returns the function that stops it. */
    onReadSettled(listener: () => void) {
      settledListeners.add(listener);
      return () => void settledListeners.delete(listener);
    },

    /**
     * Sends the kept recording of a failed note again: the same audio, in the language and for the
     * page it had. Retrying a note that failed for the Voice Cap (or Credits) releases every note
     * that failed with it. With `spokenLanguage` the note is read in that language instead, and
     * keeps it.
     */
    retry(id: number, spokenLanguage?: ScanLanguage): Promise<void> {
      const note = inbox.failedNote(id);
      if (!note?.recording) return Promise.resolve();
      const store = inbox.get();
      const capped = note.error === 'capReached';
      const held = capped || note.error === 'outOfCredits';
      const ids = held
        ? store.notes
            .filter(
              (n) =>
                n.phase === 'failed' && n.error === note.error && n.recording,
            )
            .map((n) => n.id)
        : [note.id];
      inbox.set({
        ...store,
        notes: store.notes.map((n) =>
          ids.includes(n.id)
            ? {
                ...n,
                phase: 'reading',
                error: undefined,
                rawError: undefined,
                ...(spokenLanguage && n.id === note.id
                  ? {
                      spokenLanguage,
                      recording: n.recording && {
                        ...n.recording,
                        spokenLanguage,
                      },
                    }
                  : {}),
              }
            : n,
        ),
        openId: store.openId === note.id ? undefined : store.openId,
        // The server decides whether the Voice Cap still holds; the next refusal sets it again.
        voiceCap: capped ? undefined : store.voiceCap,
      });
      if (capped) clearTimeout(capTimer);
      inbox.emit();
      pump();
      return Promise.resolve();
    },

    /** Gives up waiting for the read of one Voice Note: the late answer is ignored. The server is not told, so the Voice Cap charge stands. */
    cancelReading(id: number) {
      const note = inbox.get().notes.find((n) => n.id === id);
      if (!note || note.phase !== 'reading') return;
      reads.get(note.id)?.abort();
      reads.delete(note.id);
      inbox.letSleep(note.id);
      inbox.removeNote(note.id);
      inbox.notify('readCancelled');
      pump();
    },

    /** Drops a failure and its kept recording. Says "discarded" only when a recording was kept; otherwise the row just closes. */
    dismiss(id: number) {
      const note = inbox.failedNote(id);
      if (!note) return;
      inbox.removeNote(note.id);
      if (note.recording !== undefined) inbox.notify('discarded');
    },

    /** Sign-out: every read is aborted and the Voice Cap forgotten (the Inbox clears the store). */
    abortAll() {
      for (const request of reads.values()) request.abort();
      reads.clear();
      clearTimeout(capTimer);
    },
  };
}
