import type { ScanMode } from './scan';

/**
 * A mode of the camera's mode slider. Barcode is a camera mode, not a Scan Mode (ADR 0013): it never
 * joins the Scan Mode list. It can be the Scan page's remembered mode, and its Session cards ride
 * apart from the Scan Cap (ADR 0016).
 */
export type CameraMode = ScanMode | 'barcode';

/** Barcode cards are looked up at once and never wait for, or count against, the Scan Cap. */
export const isBarcodeMode = (mode: CameraMode): mode is 'barcode' =>
  mode === 'barcode';

/**
 * The Scan Mode a photo is read in for a camera mode. Barcode is not a Scan Mode and sends no photo,
 * so a photo added while it is the camera mode (Import, Add from photos) is a Product Scan.
 * Everything that needs a Scan Mode from a camera mode goes through this.
 */
export const scanModeOf = (mode: CameraMode): ScanMode =>
  isBarcodeMode(mode) ? 'product' : mode;

/** How often the barcode watch looks at a frame. */
export const SCAN_INTERVAL_MS = 250;

/** The Scan page's mode slider, in order: Barcode sits right after Product (ADR 0016). */
export const CAMERA_MODES = [
  'receipt',
  'ingredients',
  'product',
  'barcode',
  'plate',
] as const satisfies readonly CameraMode[];

export function isCameraMode(value: string | null): value is CameraMode {
  return CAMERA_MODES.some((mode) => mode === value);
}

const SCAN_PAGE_MODE_KEY = 'pocket-pantry.scan-mode';

/** The mode the Scan page was last left in, else Receipt. */
export function loadScanPageMode(): CameraMode {
  try {
    const saved = window.localStorage.getItem(SCAN_PAGE_MODE_KEY);
    if (isCameraMode(saved)) return saved;
  } catch {
    // Storage can be blocked; fall back to Receipt.
  }
  return 'receipt';
}

/** The Scan Mode for photos added away from the camera: the last-used camera mode's, else Receipt. */
export const loadLastScanMode = (): ScanMode => scanModeOf(loadScanPageMode());

/** Remembers the Scan page's mode for the next visit. */
export function saveScanPageMode(mode: CameraMode): void {
  try {
    window.localStorage.setItem(SCAN_PAGE_MODE_KEY, mode);
  } catch {
    // Not persisting is acceptable.
  }
}
