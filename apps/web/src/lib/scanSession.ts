import { useSyncExternalStore } from 'react';
import { nextBackgroundOrder } from './backgroundItem';
import type { ScanLanguage } from '../i18n/resources';
import type { DishGuess } from './plate';
import { MAX_RECEIPT_SECTIONS } from './receiptSections';
import { reviewLinesOf, type ReviewLine } from './review';
import { isBarcodeMode, type CameraMode } from './cameraMode';
import type { ProposedLine } from './scan';
import { clearScanLanguageOverride } from './sessionScanLanguage';

/** How many Scans of a Scan Session are read at once. */
export const MAX_CONCURRENT_READS = 2;

/** Why a read failed: the Scan Cap, the Family being out of Credits, or any other error. */
export type ScanFailure = 'error' | 'cap' | 'credits';

/** The failures that hold every Scan waiting behind the one that hit them. */
export type HeldFailure = Extract<ScanFailure, 'cap' | 'credits'>;

/** The most Scans one Scan Session holds. */
export const MAX_SESSION_SCANS = 20;

/**
 * One card of the Scan Session, from the shutter press (or the accepted barcode) until it is saved or
 * removed. A Barcode card is a Barcode Lookup, not a Scan (ADR 0013, ADR 0016): it has a `code`
 * instead of an `image`, is looked up outside the read slots, and is exempt from the Scan Cap.
 */
export type SessionScan = {
  id: string;
  mode: CameraMode;
  /** What the Scan is read in; Plate has none. */
  scanLanguage?: ScanLanguage;
  /** The prepared photo (a data URL) that is sent for reading; a Barcode card sends none. */
  image?: string;
  /** A Barcode card: the decoded EAN/UPC code that is looked up. */
  code?: string;
  /**
   * A Product Scan's barcode, decoded on the device from its photo (not looked up, so no Open Food
   * Facts credit). It goes with the card's line to teach the Known Barcode, only when the card has
   * exactly one line. Barcode cards use `code` instead.
   */
  barcode?: string;
  thumbnail: string;
  /** `uncropped`: a gallery receipt waiting for the Member to crop it in Review. */
  status: 'uncropped' | 'queued' | 'reading' | 'read' | 'failed';
  /** The gallery photo an uncropped receipt is cropped from. */
  source?: Blob;
  /** Why a failed Scan failed. */
  failure?: ScanFailure;
  /** The API error code and params of a failed read. */
  errorCode?: string;
  errorParams?: Record<string, unknown>;
  /** The proposed lines, once the Scan is read. */
  lines?: ProposedLine[];
  /** The lines as the Member edited them in the line editor; what Add all saves. */
  edited?: ReviewLine[];
  /** A Plate Scan once read: the dish guesses to pick from, and the token that proves they are ours. */
  dishes?: DishGuess[];
  plateToken?: string;
  /** A Plate Scan whose picked dish the server refused (Credits): the refusal to show on its card. */
  refusal?: { code: string; params: Record<string, unknown> };
  /** For a card made by merging receipts: the Scans it was made of, as they were, for Split. */
  sections?: SessionScan[];
};

/** The Scans taken since the camera was opened, in the order the Scans were taken. */
export type SessionState = { scans: SessionScan[] };

export type SessionAction =
  | {
      type: 'enqueue';
      scan: Pick<
        SessionScan,
        | 'id'
        | 'mode'
        | 'scanLanguage'
        | 'image'
        | 'code'
        | 'thumbnail'
        | 'source'
      >;
    }
  | { type: 'crop'; id: string; image: string }
  | { type: 'photoBarcode'; id: string; code: string }
  | { type: 'start' }
  | { type: 'read'; id: string; lines: ProposedLine[] }
  | {
      type: 'fail';
      id: string;
      reason: ScanFailure;
      code?: string;
      params?: Record<string, unknown>;
    }
  | { type: 'retry'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'merge'; id: string }
  | { type: 'split'; id: string }
  | { type: 'readDishes'; id: string; dishes: DishGuess[]; token: string }
  | { type: 'reread'; id: string }
  /** Puts a Scan back that was handed away and refused (a Plate Scan's pick), at its place, with `refusal`. */
  | { type: 'restore'; scan: SessionScan; index: number }
  | { type: 'edit'; id: string; lines: ReviewLine[] };

