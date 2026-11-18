import { nextBackgroundOrder } from './backgroundItem';
import type {
  VoiceNoteAdapters,
  VoiceNoteEntry,
  VoiceNoteState,
  VoiceNotice,
  VoiceNoteStore,
  VoiceErrorCode,
  VoicePhase,
} from './voiceNoteTypes';

const initial: VoiceNoteStore = { notes: [], lastTarget: 'shopping' };

export const isReady = (n: VoiceNoteEntry) =>
  n.phase === 'review' || n.phase === 'answers';
/** A Voice Note in Review with at least one Voice Action: what "Review all" merges. */
export const hasActions = (n: VoiceNoteEntry) =>
  n.phase === 'review' && (n.proposal?.actions.length ?? 0) > 0;
/** A Review or answer sheet is on screen (or applying). */
export const isSheet = (n: VoiceNoteEntry | undefined) =>
  n !== undefined && (isReady(n) || n.phase === 'applying');

const countInbox = (store: VoiceNoteStore): VoiceNoteState['inbox'] => ({
  reading: store.notes.filter((n) => n.phase === 'reading').length,
  ready: store.notes.filter((n) => isReady(n) || n.phase === 'applying').length,
  failed: store.notes.filter((n) => n.phase === 'failed').length,
  total: store.notes.length,
  notes: store.notes.map((n) => ({
    id: n.id,
    order: n.order,
    phase: n.phase,
    defaultTarget: n.defaultTarget,
    spokenLanguage: n.spokenLanguage,
    durationMs: n.durationMs,
    transcript: n.proposal?.transcript ?? '',
    error: n.error,
    rawError: n.rawError,
    canRetry: n.phase === 'failed' && n.recording !== undefined,
    hasActions: hasActions(n),
  })),
});

/** The flat view of what is on screen: the recording in progress, else the merged Review, else the open Voice Note, else idle. */
export function projectState(store: VoiceNoteStore): VoiceNoteState {
  const { live, voiceCap } = store;
  const inbox = countInbox(store);
  if (live) {
    return {
      phase: 'recording',
      defaultTarget: live.defaultTarget,
      startedAt: live.startedAt,
      voiceCap,
      inbox,
    };
  }
  if (store.merged) {
    const notes = store.notes.filter((n) => store.merged?.includes(n.id));
    return {
      phase: notes.every((n) => n.phase === 'applying') ? 'applying' : 'review',
      // The notes may come from different pages: no list is the page's own.
      defaultTarget: 'none',
      proposal: {
        transcript: notes.map((n) => n.proposal?.transcript ?? '').join('\n'),
        actions: notes.flatMap((n) => n.proposal?.actions ?? []),
        answers: notes.flatMap((n) => n.proposal?.answers ?? []),
      },
      merged: notes.map((n) => ({
        id: n.id,
        defaultTarget: n.defaultTarget,
        spokenLanguage: n.spokenLanguage ?? n.recording?.spokenLanguage,
        durationMs: n.durationMs ?? n.recording?.durationMs,
        transcript: n.proposal?.transcript ?? '',
      })),
      voiceCap,
      inbox,
    };
  }
  const open = store.notes.find((n) => n.id === store.openId);
  if (!open) {
    return { phase: 'idle', defaultTarget: store.lastTarget, voiceCap, inbox };
  }
  const {
    id: _id,
    order: _order,
    spokenLanguage: _language,
    durationMs: _duration,
    ...fields
  } = open;
  return { ...fields, voiceCap, inbox };
}

/**
 * The Voice Inbox in memory: the store, the view the screens read, and what outlives the page that
 * started a note (the leave-the-page guard, the wake lock, the notifier). Nothing here is stored:
 * a reload drops the Voice Notes. The reads, the recorder and Review change the store through it;
 * each change ends in `emit`, which publishes a new view.
 */
