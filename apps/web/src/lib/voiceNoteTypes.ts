import type { StorageLocation, Unit, CatalogSearchResult } from './catalog';
import type { ScanLanguage } from '../i18n/resources';
import type { MicrophoneSession } from './microphone';
import type {
  VoiceAnswer,
  VoiceDefaultTarget,
  VoiceNoteRequest,
  VoiceNoteResult,
  VoiceReviewAction,
} from './voice';

/** Where the Voice Note is: the hold-to-talk button, the Background Read strip and Review all read this. */
export type VoicePhase =
  | 'idle'
  | 'recording'
  | 'reading'
  | 'failed'
  | 'review'
  /** The answer sheet for a note of only Pantry Questions; nothing to apply. */
  | 'answers'
  /** Review while Apply is in flight; an error sends it back to `review` with the edits kept. */
  | 'applying';

/** Why the last Voice Note did not reach Review. */
export type VoiceErrorCode =
  | 'unavailable'
  | 'nothingHeard'
  /** The send failed (no signal, provider down): the recording is kept for Retry. */
  | 'failed'
  | 'tooLong'
  | 'unsupported'
  /** The Voice Cap is used up; the number is in `voiceCap`. */
  | 'capReached'
  /** The Family is out of Credits: the recording is kept, and Read again once Credits are added. */
  | 'outOfCredits';

/** The errors that hold every note waiting behind the read that hit them. */
export type BudgetError = Extract<
  VoiceErrorCode,
  'capReached' | 'outOfCredits'
>;

/** One Voice Note in a merged Review: what "What I heard" shows of it. */
export type MergedNote = {
  id: number;
  defaultTarget: VoiceDefaultTarget;
  spokenLanguage?: ScanLanguage;
  durationMs?: number;
  transcript: string;
};

export type VoiceNoteState = {
  phase: VoicePhase;
  /** The page that recorded: the default target of the Voice Note. */
  defaultTarget: VoiceDefaultTarget;
  /** The audio, kept in memory while it is read and for Retry after a failed send. */
  recording?: {
    blob: Blob;
    mimeType: string;
    durationMs: number;
    /** `undefined`: none was sent, the API used the Member's Spoken Language. */
    spokenLanguage?: ScanLanguage;
  };
  /** What the server read from the recording, then as the Member edits it. */
  proposal?: {
    transcript: string;
    actions: VoiceReviewAction[];
    /** The Pantry Questions' answers. Shown by the answer sheet when they are all there is, else by the answer card in Review. */
    answers: VoiceAnswer[];
  };
  error?: VoiceErrorCode;
  /**
   * The server's error behind a `failed` that the Gator bubble has no wording of its own for: the raw code
   * and parameters, translated by the Gator bubble. Absent for a send that never reached the server.
   */
  rawError?: { code: string; params: Record<string, unknown> };
  /** The Voice Cap, once the server reported it reached. In memory only; a reload drops it. */
  voiceCap?: { cap: number; resetsAt: number };
  /** When the microphone went live (ms since the epoch), while recording. The clock is the card's. */
  startedAt?: number;
  /**
   * Set while "Review all" is open: the Voice Notes merged into this one Review, in recording order. The
   * `proposal` is then all of their transcripts, Voice Actions and answers together.
   */
  merged?: MergedNote[];
  /** The Voice Inbox: how many Voice Notes are being read (or waiting), ready, failed, and in all. */
  inbox: {
    reading: number;
    ready: number;
    failed: number;
    total: number;
    /** Every Voice Note in recording order: its id (for `cancelReading` and the like) and phase. */
    notes: Array<
      MergedNote & {
        /** `nextBackgroundOrder` when the note was recorded: the strip orders its rows by it. */
        order: number;
        phase: Exclude<VoicePhase, 'idle' | 'recording'>;
        /** Why a failed note failed, and the server's own error behind a `failed`. */
        error?: VoiceErrorCode;
        rawError?: { code: string; params: Record<string, unknown> };
        /** A failed note with its recording kept can be retried. */
        canRetry?: boolean;
        /** It has Voice Actions to review: what "Review all" counts. */
        hasActions: boolean;
      }
    >;
  };
};