/** A Product Scan's photo barcode goes only with a card that has exactly one line. */
function withPhotoBarcode<T extends { barcode?: string }>(
  lines: T[] | undefined,
  barcode: string,
): T[] | undefined {
  return lines?.length === 1 ? [{ ...lines[0], barcode }] : lines;
}

const update = (
  state: SessionState,
  id: string,
  change: Partial<SessionScan>,
): SessionState => ({
  scans: state.scans.map((scan) =>
    scan.id === id ? { ...scan, ...change } : scan,
  ),
});

/** A Scan ready to be read, or failed with the Scan Cap (or the Credits) when one already holds the Session. */
const waiting = (state: SessionState) => {
  const failure = heldBy(state);
  return failure
    ? ({ status: 'failed', failure } as const)
    : ({ status: 'queued' } as const);
};

export { isBarcodeMode };
export const isBarcodeCard = <T extends Pick<SessionScan, 'mode'>>(
  scan: T,
): scan is T & { mode: 'barcode' } => isBarcodeMode(scan.mode);

/** The copy key (`failed` or `lookupFailed`) that says a card failed: a Barcode card did a lookup, not a read. */
export const failedCopyKey = (scan: Pick<SessionScan, 'mode'>) =>
  isBarcodeCard(scan) ? 'lookupFailed' : 'failed';

