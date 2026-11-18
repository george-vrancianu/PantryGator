import { Box, visuallyHidden } from '@pocket-pantry/ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { aboveMic, VOICE_LAYER } from '@/lib/voicePlacement';
import { VOICE_BUTTON_ATTRIBUTE } from '@/lib/voiceFocus';
import { SetupCallout } from '@/components/intro/SetupCallout/SetupCallout';

/** How long the callout stays up when nobody touches anything, ms. */
const MIC_TEACH_MS = 4800;

/** The callout's gap above the mic, px. */
const MIC_TEACH_GAP = 56;
const CALLOUT_WIDTH = 260;

/**
 * The live region for the teach callout. It stays mounted while the callout comes and goes: a live
 * region that appears with its text is often not announced, one that fills is. It is a bare
 * `aria-live` (no `role="status"`), so the Dock does not add a permanent status to every screen, and
 * it holds the title and line as one string so the visible callout's text is the only element with it.
 */
export function MicTeachAnnouncement({ teaching }: { teaching: boolean }) {
  const { t } = useTranslation('voice');
  return (
    <Box aria-live="polite" data-testid="mic-teach-live" sx={visuallyHidden}>
      {teaching ? `${t('teach.title')} ${t('teach.line')}` : null}
    </Box>
  );
}

/**
 * "Hold the mic, talk, let go": the callout over the lit mic. It never records by itself. It clears
 * after 4.8 s, on a tap outside the capsule, or when the mic is pressed (the normal Voice Note flow
 * takes over); the Dock's tabs and camera stay usable throughout. A route change ends the teach too
 * (`VoiceHostProvider`), so it cannot come back when the Member returns to a Dock page.
 */
export function MicTeachCallout({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('voice');
  useEffect(() => {
    const timer = window.setTimeout(onDone, MIC_TEACH_MS);
    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      const inCapsule = target?.closest('[data-dock-capsule]') != null;
      const onMic = target?.closest(`[${VOICE_BUTTON_ATTRIBUTE}]`) != null;
      if (!inCapsule || onMic) onDone();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onDone]);
  return (
    // The Dock's always-mounted live region (`MicTeachAnnouncement`) speaks this text; hiding the
    // callout keeps a screen reader from reading it twice.
    <div aria-hidden="true">
      <SetupCallout
        title={t('teach.title')}
        body={t('teach.line')}
        bottom={aboveMic(MIC_TEACH_GAP)}
        width={CALLOUT_WIDTH}
        zIndex={VOICE_LAYER.card}
      />
    </div>
  );
}