/** A notice for the Member that the module has no toast of its own for. */
export type VoiceNotice =
  /** The recording was cancelled (let go off the button, Escape). */
  | 'recordingCancelled'
  /** The recording reached 60 seconds and was stopped and sent. */
  | 'stoppedAtLimit'
  /** Cancel reading: the late answer is ignored. */
  | 'readCancelled'
  /** Discard on a failed Voice Note. */
  | 'discarded'
  /** The server has Voice Notes switched off: the note was dropped quietly. */
  | 'switchedOff'
  /** A Voice Note was read and is ready to review. */
  | 'noteReady'
  /** A sixth Voice Note was refused: Review the others first. */
  | 'inboxFull';

/** The outside world of the Voice Note. Exported with `VoiceNoteEdit` as the module interface: they type `createVoiceNote` and `edit`. */
export type VoiceNoteAdapters = {
  /** Sends a recording to be read. */
  send: (request: VoiceNoteRequest) => Promise<VoiceNoteResult>;
  /** Keeps the screen awake; returns the function that lets it sleep again. */
  keepScreenAwake: () => () => void;
  /** Asks for the microphone (prompting the first time) and starts recording. */
  startMicrophone: () => Promise<MicrophoneSession>;
  /** Tells the Member something. Can also be attached later with `attachNotifier`. */
  notify?: (notice: VoiceNotice) => void;
  /** How long a network error waits before its one automatic retry. Default `NETWORK_RETRY_DELAY_MS`; 0 retries at once. A test seam: tests pass 0 to skip the wait. */
  retryDelayMs?: number;
};

export type VoiceNoteEdit = Partial<{
  quantity: number | null;
  unit: Unit | null;
  ingredient: CatalogSearchResult | null;
  name: string | null;
  location: StorageLocation | null;
  expiresOn: string | null;
  noExpiry: boolean;
  batchId: string | null;
  defaults: VoiceReviewAction['defaults'];
  /** The Shopping Item the new Match is on the list as (Review's kind label reads it). Left out, a Match change clears it. */
  shoppingItem: NonNullable<VoiceReviewAction['rows']['shoppingItem']> | null;
}>;

/** What stopped the recording came to: sent to be read, too short to read, or nothing was recording. */
export type StopOutcome = 'sent' | 'tooShort' | 'notStarted';

/** What a start came to. Only `denied` is the Member's to act on (the microphone sheets). */
export type StartOutcome =
  | 'started'
  /** Refused by the start guard (or a note is already under way). */
  | 'refused'
  /** The Member or the browser refused the microphone. */
  | 'denied'
  /** No microphone, or this browser cannot record: the Voice Note failed. */
  | 'unavailable'
  /** Stopped or cancelled before the microphone was live: the stream was thrown away. */
  | 'cancelled';

/** Why a start would be refused: the hook shows the matching tip before asking for permission. */
export type StartBlocker =
  | 'active'
  /** A Review or answer sheet is open. */
  | 'review'
  /** The Voice Inbox holds its most. */
  | 'full'
  | 'capped'
  | 'none';

/** What `openMerged` came to. */
export type MergeOutcome = 'opened' | 'tooMany' | 'refused';

/** One Voice Note in the list: its own phase, audio, Default List, Spoken Language, proposal and error. */
export type VoiceNoteEntry = {
  id: number;
  /** Where it stands in time against every other background item (`nextBackgroundOrder`). */
  order: number;
  phase: Exclude<VoicePhase, 'idle' | 'recording'>;
  defaultTarget: VoiceDefaultTarget;
  recording?: VoiceNoteState['recording'];
  proposal?: VoiceNoteState['proposal'];
  error?: VoiceErrorCode;
  rawError?: VoiceNoteState['rawError'];
  /** The note's own Spoken Language and length, kept on the note when its recording is dropped. */
  spokenLanguage?: ScanLanguage;
  durationMs?: number;
};

/**
 * What the module holds: the Voice Notes (the Voice Inbox, at most MAX_NOTES), which one is open
 * (Review, the answer sheet, or a failure's Gator bubble row), and the module-level Voice Cap and recording in progress.
 */
export type VoiceNoteStore = {
  notes: VoiceNoteEntry[];
  openId?: number;
  /** The recording in progress (the microphone is live); it is not a Voice Note yet. */
  live?: { defaultTarget: VoiceDefaultTarget; startedAt: number };
  /** The Default List of the last note, kept for the idle view. */
  lastTarget: VoiceDefaultTarget;
  voiceCap?: { cap: number; resetsAt: number };
  /** The ids of the Voice Notes in the open merged Review ("Review all"), in recording order. */
  merged?: number[];
};
