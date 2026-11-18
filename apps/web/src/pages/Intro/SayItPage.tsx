import {
  Box,
  Button,
  CheckIcon,
  color,
  radius,
  Typography,
  IntroLook,
  palette,
} from '@pocket-pantry/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppDock } from '@/components/layout/AppDock/AppDock';
import { creamFocus } from './hooks/creamFocus';
import { GatorSpeech } from './components/GatorSpeech/GatorSpeech';
import { SetupCallout } from '@/components/intro/SetupCallout/SetupCallout';
import { useSetupLeave } from './components/SetupLeave/SetupLeave';
import { SetupOliveTopRow } from './components/SetupOliveTopRow/SetupOliveTopRow';
import {
  VoiceNote,
  type VoiceNoteSettings,
} from '@/components/voice/VoiceNote/VoiceNote';
import {
  useDockRaised,
  VoiceHostProvider,
  VoiceHostSlot,
} from '@/components/voice/VoiceHost/VoiceHost';
import { introPath, nextStep, savedByVoice, skipStep } from '@/lib/intro';
import { useAutoAdvance, useIntro } from '@/lib/useIntro';
import {
  useVoiceConfig,
  type VoiceApplyResult,
  type VoiceReviewAction,
} from '@/lib/voice';
import { useVoiceNoteState, voiceNote } from '@/lib/voiceNote';
import { aboveMic, PILL_OFFSET, VOICE_LAYER } from '@/lib/voicePlacement';

/** Where Skip goes without a confirm: the Intro module's rule, never a path written here. */
const SKIP_TO = introPath(skipStep('say-it'));
/** Where the step after Say it is: "Continue" when there is no mic, and "Do these N" once saved. */
const CONTINUE_TO = introPath(nextStep('say-it'));

/** Say it's Voice Note settings: the app's Voice Inbox, with the Pantry as Default List (ADR 0021), the Setup look and no toast. */
const SAY_IT_VOICE_SETTINGS: VoiceNoteSettings = {
  defaultTarget: 'pantry',
  reviewLook: 'setup',
  toastOnApply: false,
};

function ExampleCard({ phrase, result }: { phrase: string; result: string }) {
  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        px: '14px',
        py: '10px',
        borderRadius: radius.control,
        backgroundColor: color.accentOnTint,
        color: color.cardBg,
      }}
    >
      <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{phrase}</Typography>
      <Typography variant="meta" sx={{ display: 'block', opacity: 0.85 }}>
        {result}
      </Typography>
    </Box>
  );
}

/** "Keep holding while you talk. / Let go when you're done." over the scrim while the mic is held. */
function CoachLine({ held }: { held: boolean }) {
  const { t } = useTranslation('onboarding');
  // Always mounted so the live region exists before its text arrives and the line is announced.
  return (
    <Typography
      role="status"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: aboveMic(PILL_OFFSET + 112),
        zIndex: VOICE_LAYER.card,
        px: '24px',
        textAlign: 'center',
        pointerEvents: 'none',
        color: color.cardBg,
        fontSize: 20,
        fontWeight: 700,
      }}
    >
      {held ? (
        <>
          <Box component="span" sx={{ display: 'block' }}>
            {t('sayIt.coach.keepHolding')}
          </Box>
          <Box component="span" sx={{ display: 'block' }}>
            {t('sayIt.coach.letGo')}
          </Box>
        </>
      ) : null}
    </Typography>
  );
}