export const emptySession: SessionState = { scans: [] };

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'enqueue':
      return {
        scans: [
          ...state.scans,
          {
            ...action.scan,
            ...(action.scan.source
              ? { status: 'uncropped' }
              : isBarcodeCard(action.scan)
                ? { status: 'reading' }
                : waiting(state)),
          },
        ],
      };
    case 'photoBarcode':
      // Dropped when the card is gone (saved or removed) or is not a Product Scan.
      return {
        scans: state.scans.map((scan) =>
          scan.id === action.id && scan.mode === 'product'
            ? {
                ...scan,
                barcode: action.code,
                lines: withPhotoBarcode(scan.lines, action.code),
                edited: withPhotoBarcode(scan.edited, action.code),
              }
            : scan,
        ),
      };
    case 'crop':
      return {
        scans: state.scans.map((scan) =>
          scan.id === action.id
            ? {
                ...scan,
                image: action.image,
                ...waiting(state),
                source: undefined,
              }
            : scan,
        ),
      };
    case 'start': {
      // Promote the oldest waiting Scans into the free read slots.
      let free =
        MAX_CONCURRENT_READS -
        state.scans.filter(
          (scan) => scan.status === 'reading' && !isBarcodeCard(scan),
        ).length;
      if (free <= 0) return state;
      return {
        scans: state.scans.map((scan) =>
          scan.status === 'queued' && free-- > 0
            ? { ...scan, status: 'reading' }
            : scan,
        ),
      };
    }
    case 'read':
      return {
        scans: state.scans.map((scan) =>
          scan.id === action.id
            ? {
                ...scan,
                status: 'read',
                lines: scan.barcode
                  ? withPhotoBarcode(action.lines, scan.barcode)
                  : action.lines,
              }
            : scan,
        ),
      };
    case 'fail':
      return {
        scans: state.scans.map((scan) =>
          scan.id === action.id
            ? {
                ...scan,
                status: 'failed',
                // A Barcode Lookup is never a Scan: it cannot hit the Scan Cap.
                failure: isBarcodeCard(scan) ? 'error' : action.reason,
                errorCode: action.code,
                errorParams: action.params,
              }
            : // Past the Scan Cap every waiting read would fail too: hold them with the cap.
              action.reason !== 'error' && scan.status === 'queued'
              ? { ...scan, status: 'failed', failure: action.reason }
              : scan,
        ),
      };
    case 'retry': {
      const target = state.scans.find((scan) => scan.id === action.id);
      // Retrying a Scan held by the cap (or the Credits) releases every Scan it held.
      const retried = (scan: SessionScan) =>
        scan.status === 'failed' &&
        (scan.id === action.id ||
          (isHeld(target) && scan.failure === target?.failure));
      // A cap or Credits failure elsewhere keeps a retried Scan held too.
      const heldFailure = isHeld(target) ? undefined : heldBy(state);
      const held =
        heldFailure !== undefined && !(target && isBarcodeCard(target));
      return {
        scans: state.scans.map((scan) =>
          retried(scan)
            ? {
                ...scan,
                ...(held
                  ? { status: 'failed', failure: heldFailure }
                  : {
                      // A Barcode card is looked up again at once, without queueing for a read slot.
                      status: isBarcodeCard(scan) ? 'reading' : 'queued',
                      failure: undefined,
                    }),
                errorCode: undefined,
                errorParams: undefined,
              }
            : scan,
        ),
      };
    }
    case 'remove':
      return { scans: state.scans.filter((scan) => scan.id !== action.id) };
    case 'readDishes':
      return update(state, action.id, {
        status: 'read',
        refusal: undefined,
        dishes: action.dishes,
        plateToken: action.token,
      });
    case 'restore':
      if (state.scans.some((scan) => scan.id === action.scan.id)) return state;
      return {
        scans: [
          ...state.scans.slice(0, action.index),
          action.scan,
          ...state.scans.slice(action.index),
        ],
      };
    case 'reread':
      return update(state, action.id, {
        status: 'queued',
        dishes: undefined,
        plateToken: undefined,
      });
    case 'edit':
      return update(state, action.id, { edited: action.lines });
    case 'merge': {
      if (!canMerge(state, action.id)) return state;
      const index = state.scans.findIndex((scan) => scan.id === action.id);
      const above = state.scans[index - 1];
      const sections = [
        ...sectionsOf(above),
        ...sectionsOf(state.scans[index]),
      ];
      const lines = sections.flatMap((scan) => scan.lines ?? []);
      // Edits made before the merge come along; the editor's lines win over `sections` in reviewLinesOf.
      const below = state.scans[index];
      const edited =
        above.edited || below.edited
          ? [...reviewLinesOf(above), ...reviewLinesOf(below)]
          : undefined;
      return {
        scans: state.scans.flatMap((scan, i) =>
          i === index
            ? []
            : i === index - 1
              ? [{ ...above, lines, sections, edited }]
              : [scan],
        ),
      };
    }
    case 'split': {
      const card = state.scans.find((scan) => scan.id === action.id);
      if (
        !card?.sections ||
        state.scans.length - 1 + card.sections.length > MAX_SESSION_SCANS
      )
        return state;
      return {
        scans: state.scans.flatMap((scan) =>
          scan.id === action.id && scan.sections ? scan.sections : [scan],
        ),
      };
    }
  }
}

/** Errors a retry cannot fix: the same photo would fail the same way. */
const FINAL_ERRORS = [
  'scan.too_many_items',
  'scan.image_too_large',
  'scan.image_invalid',
  'scan.nothing_found',
];

/**
 * Whether reading a failed Scan again (or looking a Barcode card up again) can change anything.
 * The one rule behind every retry: the photo stack's failed state and Review's "Read again" /
 * "Look up again". Network, Lookup Limit, Scan Cap and unknown errors can be retried; `FINAL_ERRORS` cannot.
 */
export const canRetry = (scan: SessionScan) =>
  !FINAL_ERRORS.includes(scan.errorCode ?? '');

/** Whether a failed Scan's own error copy is shown: when a retry cannot help, or when it explains why to wait (a rate-limited Barcode Lookup). */
export const showsErrorCopy = (scan: SessionScan) =>
  Boolean(scan.errorCode) &&
  (!canRetry(scan) || scan.errorCode === 'barcode.rate_limited');

