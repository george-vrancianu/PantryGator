import {
  Box,
  color,
  focusRing,
  MicIcon,
  MicOffIcon,
  palette,
  radius,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  LISTENING_DESTINATION,
  MAX_VOICE_NOTE_MS,
  type VoiceDefaultTarget,
} from '../../lib/voice';
import type { useVoiceNote } from '../../lib/useVoiceNote';
import { usePressGesture } from '../../lib/usePressGesture';
import {
  CreditPrice,
  useCreditPriceText,
} from '@/components/credits/CreditPrice/CreditPrice';
import { useDockMicSlot, useReportRecording, useVoiceHost } from './VoiceHost';
import { ListeningCard } from './ListeningCard';
import { useElapsedMs } from './useElapsed';
import { abovePill, aboveMic, VOICE_LAYER } from '../../lib/voicePlacement';
import { useScanSessionInStrip } from '../background/useScanSessionBackgroundItems';
import { isStripUp, useVoiceNoteState, voiceNote } from '../../lib/voiceNote';
import { VOICE_BUTTON_ATTRIBUTE } from '../../lib/voiceFocus';

type Voice = ReturnType<typeof useVoiceNote>;

/**
 * The hold-to-talk mic: the button sits in the upper half of the Dock's capsule, with the page scrim and the Listening card.
 */
export function VoiceButton({
  voice,
  target,
  scanStripHosted = false,
}: {
  voice: Voice;
  target: VoiceDefaultTarget;
  /** The page hosts the Scan Session in the background strip (the app layout): it counts as the strip being up. */
  scanStripHosted?: boolean;
}) {
  const { t } = useTranslation('voice');
  const active = voice.recording || voice.pressing;
  // While the Voice Inbox strip is up the tip must not cover its buttons.
  const state = useVoiceNoteState();
  const { startedAt } = state;
  const scanInStrip = useScanSessionInStrip();
  const pillUp =
    state.phase === 'idle' &&
    (isStripUp(state) || (scanStripHosted && scanInStrip));

  const host = useVoiceHost();
  const micSlot = useDockMicSlot();
  const reportRecording = useReportRecording();
  useEffect(() => {
    reportRecording(active);
    return () => reportRecording(false);
  }, [active, reportRecording]);
  const destinationId = useId();
  const blockedId = useId();
  const priceId = useId();
  const price = useCreditPriceText('voice');
  const { armed, buttonProps } = usePressGesture({
    active,
    start: () => void voice.press(),
    send: voice.release,
    cancel: voice.cancel,
  });

  const overlay = createPortal(
    <>
      {active ? (
        <Box
          aria-hidden
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: VOICE_LAYER.scrim,
            pointerEvents: 'none',
            backgroundColor: `color-mix(in srgb, ${palette('text-primary')} 16%, transparent)`,
          }}
        />
      ) : null}
      {voice.tip ? (
        <Box
          role="status"
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            mx: 'auto',
            width: 'fit-content',
            bottom: pillUp ? abovePill : aboveMic(10),
            zIndex: VOICE_LAYER.card,
            // A hint, never a target: taps reach whatever is under it.
            pointerEvents: 'none',
            px: '12px',
            py: '8px',
            borderRadius: radius.control,
            backgroundColor: 'pp.toastBg',
            color: 'pp.toastInk',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {t('listening.tip')}
          <CreditPrice kind="voice" sx={{ display: 'flex', fontWeight: 400 }} />
        </Box>
      ) : null}
      {active ? (
        <ListeningCard
          starting={!voice.recording}
          startedAt={startedAt}
          target={target}
          spokenLanguage={voice.spokenLanguage}
          level={voiceNote.level}
          armed={armed}
        />
      ) : null}
    </>,
    host,
  );
  const button = micSlot
    ? createPortal(
        <>
          <Box component="span" id={destinationId} hidden sx={visuallyHidden}>
            {t(LISTENING_DESTINATION[target])}
          </Box>
          {price ? (
            <Box component="span" id={priceId} hidden sx={visuallyHidden}>
              {t('voiceButton.price', { price })}
            </Box>
          ) : null}
          <Box component="span" id={blockedId} hidden sx={visuallyHidden}>
            {t('voiceButton.blocked')}
          </Box>
          <Box
            component="button"
            type="button"
            aria-label={t('voiceButton.label')}
            {...{ [VOICE_BUTTON_ATTRIBUTE]: '' }}
            aria-pressed={voice.recording}
            aria-describedby={[
              destinationId,
              price ? priceId : null,
              voice.mic.blocked ? blockedId : null,
            ]
              .filter(Boolean)
              .join(' ')}
            {...buttonProps}
            sx={[
              {
                position: 'relative',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 0,
                border: 0,
                borderRadius: `${radius.cap} ${radius.cap} 0 0`,
                backgroundColor: armed
                  ? `color-mix(in srgb, ${palette('text-primary')} 55%, ${color.cardBg})`
                  : active
                    ? color.rec
                    : 'transparent',
                color: active ? 'pp.cardBg' : 'inherit',
                cursor: 'pointer',
                // The Voice Cap is used up, or the microphone is blocked: the press shows why.
                opacity: voice.capped || voice.mic.blocked ? 0.55 : 1,
                transition: 'background-color 180ms cubic-bezier(.2,.8,.2,1)',
                // A held press must not scroll, select or open the context menu.
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
              },
              focusRing,
            ]}
          >
            {voice.recording ? <ProgressBar startedAt={startedAt} /> : null}
            {voice.mic.blocked ? (
              <MicOffIcon size={24} />
            ) : (
              <MicIcon size={24} />
            )}
          </Box>
        </>,
        micSlot,
      )
    : null;
  return (
    <>
      {overlay}
      {button}
    </>
  );
}

/** The bar along the mic's bottom edge that fills over the 60 seconds, on its own clock. */
function ProgressBar({ startedAt }: { startedAt?: number }) {
  const progress = Math.min(1, useElapsedMs(startedAt) / MAX_VOICE_NOTE_MS);
  return (
    <Box
      aria-hidden
      data-testid="progress-ring"
      sx={{
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 5,
        height: 4,
        borderRadius: radius.tag,
        pointerEvents: 'none',
        background: `linear-gradient(to right, ${color.cardBg} ${progress * 100}%, color-mix(in srgb, ${color.cardBg} 30%, transparent) 0)`,
      }}
    />
  );
}
