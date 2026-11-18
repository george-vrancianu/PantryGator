import { useToast } from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { voiceToast } from '@/lib/voicePlacement';
import { summarySignature, type BubbleSummary } from './bubbleState';

/** Label time on each state change, ms. */
export const LABEL_MS = 3000;

/**
 * The state last announced. Module state, like the failure counts it replaces: the layout can
 * remount the bubble (the camera takes it away), and a remount must not announce the same
 * state again.
 */
let lastAnnounced: string | null = null;
/** The sentence last announced: a change in counts the sentence leaves out is not announced again. */
let lastSentence: string | null = null;

/** Test seam: forget what was announced. */
export function resetBubbleAnnouncement() {
  lastAnnounced = null;
  lastSentence = null;
}

/**
 * On each state change: announces `sentence` once through the toast live region (a polite status)
 * and returns it for the label that slides out: 3 s, except All done, which stays until the queue
 * changes. Returns `null` the rest of the time, and while the queue is empty (the next Job
 * announces again).
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
      lastSentence = null;
      setLabel(null);
      return;
    }
    if (signature === lastAnnounced) return;
    lastAnnounced = signature;
    if (sentence === lastSentence) return;
    lastSentence = sentence;
    toast.show(sentence, { ...voiceToast(), waitForCurrent: true });
    setLabel({ text: sentence });
    // `sentence` is read only at the moment the state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (label === null || summary?.state === 'allDone') return;
    const timer = setTimeout(() => setLabel(null), LABEL_MS);
    return () => clearTimeout(timer);
    // Only the state at the moment the label appears decides whether it times out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  return label?.text ?? null;
}