const sectionsOf = (scan: SessionScan) => scan.sections ?? [scan];

/** Whether the receipt Scan `id` may join the receipt Scan above it: both read, within the section limit. */
export function canMerge(state: SessionState, id: string): boolean {
  const index = state.scans.findIndex((scan) => scan.id === id);
  if (index < 1) return false;
  const [above, scan] = [state.scans[index - 1], state.scans[index]];
  return (
    [above, scan].every((s) => s.mode === 'receipt' && s.status === 'read') &&
    sectionsOf(above).length + sectionsOf(scan).length <= MAX_RECEIPT_SECTIONS
  );
}

/** How a Scan shows: waiting for a crop, being read (or waiting for a read slot), failed, or read. */
export type ScanDisplayState = 'uncropped' | 'reading' | 'failed' | 'read';

export const scanDisplayState = (scan: SessionScan): ScanDisplayState =>
  scan.status === 'queued' ? 'reading' : scan.status;

/** Scans not read yet and not failed: waiting for a crop, for a read slot, or being read. */
export const pendingCount = (state: SessionState) =>
  state.scans.filter(
    (scan) => scan.status !== 'read' && scan.status !== 'failed',
  ).length;

/** Gallery receipts waiting for the Member to crop them. */
export const uncroppedCount = (state: SessionState) =>
  state.scans.filter((scan) => scan.status === 'uncropped').length;

export const isHeld = <T extends Pick<SessionScan, 'failure'>>(
  scan: T | undefined,
): scan is T & { failure: HeldFailure } =>
  scan?.failure === 'cap' || scan?.failure === 'credits';

/** What holds the Session (the Scan Cap, or being out of Credits), or undefined; the first Scan to hit it names it. */
export const heldBy = (state: SessionState): HeldFailure | undefined =>
  state.scans.find(isHeld)?.failure;

/**
 * Whether a Scan hit the Scan Cap or the Family ran out of Credits; no more Scans can be taken until it
 * is retried or removed.
 */
export const sessionHeld = (state: SessionState) => heldBy(state) !== undefined;

let session = emptySession;
/** `nextBackgroundOrder` when the first Scan joined the Session: orders its strip row against other background items. */
let sessionOrder = 0;
const listeners = new Set<() => void>();

function setSession(next: SessionState) {
  if (next === session) return;
  // A gallery receipt's thumbnail is an object URL: free it when the Scan goes or is cropped.
  // A merged card keeps its sections' thumbnails for Split.
  const thumbnailsOf = (scans: SessionScan[]): string[] =>
    scans.flatMap((scan) => [
      scan.thumbnail,
      ...thumbnailsOf(scan.sections ?? []),
    ]);
  const kept = new Set(thumbnailsOf(next.scans));
  thumbnailsOf(session.scans).forEach((thumbnail) => {
    if (thumbnail.startsWith('blob:') && !kept.has(thumbnail))
      URL.revokeObjectURL(thumbnail);
  });
  if (session.scans.length === 0 && next.scans.length > 0) {
    sessionOrder = nextBackgroundOrder();
  }
  session = next;
  listeners.forEach((listener) => listener());
}

/** The photo barcode a Product Scan card has decoded so far, if any. */
export const photoBarcodeOf = (state: SessionState, id: string) =>
  state.scans.find((scan) => scan.id === id)?.barcode;

export const getScanSession = () => session;
export const dispatchScanSession = (action: SessionAction) =>
  setSession(sessionReducer(session, action));
export const getScanSessionOrder = () => sessionOrder;
/** Ends the Scan Session: its cards and its Scan Language pick go. */
export const resetScanSession = () => {
  clearScanLanguageOverride();
  setSession(emptySession);
};

/** The Scan Session, re-rendering when it changes. It outlives the screens that show it. */
export function useScanSession(): SessionState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getScanSession);
}
