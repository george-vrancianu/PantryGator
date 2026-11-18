/** The buzz for a read landing: a Barcode read, and every shutter shot (useShotFeedback). */
export const HAPTIC_READ_MS = 12;
/** The lighter buzz for a tap: the shutter hold starting, the mode slider tick, a usual-amount chip. */
export const HAPTIC_TICK_MS = 6;

/** A short buzz where the device has one. */
export function haptic(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers refuse without a user gesture: it is only a nicety.
  }
}
