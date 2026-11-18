import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './api';
import type { CatalogSearchResult, StorageLocation, Unit } from './catalog';
import type { Recording } from './microphone';
import { localIso } from './pantry';
import type { ScanLanguage } from '../i18n/resources';

/** A Voice Note lasts at most this long; the recording stops and sends itself here. */
export const MAX_VOICE_NOTE_MS = 60_000;
/** A press shorter than this is a tap, not a Voice Note (the gesture). */
export const QUICK_TAP_MS = 300;
/** Recorded audio shorter than this is too little to read. Audio never outlasts the hold, so this equals the tap threshold. */
export const MIN_VOICE_NOTE_MS = QUICK_TAP_MS;

/** The list the page a Voice Note is recorded on acts on (ADR 0017). */
export type VoiceList = 'shopping' | 'pantry';
/** What a page sends as its Default List: a list, or `none` where the page has no list (ADR 0021). */
export type VoiceDefaultTarget = VoiceList | 'none';

/** Where the Listening card says a Voice Note goes, per Default List (voice namespace). */
export const LISTENING_DESTINATION = {
  shopping: 'listening.toShopping',
  pantry: 'listening.toPantry',
  none: 'listening.toNone',
} as const satisfies Record<VoiceDefaultTarget, string>;

export type VoiceActionStatus =
  'ready' | 'needsBatch' | 'notFound' | 'notUnderstood' | 'needsList';

export type VoiceBatchRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  location: StorageLocation;
  expiresOn: string | null;
  /** Removals: the amount taken from this Batch, or null when the whole Batch goes. */
  take?: number | null;
};

/** A Voice Action as the server resolved it, and as Review edits it. */
export type VoiceReviewAction = {
  id: string;
  status: VoiceActionStatus;
  /** Null for a Didn't understand entry and for `needsList`, which waits for a pick in Review. */
  target: VoiceList | null;
  op:
    | 'add'
    | 'remove'
    | 'check'
    | 'uncheck'
    | 'setQuantity'
    | 'runningLow'
    | null;
  /** What was said. */
  text: string;
  /** The Match; null when Unmatched. */
  ingredient: CatalogSearchResult | null;
  /** The Unmatched name; null when matched. */
  name: string | null;
  quantity: number | null;
  unit: Unit | null;
  scope: 'one' | 'all' | null;
  expiresOn: string | null;
  noExpiry: boolean;
  location: StorageLocation | null;
  /** A Batch picked in Review for a removal that needed one. Never sent by the server. */
  batchId?: string | null;
  rows: {
    /** Pantry removals and Running low: the Batches taken, or (needsBatch) the candidates to pick from. */
    batches?: VoiceBatchRow[];
    /** Pantry Running low with no Batch: Apply adds it to the Shopping List instead. */
    shoppingFallback?: boolean;
    shoppingItem?: {
      id: string;
      name: string;
      quantity: number | null;
      unit: Unit | null;
      checked: boolean;
    } | null;
  };
  defaults: { location?: StorageLocation; expiresOn?: string };
  /**
   * A bare add or remove off the lists: the action resolved against each list, so picking swaps one in without a
   * request. Kept after the pick so the Member can change it.
   */
  byList?: { shopping: VoiceReviewAction; pantry: VoiceReviewAction };
};

/**
 * The answer to one Pantry Question (ADR 0020), as the server read it. Mirrors the API's
 * `PantryAnswer`: `kind` is the discriminant (yes, only expired, no, not sure), and
 * each kind is a member carrying its own details.
 */
type VoiceAnswerBase = {
  id: string;
  /** What was said. */
  text: string;
  /** The Match; null when the name matched no Ingredient with confidence (then `name` is the asked name). */
  ingredient: CatalogSearchResult | null;
  /** The name asked about when there is no Match; null when matched. */
  name: string | null;
};
export type VoiceAnswer =
  | (VoiceAnswerBase & {
      kind: 'yes';
      /** Quantity summed per unit over the Batches that are not Expired; never converted. Empty for a Pantry Basic with no Batch. */
      totals: Array<{ unit: Unit; quantity: number }>;
      /** Where the stock is, in Location order. */
      locations: StorageLocation[];
      /** A Batch expires within the Family's Stale Threshold. */
      expiringSoon: boolean;
      runningLow: boolean;
    })
  | (VoiceAnswerBase & { kind: 'onlyExpired'; onShoppingList: boolean })
  | (VoiceAnswerBase & { kind: 'no'; onShoppingList: boolean })
  /** Nothing matched with confidence and no Unmatched row has the name; never "no". */
  | (VoiceAnswerBase & { kind: 'notSure' });
