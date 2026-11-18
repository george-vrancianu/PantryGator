import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { aboveMic, VOICE_LAYER } from '../../lib/voicePlacement';
import { VOICE_BUTTON_ATTRIBUTE } from '../../lib/voiceFocus';
import { SetupCallout } from '@/components/intro/SetupCallout/SetupCallout';

/** How long the callout stays up when nobody touches anything, ms. */
const MIC_TEACH_MS = 4800;

/** The callout's gap above the mic, px. */
const MIC_TEACH_GAP = 56;
const CALLOUT_WIDTH = 260;

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
    <SetupCallout
      title={t('teach.title')}
      body={t('teach.line')}
      bottom={aboveMic(MIC_TEACH_GAP)}
      width={CALLOUT_WIDTH}
      role="status"
      zIndex={VOICE_LAYER.card}
    />
  );
}
