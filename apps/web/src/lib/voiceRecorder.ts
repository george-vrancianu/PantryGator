import type { ScanLanguage } from '../i18n/resources';
import {
  MicrophoneError,
  type MicrophoneSession,
  type Recording,
} from './microphone';
import {
  MAX_VOICE_NOTE_MS,
  MIN_VOICE_NOTE_MS,
  type VoiceDefaultTarget,
} from './voice';
import { isSheet, type Inbox } from './voiceInbox';
import type {
  StartBlocker,
  StartOutcome,
  StopOutcome,
  VoiceNoteAdapters,
  VoiceNoteEntry,
} from './voiceNoteTypes';

/** How many Voice Notes the Voice Inbox holds. */
const MAX_NOTES = 5;

/**
 * The microphone side of a Voice Note: the start guard, the live session with its 60-second
 * limit, and what happens when the Member lets go (the audio goes to `enqueue` to be read) or
 * cancels. The recording in progress is not a Voice Note until it is sent.
 */
export function createRecorder(
  inbox: Inbox,
  adapters: Pick<VoiceNoteAdapters, 'startMicrophone'>,
  reads: {
    enqueue: (
      audio: Recording,
      spokenLanguage: ScanLanguage | undefined,
      defaultTarget: VoiceDefaultTarget,
    ) => void;
    isCapReached: () => boolean;
  },
) {
  /** The microphone: being asked for, then live; and what the recording is for. */
  let starting: { cancelled: boolean } | undefined;
  let session: MicrophoneSession | undefined;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let recordingFor: { spokenLanguage?: ScanLanguage } | undefined;
  /** The audio of a stopped recording is being finalised. */
  let finishing = false;
  /** Bumped by `clear`, so a recording finalised after it is thrown away. */
  let epoch = 0;

  /** Ends the microphone without sending: a live session is cancelled, a start in flight on arrival. */
  function dropMicrophone() {
    clearTimeout(limitTimer);
    limitTimer = undefined;
    session?.cancel();
    session = undefined;
    if (starting) starting.cancelled = true;
  }

  /** The recording failed before a read (no microphone, the Voice Cap): a failed note with no audio. */
  function failBeforeRead(error: 'unavailable' | 'capReached') {
    // The audio being finalised is not wanted any more.
    if (finishing) epoch++;
    dropMicrophone();
    inbox.letSleep('mic');
    // The same failure with nothing kept is not shown twice.
    const same = (n: VoiceNoteEntry) =>
      n.phase === 'failed' && !n.recording && n.error === error;
    const store = inbox.get();
    inbox.set({
      ...store,
      notes: store.notes.filter((n) => !same(n)),
      openId:
        store.openId !== undefined &&
        store.notes.some((n) => n.id === store.openId && same(n))
          ? undefined
          : store.openId,
    });
    inbox.append({
      phase: 'failed',
      defaultTarget: store.live?.defaultTarget ?? store.lastTarget,
      error,
    });
    inbox.set({ ...inbox.get(), live: undefined });
    inbox.emit();
  }

  /** The Voice Note cannot be recorded: no microphone, or this browser cannot record. */
  const fail = (error: 'unavailable') => failBeforeRead(error);

  /** Why a start would be refused right now. */
  function startBlocker(): StartBlocker {
    // A note is already under way (the microphone starting, recording, audio being finalised): ignore silently.
    if (starting || session || finishing) return 'active';
    const store = inbox.get();
    // The mic is not offered while a Review or answer sheet is open.
    if (store.merged || inbox.openNote()) return 'review';
    // Failures with no recording kept (Voice Cap on the press, no microphone, too long, unsupported) cannot
    // be retried and do not count toward the limit.
    const counted = store.notes.filter(
      (n) => !(n.phase === 'failed' && !n.recording),
    ).length;
    if (counted >= MAX_NOTES) return 'full';
    return reads.isCapReached() ? 'capped' : 'none';
  }

  /**
   * Turns the microphone on and keeps the screen awake until the note is settled. Enforces the
   * start guard again: a capped start moves the note to the Voice Cap failure. Resolves once the
   * microphone is live, or why it is not. `spokenLanguage` is for the read.
   */
  async function start(options: {
    defaultTarget: VoiceDefaultTarget;
    spokenLanguage?: ScanLanguage;
  }): Promise<StartOutcome> {
    const blocker = startBlocker();
    if (blocker === 'active') return 'refused';
    if (blocker === 'capped') {
      failBeforeRead('capReached');
      return 'refused';
    }
    if (blocker === 'full') {
      inbox.notify('inboxFull');
      return 'refused';
    }
    if (blocker !== 'none') return 'refused';
    const attempt = { cancelled: false };
    starting = attempt;
    inbox.keepAwake('mic');
    let live: MicrophoneSession;
    try {
      live = await adapters.startMicrophone();
    } catch (error) {
      starting = undefined;
      if (!attempt.cancelled) inbox.letSleep('mic');
      if (error instanceof MicrophoneError && error.reason === 'denied') {
        return 'denied';
      }
      fail('unavailable');
      return 'unavailable';
    }
    starting = undefined;
    // Stopped or cancelled on the way (its lock is already let go): the stream is not wanted.
    if (attempt.cancelled || isSheet(inbox.openNote()) || inbox.get().merged) {
      live.cancel();
      if (!attempt.cancelled) inbox.letSleep('mic');
      return 'cancelled';
    }
    session = live;
    recordingFor = { spokenLanguage: options.spokenLanguage };
    limitTimer = setTimeout(() => {
      inbox.notify('stoppedAtLimit');
      void stop();
    }, MAX_VOICE_NOTE_MS);
    inbox.set({
      ...inbox.get(),
      live: {
        defaultTarget: options.defaultTarget,
        startedAt: Date.now(),
      },
      lastTarget: options.defaultTarget,
    });
    inbox.emit();
    return 'started';
  }

  /**
   * The Member let go: ends the recording and sends it to be read. Can be called while the
   * microphone is still starting, which then throws its stream away when it arrives.
   */
  async function stop(): Promise<StopOutcome> {
    if (starting) {
      starting.cancelled = true;
      inbox.letSleep('mic');
      return 'notStarted';
    }
    const active = session;
    const mine = recordingFor;
    if (!active || !mine) return 'notStarted';
    clearTimeout(limitTimer);
    limitTimer = undefined;
    session = undefined;
    recordingFor = undefined;
    // Not recording any more, even while the audio is finalised.
    finishing = true;
    const store = inbox.get();
    const target = store.live?.defaultTarget ?? store.lastTarget;
    const mark = epoch;
    inbox.set({ ...store, live: undefined });
    inbox.emit();
    let audio: Recording;
    try {
      audio = await active.stop();
    } catch {
      finishing = false;
      if (mark === epoch) fail('unavailable');
      return 'notStarted';
    }
    finishing = false;
    if (audio.durationMs < MIN_VOICE_NOTE_MS) {
      inbox.letSleep('mic');
      return 'tooShort';
    }
    // Signed out while the audio was finalised.
    if (mark !== epoch) {
      inbox.letSleep('mic');
      return 'notStarted';
    }
    reads.enqueue(audio, mine.spokenLanguage, target);
    // The read holds the lock itself once it starts.
    inbox.letSleep('mic');
    return 'sent';
  }

  /**
   * Throws the recording away. Says so unless `quiet` (the page was left). With nothing
   * recording or starting it does nothing: reads in flight and their wake lock are left alone.
   * `beforeStart` is a cancel while the page still reads the microphone permission (the module was
   * not asked to start yet): there is nothing to drop, but it says so (`quiet` is
   * ignored here).
   */
  function cancel(options: { quiet?: boolean; beforeStart?: boolean } = {}) {
    if (options.beforeStart) {
      inbox.notify('recordingCancelled');
      return;
    }
    if (!starting && !session) return;
    dropMicrophone();
    inbox.letSleep('mic');
    if (inbox.get().live) {
      inbox.set({ ...inbox.get(), live: undefined });
      inbox.emit();
    }
    if (!options.quiet) inbox.notify('recordingCancelled');
  }

  return {
    startBlocker,
    start,
    stop,
    cancel,
    fail,
    /** The input loudness, 0 to 1, for the Listening card's meter; 0 when nothing records. */
    level: () => session?.level() ?? 0,
    /** Sign-out: the microphone is dropped and a recording being finalised is thrown away. */
    abort() {
      epoch++;
      dropMicrophone();
    },
  };
}
