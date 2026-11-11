import {
  Box,
  CloseIcon,
  Gator,
  gutterLeft,
  gutterRight,
  color,
  palette,
  radius,
  shadow,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScanLanguage } from '../../i18n/resources';
import { pillBottom, VOICE_LAYER } from '../../lib/voicePlacement';
import {
  formatClock,
  LISTENING_DESTINATION,
  MAX_VOICE_NOTE_MS,
  type VoiceDefaultTarget,
} from '../../lib/voice';
import { CreditPrice } from '../CreditPrice';
import { enter } from './enter';
import { useElapsedMs } from './useElapsed';

/** From here the time turns amber and counts down, and "10 seconds left" is announced. */
const SOON_MS = MAX_VOICE_NOTE_MS - 10_000;

const BARS = 30;
const METER_MS = 90;

const blink = {
  animation: 'pp-voice-blink 1.1s ease-in-out infinite',
  '@keyframes pp-voice-blink': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.25 },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
};

type Props = {
  /** The pointer is down but the stream is not live yet. */
  starting: boolean;
  /** When the microphone went live; the card keeps its own clock from it. */
  startedAt?: number;
  target: VoiceDefaultTarget;
  spokenLanguage: ScanLanguage;
  /** The current input loudness, 0 to 1. */
  level: () => number;
  /** Letting go now would cancel (the pointer is far outside the button). */
  armed?: boolean;
};

/** The card above the button while a Voice Note is being recorded. */
export function ListeningCard({
  starting,
  startedAt,
  target,
  spokenLanguage,
  level,
  armed = false,
}: Props) {
  const { t } = useTranslation('voice');
  const elapsedMs = useElapsedMs(startedAt);
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0));

  // Newest on the right: the meter scrolls left.
  useEffect(() => {
    if (starting) return;
    const id = setInterval(
      () => setBars((was) => [...was.slice(1), armed ? 0 : level()]),
      METER_MS,
    );
    return () => clearInterval(id);
  }, [starting, armed, level]);

  const soon = elapsedMs >= SOON_MS;
  const left = Math.max(0, Math.ceil((MAX_VOICE_NOTE_MS - elapsedMs) / 1000));
  // What a screen reader hears: each phrase once per note, never the ticking time.
  const phrase = starting
    ? ''
    : armed
      ? t('listening.cancelArmed')
      : elapsedMs >= SOON_MS
        ? t('listening.tenLeft')
        : t('listening.recording');
  const [spoken, setSpoken] = useState({ said: [] as string[], now: '' });
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- live-region log of phrases already announced; it must update after render, once per phrase
    setSpoken((was) =>
      phrase && !was.said.includes(phrase)
        ? { said: [...was.said, phrase], now: phrase }
        : was.now === ''
          ? was
          : { ...was, now: '' },
    );
  }, [phrase]);
  const announcement = spoken.now;

  return (
    <Box
      role="status"
      sx={{
        position: 'fixed',
        left: gutterLeft(16),
        right: gutterRight(16),
        bottom: pillBottom,
        mx: 'auto',
        maxWidth: 420,
        zIndex: VOICE_LAYER.card,
        p: '14px 16px 13px',
        backgroundColor: armed ? 'pp.subtle' : 'pp.cardBg',
        color: 'text.primary',
        borderRadius: radius.card,
        boxShadow: shadow.float,
        ...enter,
      }}
    >
      <Box
        aria-hidden
        sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}
      >
        {/* The title beside Gator says "Gator's listening", so the image is decorative. */}
        <Box sx={{ flex: 'none' }}>
          <Gator mood="listening" size={92} loop="signature" decorative />
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            {armed ? (
              <Box
                component="span"
                data-testid="cancel-mark"
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'text.primary',
                  color: 'pp.cardBg',
                }}
              >
                <CloseIcon size={14} />
              </Box>
            ) : (
              <Box
                component="span"
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: color.rec,
                  ...blink,
                }}
              />
            )}
            <Box
              component="span"
              sx={{ fontSize: 15, fontWeight: 700, flex: 1 }}
            >
              {starting
                ? t('listening.starting')
                : armed
                  ? t('listening.cancelArmed')
                  : t('listening.title')}
            </Box>
            {starting ? null : (
              <>
                <Box
                  component="span"
                  data-testid="elapsed"
                  sx={{
                    fontSize: 22,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: soon && !armed ? palette('warning-main') : 'inherit',
                  }}
                >
                  {formatClock(elapsedMs)}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      soon && !armed
                        ? palette('warning-main')
                        : 'text.secondary',
                  }}
                >
                  {soon
                    ? t('listening.left', { count: left })
                    : t('listening.of')}
                </Box>
              </>
            )}
          </Box>
          <Box
            data-testid="level-meter"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              height: 38,
            }}
          >
            {bars.map((value, index) => (
              <Box
                key={index}
                sx={{
                  flex: 1,
                  borderRadius: radius.box,
                  backgroundColor: armed ? color.lineStrong : color.rec,
                  transition: 'height 90ms linear',
                }}
                style={{
                  height: armed ? 3 : 3 + Math.min(1, Math.max(0, value)) * 35,
                }}
              />
            ))}
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '4px 8px',
              fontSize: 12.5,
              color: 'text.secondary',
            }}
          >
            <Box
              component="span"
              sx={{
                px: '8px',
                py: '2px',
                borderRadius: radius.chip,
                backgroundColor: 'pp.chip',
                color: 'text.primary',
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              {spokenLanguage.toUpperCase()}
            </Box>
            <span>
              {armed ? t('listening.slideBack') : t('listening.hint')}
            </span>
            <Box
              sx={{
                flexBasis: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                {t(LISTENING_DESTINATION[target])}
              </Box>
              {/* What this Voice Note will cost; the mic's description already tells a screen reader. */}
              <CreditPrice
                kind="voice"
                sx={{ flex: 'none', fontWeight: 600, color: 'text.primary' }}
              />
            </Box>
          </Box>
        </Box>
      </Box>
      <Box component="span" sx={visuallyHidden}>
        {announcement}
      </Box>
    </Box>
  );
}
