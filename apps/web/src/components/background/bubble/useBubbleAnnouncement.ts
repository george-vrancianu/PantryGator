import { useToast } from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { voiceToast } from '../../../lib/voicePlacement';
import { summarySignature, type BubbleSummary } from './bubbleState';

/** Label time on each state change, ms. */
export const LABEL_MS = 3000;

/**
 * The state last announced. Module state, like the failure counts it replaces: the layout can
 * remount the bubble (the camera takes it away), and a remount must not announce the same
 * state again.
 */
let lastAnnounced: string | null = null;

/** Test seam: forget what was announced. */
export function resetBubbleAnnouncement() {
  lastAnnounced = null;
}

/**
 * On each state change: announces `sentence` once through the toast live region (a polite status)
 * and returns it for 3 s, for the label that slides out. Returns `null` the rest of the time, and
 * while the queue is empty (the next Job announces again).
 */
export function useBubbleAnnouncement(
  summary: BubbleSummary | null,
  sentence: string,
): string | null {
  const toast = useToast();
  const [label, setLabel] = useState<{ text: string } | null>(null);
  const signature = summary ? summarySignature(summary) : null;

  useEffect(() => {
    if (signature === null) {
      lastAnnounced = null;
      setLabel(null);
      return;
    }
    if (signature === lastAnnounced) return;
    lastAnnounced = signature;
    toast.show(sentence, { ...voiceToast(), waitForCurrent: true });
    setLabel({ text: sentence });
    // `sentence` is read only at the moment the state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (label === null) return;
    const timer = setTimeout(() => setLabel(null), LABEL_MS);
    return () => clearTimeout(timer);
  }, [label]);

  return label?.text ?? null;
}