export type VoiceAnswerKind = VoiceAnswer['kind'];

export type VoiceNoteResult = {
  /** What was said. */
  transcript: string;
  actions: VoiceReviewAction[];
  /** The answers to the Pantry Questions in it; read-only, nothing to apply. */
  answers: VoiceAnswer[];
};

/** One applied Voice Action: the list it landed on and the row it touched. */
export type VoiceAppliedEntry = {
  actionId: string;
  list: VoiceList;
  /**
   * The Shopping Item or Batch touched. A Shopping removal names the row just removed (nothing to flash);
   * a Batch removal names a surviving Batch of the Ingredient, and none when nothing is left.
   */
  rowId?: string;
  /**
   * Every row to flash when the Action changed several: a Batch removal across Locations names a
   * surviving Batch in each Location it touched (each is its own roll-up row). `rowId` is the first.
   * Absent for single-row Actions; fall back to `rowId`.
   */
  rowIds?: string[];
  /** Already satisfied when applied; still counts as applied. */
  alreadyDone: boolean;
};

export type VoiceApplyResult = {
  applied: VoiceAppliedEntry[];
  skipped: { id: string; reason: string }[];
};

/** Apply the Voice Actions as edited in Review. Free of the Voice Cap. */
export function applyVoiceActions(
  actions: VoiceReviewAction[],
  today: string = localIso(new Date()),
): Promise<VoiceApplyResult> {
  return apiRequest<VoiceApplyResult>('/voice/apply', {
    method: 'POST',
    body: {
      today,
      actions: actions.map((a) => ({
        id: a.id,
        target: a.target,
        op: a.op,
        text: a.text,
        ingredientId: a.ingredient?.id ?? null,
        name: a.ingredient ? null : a.name,
        quantity: a.quantity,
        unit: a.quantity === null ? null : a.unit,
        scope: a.scope,
        // What Review showed for an unspoken Location and expiry, defaults included.
        expiresOn: a.noExpiry
          ? null
          : (a.expiresOn ?? a.defaults.expiresOn ?? null),
        noExpiry: a.noExpiry,
        location: a.location ?? a.defaults.location ?? null,
        batchId: a.batchId ?? null,
        // A resolved removal holds to the Batches Review showed.
        batchIds:
          a.op === 'remove' && !a.batchId
            ? (a.rows.batches ?? []).map((batch) => batch.id)
            : [],
      })),
    },
  });
}

/** Whether the server can transcribe (AI key and transcription model set). Voice is hidden until it says so. */
export function useVoiceConfigured(): boolean {
  return useVoiceConfig() === 'on';
}

/** `useVoiceConfigured`, but telling "not asked yet" from "no": Say it waits before it falls back. */
export function useVoiceConfig(): 'loading' | 'on' | 'off' {
  const config = useQuery({
    queryKey: ['voice', 'config'],
    queryFn: () => apiRequest<{ configured: boolean }>('/voice/config'),
    staleTime: 5 * 60_000,
  });
  if (config.data) return config.data.configured ? 'on' : 'off';
  return config.isPending ? 'loading' : 'off';
}

export type VoiceNoteRequest = {
  recording: Recording;
  /** Left out when the Member's Preferences were not loaded yet: the API resolves it. */
  spokenLanguage?: ScanLanguage;
  defaultTarget: VoiceDefaultTarget;
  /** The Member's local date, `YYYY-MM-DD`. */
  today: string;
  /** Aborting it abandons the request on this side only; the Voice Cap charge stands. */
  signal?: AbortSignal;
};

export function sendVoiceNote({
  recording,
  spokenLanguage,
  defaultTarget,
  today,
  signal,
}: VoiceNoteRequest): Promise<VoiceNoteResult> {
  const form = new FormData();
  if (spokenLanguage) form.append('spokenLanguage', spokenLanguage);
  form.append('defaultTarget', defaultTarget);
  form.append('today', today);
  form.append('durationMs', String(Math.round(recording.durationMs)));
  const extension = /mp4/.test(recording.mimeType)
    ? 'mp4'
    : /ogg/.test(recording.mimeType)
      ? 'ogg'
      : 'webm';
  form.append('audio', recording.blob, `voice-note.${extension}`);
  return apiRequest<VoiceNoteResult>('/voice', {
    method: 'POST',
    body: form,
    signal,
  });
}

/** `m:ss` for a length in ms, whole seconds floored (the Listening card, the Gator bubble and Review). */
export function formatClock(ms: number): string {
  const whole = Math.floor(ms / 1000);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
