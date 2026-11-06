import { ApiError, apiRequest, isNetworkError } from './api';
import { OUT_OF_CREDITS } from './credits';
import { barcodeCardLine, lookupBarcode } from './barcode';
import type { PlateDishes } from './plate';
import { scanQuery, type ScanMode, type ScanResponse } from './scan';
import {
  MAX_CONCURRENT_READS,
  sessionHeld,
  dispatchScanSession,
  getScanSession,
  isBarcodeCard,
  isBarcodeMode,
  type SessionScan,
} from './scanSession';

/** Where each Scan Mode's photo is sent, and the body field it goes in. Plate is read apart: it yields dish guesses, not lines. */
const READ: Record<
  Exclude<ScanMode, 'plate'>,
  { path: string; field: string }
> = {
  product: { path: '/scan/product', field: 'productImage' },
  ingredients: { path: '/scan/ingredients', field: 'ingredientsImage' },
  receipt: { path: '/scan/receipt', field: 'receiptImage' },
};

const inFlight = new Set<string>();
const settledListeners = new Set<() => void>();

/** Calls `listener` whenever a Scan Session read settles, read or failed. Returns how to stop. */
export function onScanReadSettled(listener: () => void) {
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
  };
}
/** Barcode Lookups under way: free and instant, so they take no read slot. */
const lookups = new Set<string>();

/** A dropped connection gets one more try; any other error is the answer. */
const withNetworkRetry = <T>(request: () => Promise<T>) =>
  request().catch((error: unknown) =>
    isNetworkError(error) ? request() : Promise.reject(error),
  );

/** A Plate Scan has no Scan Language; its photo yields dish guesses to pick from. */
function readPlate(scan: SessionScan) {
  return withNetworkRetry(() =>
    apiRequest<PlateDishes>(`/scan/plate${scanQuery()}`, {
      method: 'POST',
      body: { plateImage: scan.image },
    }),
  ).then(({ dishes, token }) =>
    dispatchScanSession({ type: 'readDishes', id: scan.id, dishes, token }),
  );
}

async function send(scan: SessionScan, mode: keyof typeof READ) {
  const target = READ[mode];
  const { lines } = await withNetworkRetry(() =>
    apiRequest<ScanResponse>(`${target.path}${scanQuery(scan.scanLanguage)}`, {
      method: 'POST',
      body: { [target.field]: scan.image },
    }),
  );
  if (lines.length === 0) throw new ApiError('scan.nothing_found', 0);
  return lines;
}

/** A decode that takes longer than this is given up on: no barcode. */
export const PHOTO_DECODE_TIMEOUT_MS = 10_000;
/** Photo barcode decodes waiting their turn: one at a time, across screens. */
let decodeChain: Promise<void> = Promise.resolve();

/**
 * Decodes a Product Scan's full-size photo for a barcode, on the device, alongside the read: it
 * settles on its own and never delays or fails the card. Decodes run one at a time, because a
 * gallery import can bring up to 20 photos and each decode is heavy main-thread work. A decode
 * that hangs is given up on after a timeout. A card saved or removed meanwhile is skipped, and a
 * late code is dropped by the Session. It starts in a microtask, not the overlay's
 * `setTimeout(0)`, so no timer is left pending; the read request is already out by then.
 */
export function decodePhotoBarcode(
  id: string,
  photo: Blob,
  /** The camera module's photo barcode reader. */
  readBarcode: (photo: Blob) => Promise<string | null>,
) {
  decodeChain = decodeChain
    .then(async () => {
      if (!getScanSession().scans.some((scan) => scan.id === id)) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const code = await Promise.race([
          readBarcode(photo),
          new Promise<null>((resolve) => {
            timer = setTimeout(resolve, PHOTO_DECODE_TIMEOUT_MS, null);
          }),
        ]);
        if (code) dispatchScanSession({ type: 'photoBarcode', id, code });
      } finally {
        clearTimeout(timer);
      }
    })
    .catch(() => {});
}

/** Forgets the requests in flight; for tests, which abandon them. */
export function resetReads() {
  inFlight.clear();
  lookups.clear();
  decodeChain = Promise.resolve();
}

/** Starts the Barcode Lookup of every Barcode card waiting for one, outside the read slots and the Scan Cap. */
function startLookups() {
  for (const scan of getScanSession().scans) {
    if (
      !isBarcodeCard(scan) ||
      scan.status !== 'reading' ||
      lookups.has(scan.id) ||
      !scan.code
    )
      continue;
    const code = scan.code;
    lookups.add(scan.id);
    lookupBarcode(code)
      .then((lookup) =>
        dispatchScanSession({
          type: 'read',
          id: scan.id,
          lines: [barcodeCardLine(code, lookup)],
        }),
      )
      .catch((error: unknown) => {
        const api = error instanceof ApiError ? error : null;
        dispatchScanSession({
          type: 'fail',
          id: scan.id,
          reason: 'error',
          code: api?.code,
          params: api?.params,
        });
      })
      .finally(() => lookups.delete(scan.id));
  }
}

/**
 * Starts the reads the Scan Session has room for and carries on as they finish, so reads go on
 * after the Scan screen is left. A Scan that cannot be read stays in the Scan Session as failed, with the
 * Scan Cap as its own reason. The slots are counted by requests still out, not by the Scans'
 * status, so removing a reading Scan does not let a third request start.
 */
export function readScans() {
  startLookups();
  // Past the Scan Cap (or out of Credits) every read would fail; the rest wait until the capped Scan is retried or removed.
  if (inFlight.size >= MAX_CONCURRENT_READS || sessionHeld(getScanSession()))
    return;
  dispatchScanSession({ type: 'start' });
  for (const scan of getScanSession().scans) {
    if (inFlight.size >= MAX_CONCURRENT_READS) return;
    if (
      scan.status !== 'reading' ||
      inFlight.has(scan.id) ||
      isBarcodeMode(scan.mode)
    )
      continue;
    inFlight.add(scan.id);
    (scan.mode === 'plate'
      ? readPlate(scan)
      : send(scan, scan.mode).then((lines) =>
          dispatchScanSession({ type: 'read', id: scan.id, lines }),
        )
    )
      .catch((error: unknown) => {
        const api = error instanceof ApiError ? error : null;
        dispatchScanSession({
          type: 'fail',
          id: scan.id,
          reason:
            api?.code === 'scan.cap_reached'
              ? 'cap'
              : api?.code === OUT_OF_CREDITS
                ? 'credits'
                : 'error',
          code: api?.code,
          params: api?.params,
        });
      })
      .finally(() => {
        inFlight.delete(scan.id);
        settledListeners.forEach((listener) => listener());
        readScans();
      });
  }
}
