import { useEffect, useRef, useState } from 'react';
import { haptic } from '@/lib/haptic';
import { useScanSession } from '@/lib/scanSession';
import { useVoiceNoteState } from '@/lib/voiceNote';
import { focusVoiceButton } from '@/lib/voiceFocus';
import { useVoiceBackgroundItems } from '@/components/voice/useVoiceBackgroundItems';
import { useVoiceReviewAll } from '@/components/voice/useVoiceReviewAll';
import { BackgroundSheet } from '../BackgroundSheet/BackgroundSheet';
import { GatorBubble } from '../GatorBubble/GatorBubble';
import { useRecipeReadBackgroundItems } from '../useRecipeReadBackgroundItems';
import {
  summarizeScanSession,
  useScanSessionBackgroundItems,
} from '../useScanSessionBackgroundItems';

/**
 * The Gator bubble and its Review sheet, hosted once by the app layout (so they show whether or not
 * voice is configured): the Voice Notes and, when the host asks for them
 * (`scanSession`, `recipeReads`), the Scan Session and the recipe reads adapted into background items. A host chooses its kinds: the
 * Intro's Say it hosts Voice Notes only. The bubble announces each state change once (a failure
 * included) through the toast live region; the Scan Session buzzes once when it becomes all read.
 * Hidden while recording or under a Sheet, and when nothing is in the background.
 *
 * The sheet is hosted here, outside the bubble: when the last note leaves while it is open, the sheet
 * closes with its animation and focus goes to the voice button, not to the page behind.
 */
export function BackgroundHost({
  scanSession = false,
  recipeReads = false,
  dock = true,
}: {
  /** Whether the Scan Session is one of the strip's items. Default: no, Voice Notes only. */
  scanSession?: boolean;
  /** Whether recipe reads are among the strip's items. Default: no; the Intro leaves them to the app. */
  recipeReads?: boolean;
  /** Whether the Dock is up: the bubble rests 16 above it, else 16 above the bottom inset. Default: yes. */
  dock?: boolean;
}) {
  const state = useVoiceNoteState();
  const voiceItems = useVoiceBackgroundItems();
  const sessionItems = useScanSessionBackgroundItems();
  const scanItems = scanSession ? sessionItems : [];
  const scans = useScanSession().scans;
  const summary = summarizeScanSession(scanSession ? scans : []);
  const recipeItems = useRecipeReadBackgroundItems(recipeReads);
  const items = [...voiceItems, ...scanItems, ...recipeItems];
  const [wantSheet, setWantSheet] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reviewAll = useVoiceReviewAll(() => setWantSheet(false));
  const up = state.phase === 'idle' && items.length > 0;

  // One short buzz when the Scan Session turns all read while the host is mounted; a host that
  // mounts with it already read (a page change) stays quiet.
  const allRead = summary.allRead;
  const wasAllRead = useRef(allRead);
  useEffect(() => {
    if (allRead && !wasAllRead.current) haptic(14);
    wasAllRead.current = allRead;
  }, [allRead]);

  return (
    <>
      {up ? (
        <GatorBubble
          items={items}
          dock={dock}
          openSheet={() => {
            setMounted(true);
            setWantSheet(true);
          }}
        />
      ) : null}
      {mounted ? (
        <BackgroundSheet
          items={items}
          primary={reviewAll.primary}
          notice={reviewAll.notice}
          open={wantSheet && items.length > 0 && state.phase === 'idle'}
          onClose={() => setWantSheet(false)}
          onExited={() => {
            reviewAll.reset();
            setMounted(false);
            setWantSheet(false);
            // The opener went with the last item; otherwise focus is wherever the Member went.
            if (items.length === 0) focusVoiceButton();
          }}
        />
      ) : null}
    </>
  );
}