export function createInbox(
  adapters: Pick<VoiceNoteAdapters, 'keepScreenAwake' | 'notify'>,
) {
  let store = initial;
  let nextId = 1;
  let view: VoiceNoteState = projectState(store);
  const listeners = new Set<() => void>();
  let notifier = adapters.notify;

  /** Asks the browser to confirm leaving while the Voice Inbox holds a note. */
  const confirmLeave = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  let guarding = false;
  const guardUnload = () => {
    const want = store.notes.length > 0;
    if (want === guarding || typeof window === 'undefined') return;
    guarding = want;
    if (want) window.addEventListener('beforeunload', confirmLeave);
    else window.removeEventListener('beforeunload', confirmLeave);
  };

  /** The screen stays awake while anything holds it: the microphone, or a read in flight. */
  const holds = new Set<number | 'mic'>();
  let release: (() => void) | undefined;

  const inbox = {
    /** The store as it is now. Change it with `set` and publish with `emit`. */
    get: () => store,
    set(next: VoiceNoteStore) {
      store = next;
    },
    /** Publishes the store: a new view object, so subscribers that compare snapshots render again. */
    emit() {
      view = projectState(store);
      guardUnload();
      for (const listener of listeners) listener();
    },
    view: () => view,
    phase: (): VoicePhase => view.phase,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** The open Voice Note, if any. */
    openNote: () => store.notes.find((n) => n.id === store.openId),

    notify: (notice: VoiceNotice) => notifier?.(notice),
    /**
     * Attaches the function that tells the Member (the app root's toasts). Returns the function
     * that detaches it.
     */
    attachNotifier(next: (notice: VoiceNotice) => void) {
      notifier = next;
      return () => {
        if (notifier === next) notifier = adapters.notify;
      };
    },

    keepAwake(holder: number | 'mic') {
      holds.add(holder);
      release ??= adapters.keepScreenAwake();
    },
    letSleep(holder: number | 'mic') {
      holds.delete(holder);
      if (holds.size > 0) return;
      release?.();
      release = undefined;
    },

    /** Adds a Voice Note to the end of the list (recording order) and returns its id. */
    append(next: Omit<VoiceNoteEntry, 'id' | 'order'>) {
      const id = nextId++;
      store = {
        ...store,
        notes: [...store.notes, { id, order: nextBackgroundOrder(), ...next }],
        lastTarget: next.defaultTarget,
      };
      return id;
    },
    /** Changes one Voice Note in place, by id. */
    patchNote(id: number, patch: (note: VoiceNoteEntry) => VoiceNoteEntry) {
      store = {
        ...store,
        notes: store.notes.map((n) => (n.id === id ? patch(n) : n)),
      };
    },
    /** Takes a Voice Note out of the list. */
    removeNote(id: number) {
      store = {
        ...store,
        notes: store.notes.filter((n) => n.id !== id),
        openId: store.openId === id ? undefined : store.openId,
      };
      inbox.emit();
    },
    /** A read note did not reach Review; `keepRecording` holds the audio for Retry. */
    failNote(
      id: number,
      error: VoiceErrorCode,
      options: {
        rawError?: VoiceNoteState['rawError'];
        keepRecording?: boolean;
      } = {},
    ) {
      inbox.patchNote(id, (n) => ({
        ...n,
        phase: 'failed',
        error,
        rawError: options.rawError,
        recording: options.keepRecording ? n.recording : undefined,
      }));
      inbox.emit();
    },
    /** A failed Voice Note by id. */
    failedNote(id: number) {
      const note = store.notes.find((n) => n.id === id);
      return note?.phase === 'failed' ? note : undefined;
    },

    /** Sign-out: every Voice Note, lock and the Voice Cap go. */
    reset() {
      holds.clear();
      release?.();
      release = undefined;
      store = { ...initial };
      inbox.emit();
    },
  };
  return inbox;
}

export type Inbox = ReturnType<typeof createInbox>;
