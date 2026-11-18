import {
  aboveDock,
  Box,
  Button,
  ChoiceRadioGroup,
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
import { GatorSpeech } from './components/GatorSpeech/GatorSpeech';
import { IntroCanopyFrame } from '@/components/intro/IntroCanopy/IntroCanopy';
import { SetupCallout } from '@/components/intro/SetupCallout/SetupCallout';
import { useSnapLeave } from './hooks/useSnapLeave';
import { SetupTopRow } from './components/SetupTopRow/SetupTopRow';
import { INTRO_CAMERA_PATH, INTRO_REVIEW_PATH } from '@/lib/intro';
import { pendingCount, useScanSession } from '@/lib/scanSession';

type Pick = 'ingredients' | 'receipt';

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
    <IntroLook ground="canopy">
      <IntroCanopyFrame
        bottom="240px"
        top={
          <>
            <SetupTopRow leave={leave} />
            <GatorSpeech live mt="24px">
              {t(`snap.bubble.${pick}`)}
            </GatorSpeech>
          </>
        }
      >
        {taken > 0 ? (
          <Box
            data-testid="snap-session"
            sx={{
              mb: '24px',
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

        <Box>
          <ChoiceRadioGroup<Pick>
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
      </IntroCanopyFrame>
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