function SayItScreen() {
  const { t } = useTranslation('onboarding');
  const { counts, recordSaved } = useIntro();
  const voice = useVoiceConfig();
  const holding = useDockRaised();
  const { phase, inbox } = useVoiceNoteState();
  const navigate = useNavigate();
  // Any Voice Note in the Voice Inbox, one still being read included, is unapplied. Next leaves them for
  // the Dashboard's strip; a confirmed Skip clears the Voice Inbox, which also ignores a read still in flight.
  const leave = useSetupLeave({
    unsaved: inbox.total > 0,
    lostMessage: t('setupStep.lostNotes', { count: inbox.total }),
    onNext: () => navigate(CONTINUE_TO, { replace: true }),
    onSkip: () => {
      voiceNote.clear();
      navigate(SKIP_TO, { replace: true });
    },
  });
  // Every apply (one note or Review all) adds what the server really saved. Moving on to All set is
  // useAutoAdvance's: once the Voice Inbox is empty and something was saved here.
  const settings: VoiceNoteSettings = {
    ...SAY_IT_VOICE_SETTINGS,
    afterApply: (result: VoiceApplyResult, actions: VoiceReviewAction[]) => {
      // An apply of only already-done entries saved nothing new: it must not unlock moving on.
      const savedSomething = result.applied.some((e) => !e.alreadyDone);
      recordSaved(
        savedByVoice(result.applied, actions),
        savedSomething ? 'say-it' : undefined,
      );
    },
  };

  const movingOn = useAutoAdvance('say-it', inbox.total === 0);
  if (movingOn) return null;

  return (
    <>
      <Box
        component="main"
        sx={[
          {
            boxSizing: 'border-box',
            maxWidth: 520,
            mx: 'auto',
            px: '24px',
            pt: '48px',
            pb: '260px',
            color: color.cardBg,
          },
          creamFocus,
        ]}
      >
        <SetupOliveTopRow step={2} skipTo={SKIP_TO} leave={leave} />

        {counts.batches > 0 ? (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              mt: '20px',
              px: '12px',
              height: 32,
              borderRadius: radius.chip,
              backgroundColor: color.accentOnTint,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            <Box
              aria-hidden
              sx={{
                display: 'grid',
                placeItems: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                backgroundColor: palette('secondary-main'),
                color: palette('secondary-contrastText'),
              }}
            >
              <CheckIcon size={13} />
            </Box>
            {t('sayIt.pill', { count: counts.batches })}
          </Box>
        ) : null}

        <GatorSpeech>
          {voice === 'off' ? t('sayIt.noVoice.bubble') : t('sayIt.bubble')}
        </GatorSpeech>

        {voice === 'off' ? null : (
          <Box
            component="ul"
            aria-label={t('sayIt.examplesLabel')}
            sx={{
              display: 'grid',
              gap: '10px',
              m: 0,
              mt: '28px',
              p: 0,
            }}
          >
            <ExampleCard
              phrase={t('sayIt.examples.pantry.phrase')}
              result={t('sayIt.examples.pantry.result')}
            />
            <ExampleCard
              phrase={t('sayIt.examples.shopping.phrase')}
              result={t('sayIt.examples.shopping.result')}
            />
          </Box>
        )}

        {voice === 'off' ? (
          <Box sx={{ mt: '28px' }}>
            <Typography sx={{ mb: '16px' }}>
              {t('sayIt.noVoice.callout')}
            </Typography>
            <Button href={CONTINUE_TO}>{t('sayIt.noVoice.continue')}</Button>
          </Box>
        ) : null}
      </Box>

      {voice === 'on' ? (
        <>
          <CoachLine held={holding} />
          {/* Only at rest with an empty Voice Inbox: after release the strip owns the space above the mic. */}
          {!holding && phase === 'idle' && inbox.total === 0 ? (
            <SetupCallout
              title={t('sayIt.callout.title')}
              body={t('sayIt.callout.body')}
              bottom={aboveMic(10)}
            />
          ) : null}
          <VoiceHostSlot />
          <VoiceNote settings={settings} />
          <AppDock teach="mic" />
        </>
      ) : null}
    </>
  );
}

/**
 * Setup 2, Say it: the olive screen that teaches where the mic lives. The real Dock is shown with only the
 * mic lit, and holding it runs the real Voice Note flow (recording, permission, Voice Cap, the Voice Inbox, Review) in the
 * Member's Spoken Language, with the Pantry as its Default List. This screen is outside the app layout, so
 * it hosts the Voice Note itself.
 */
export function SayItPage() {
  return (
    <IntroLook ground="olive">
      <VoiceHostProvider>
        <SayItScreen />
      </VoiceHostProvider>
    </IntroLook>
  );
}
