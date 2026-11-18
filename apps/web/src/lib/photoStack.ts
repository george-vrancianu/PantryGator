import { isBarcodeCard, type SessionScan } from './scanSession';

/** What the photo stack's badge shows, first match wins (handoff 5.2). */
export type StackState = 'reading' | 'needsCrop' | 'failed' | 'read';

export type StackSummary = {
  /** Every card in the Scan Session: the same count the 20-card limit uses. */
  count: number;
  /** Cards that are not Barcode Lookups. */
  photos: number;
  barcodes: number;
  /** Scans waiting for a read slot or being read. */
  reading: number;
  /** Gallery receipts waiting for a crop. */
  needsCrop: number;
  failed: number;
  state: StackState;
  /** The last three cards, newest first: the layers of the stack. */
  top: SessionScan[];
};

/** The photo stack's badge number and state, and its layers, from the Scan Session's cards. */
export function summariseStack(scans: SessionScan[]): StackSummary {
  const barcodes = scans.filter(isBarcodeCard).length;
  const reading = scans.filter(
    (scan) => scan.status === 'queued' || scan.status === 'reading',
  ).length;
  const needsCrop = scans.filter((scan) => scan.status === 'uncropped').length;
  const failed = scans.filter((scan) => scan.status === 'failed').length;
  const state: StackState =
    reading > 0
      ? 'reading'
      : needsCrop > 0
        ? 'needsCrop'
        : failed > 0
          ? 'failed'
          : 'read';
  return {
    count: scans.length,
    photos: scans.length - barcodes,
    barcodes,
    reading,
    needsCrop,
    failed,
    state,
    top: scans.slice(-3).reverse(),
  };
}
