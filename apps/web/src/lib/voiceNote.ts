import { useSyncExternalStore } from 'react';
import { startRecording as startMicrophone } from './microphone';
import { sendVoiceNote } from './voice';
import { keepScreenAwake } from './wakeLock';
import { createInbox } from './voiceInbox';
import type { VoiceNoteAdapters, VoiceNoteState } from './voiceNoteTypes';
import { createReads } from './voiceReads';
import { createRecorder } from './voiceRecorder';
import { createReview } from './voiceReview';

export type {
  MergedNote,
  VoiceNoteAdapters,
  VoiceNoteEdit,
  VoiceNotice,
} from './voiceNoteTypes';
export { NETWORK_RETRY_DELAY_MS } from './voiceReads';
export { MAX_APPLY_ACTIONS } from './voiceReview';

/**
 * The one owner of the Voice Inbox in memory, shared by the hold-to-talk button and Review on any
 * page. It wires four parts around one store: the Inbox (`voiceInbox`), the recorder, the reads
 * and Review. A transition from the wrong phase does nothing.
 */
export function createVoiceNote(
  adapters: VoiceNoteAdapters = {
    send: sendVoiceNote,
    keepScreenAwake,
    startMicrophone,
  },
) {
  const inbox = createInbox(adapters);
  const reads = createReads(inbox, adapters);
  const recorder = createRecorder(inbox, adapters, reads);
  const review = createReview(inbox);

  return {
    getState: inbox.view,
    subscribe: inbox.subscribe,
    attachNotifier: inbox.attachNotifier,
    onReadSettled: reads.onReadSettled,
    onUnmerged: review.onUnmerged,

    /** Why a start would be refused right now; read it before asking for the microphone. */
    startBlocker: recorder.startBlocker,
    start: recorder.start,
    stop: recorder.stop,
    cancel: recorder.cancel,
    level: recorder.level,
    fail: recorder.fail,
    isCapReached: reads.isCapReached,

    retry: reads.retry,
    cancelReading: reads.cancelReading,
    dismiss: reads.dismiss,
    /** Sign-out: forgets every Voice Note, read and recording. */
    clear() {
      recorder.abort();
      reads.abortAll();
      inbox.reset();
    },

    open: review.open,
    openReady: review.openReady,
    openMerged: review.openMerged,
    unmerge: review.unmerge,
    remove: review.remove,
    pickList: review.pickList,
    pickAllLists: review.pickAllLists,
    edit: review.edit,
    applying: review.applying,
    applyFailed: review.applyFailed,
    applied: review.applied,
    closeAnswers: review.closeAnswers,
    discard: review.discard,
  };
}

export type VoiceNote = ReturnType<typeof createVoiceNote>;

/** The app's one Voice Note. */
export const voiceNote = createVoiceNote();

/** Whether the Background Read strip shows Voice Notes: notes being read, ready or failed, with nothing else on screen. */
export const isStripUp = (state: VoiceNoteState) =>
  state.phase === 'idle' &&
  state.inbox.reading + state.inbox.ready + state.inbox.failed > 0;

export const useVoiceNoteState = () =>
  useSyncExternalStore(
    voiceNote.subscribe,
    voiceNote.getState,
    voiceNote.getState,
  );
