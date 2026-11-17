/** The buzz for a read landing: a Barcode scan, or the guide locking on. */
export const HAPTIC_READ_MS = 12;
/** The lighter buzz for a tap: the shutter, the mode slider, a usual-amount chip. */
export const HAPTIC_TICK_MS = 6;

/** A short buzz where the device has one. */
export function haptic(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers refuse without a user gesture: it is only a nicety.
  }
}
