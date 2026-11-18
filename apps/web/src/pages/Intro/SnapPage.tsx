import {
  aboveDock,
  Box,
  Button,
  ChoiceRadioGroup,
  color,
  DOCK_HEIGHT,
  IngredientsScanIcon,
  ReceiptIcon,
  Typography,
  IntroLook,
} from '@pocket-pantry/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppDock } from '@/components/layout/AppDock/AppDock';
import { creamFocus } from './hooks/creamFocus';
import { GatorSpeech } from './components/GatorSpeech/GatorSpeech';
import { SetupCallout } from '@/components/intro/SetupCallout/SetupCallout';
import { useSnapLeave } from './hooks/useSnapLeave';
import { SetupOliveTopRow } from './components/SetupOliveTopRow/SetupOliveTopRow';
import {
  INTRO_CAMERA_PATH,
  INTRO_REVIEW_PATH,
  introPath,
  skipStep,
} from '@/lib/intro';
import { pendingCount, useScanSession } from '@/lib/scanSession';

type Pick = 'ingredients' | 'receipt';

/** Where Skip goes: the Intro module's rule, never a path written here. */
const SKIP_TO = introPath(skipStep('snap'));

/**
 * Setup 1, Snap: the olive screen that teaches where the camera lives. Gator's line follows the pick,
 * and the real Dock is shown with only the camera lit, which opens the Scan screen in the picked mode.
 * It shows the shared Scan Session (photos taken, how many are still being read) with a way to open the
 * Setup overview; the Scan Session is kept when the Member comes back from the camera.
 */
export function SnapPage() {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const [pick, setPick] = useState<Pick>('ingredients');
  const session = useScanSession();
  const taken = session.scans.length;
  const reading = pendingCount(session);
  const leave = useSnapLeave();

  return (
    <IntroLook ground="olive">
      <Box
        component="main"
        sx={[
          {
            boxSizing: 'border-box',
            maxWidth: 520,
            mx: 'auto',
            px: '24px',
            pt: '48px',
            pb: '240px',
            color: color.cardBg,
          },
          creamFocus,
        ]}
      >
        <SetupOliveTopRow skipTo={SKIP_TO} leave={leave} />

        <GatorSpeech live mt="24px">
          {t(`snap.bubble.${pick}`)}
        </GatorSpeech>

        {taken > 0 ? (
          <Box
            data-testid="snap-session"
            sx={{
              mt: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <Box role="status">
              <Typography sx={{ fontWeight: 700 }}>
                {t('snap.session.photos', { count: taken })}
              </Typography>
              <Typography sx={{ fontSize: 13 }}>
                {reading > 0
                  ? t('snap.session.stillReading', { count: reading })
                  : t('snap.session.allRead')}
              </Typography>
            </Box>
            <Button onClick={() => navigate(INTRO_REVIEW_PATH)}>
              {t('snap.session.open')}
            </Button>
          </Box>
        ) : null}

        <Box sx={{ mt: '32px' }}>
          <ChoiceRadioGroup<Pick>
            tone="olive"
            label={t('snap.question')}
            value={pick}
            onChange={setPick}
            choices={[
              {
                value: 'ingredients',
                label: t('snap.choices.ingredients.label'),
                description: t('snap.choices.ingredients.hint'),
                icon: <IngredientsScanIcon size={22} />,
              },
              {
                value: 'receipt',
                label: t('snap.choices.receipt.label'),
                description: t('snap.choices.receipt.hint'),
                icon: <ReceiptIcon size={22} />,
              },
            ]}
          />
        </Box>
      </Box>
      <SetupCallout
        title={t('snap.callout.title')}
        body={t('snap.callout.body')}
        bottom={aboveDock(DOCK_HEIGHT.xs)}
      />
      <AppDock
        teach="camera"
        cameraHref={`${INTRO_CAMERA_PATH}?mode=${pick}`}
      />
    </IntroLook>
  );
}
