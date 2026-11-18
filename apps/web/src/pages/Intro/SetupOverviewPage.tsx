import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@pocket-pantry/ui';
import { IntroLook } from '@/components/IntroLook';
import { SetupReviewFrame } from './components/SetupReviewView/SetupReviewView';
import { useSnapLeave } from './hooks/useSnapLeave';
import { SetupTopRow } from './components/SetupTopRow/SetupTopRow';
import { INTRO_CAMERA_PATH, INTRO_PATHS, setupReviewPath } from '@/lib/intro';
import { useScanSession } from '@/lib/scanSession';
import { useAutoAdvance, useIntro } from '@/lib/useIntro';
import { ReviewOverviewPage } from '@/pages/Review/ReviewOverviewPage';

/**
 * The Setup overview (Snap, after the photos): the real Review overview of the Scan Session in the Intro's
 * frame, outside the app shell. A card opens in the Setup line editor, and Add all works as in the app.
 * Once the Scan Session is empty and something was saved the Member moves on to Say it by themselves; if
 * everything was discarded they go back to Snap.
 */
export function SetupOverviewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t: tScan } = useTranslation('scan');
  const { recordSaved, savedSteps } = useIntro();
  const { scans } = useScanSession();
  const empty = scans.length === 0;
  const advancing = useAutoAdvance('snap', empty);
  // Skip empties the Scan Session on its way out, which must not bounce this page back to Snap.
  const [leaving, setLeaving] = useState(false);

  const leave = useSnapLeave(() => setLeaving(true));
  // Landing on an empty overview with nothing saved (a stale history entry) has nothing to show: Snap. Only
  // on landing: emptying it here (Retake, Remove, Discard all) is handled where it happens.
  const [landedEmpty] = useState(empty);
  const toSnap = landedEmpty && empty && !leaving && !savedSteps.has('snap');
  useEffect(() => {
    if (toSnap) navigate(INTRO_PATHS.snap, { replace: true });
  }, [toSnap, navigate]);

  if (advancing || leaving || toSnap) return null;

  // Adding ends by emptying the Scan Session, which `useAutoAdvance` reacts to. When the Member empties it
  // without saving anything (discarding, or removing the last card) they go back to Snap and stay there.
  const backToSnapIfNothingSaved = () => {
    if (!savedSteps.has('snap')) navigate(INTRO_PATHS.snap, { replace: true });
  };

  return (
    <IntroLook>
      <ReviewOverviewPage
        settings={{
          cameraPath: (mode) =>
            mode ? `${INTRO_CAMERA_PATH}?mode=${mode}` : INTRO_CAMERA_PATH,
          cardPath: setupReviewPath,
          importOffered: false,
          onCardSaved: (lines) => recordSaved({ batches: lines }, 'snap'),
          afterAddAll: (added, notTicked) => {
            if (notTicked > 0)
              toast.show(tScan('tickFailed', { count: notTicked }), {
                polite: true,
              });
            if (added === 0) backToSnapIfNothingSaved();
          },
          afterDiscardAll: backToSnapIfNothingSaved,
          afterRemove: (remaining) => {
            if (remaining === 0) backToSnapIfNothingSaved();
          },
          renderFrame: (content) => (
            <SetupReviewFrame>
              <SetupTopRow leave={leave} />
              {content}
            </SetupReviewFrame>
          ),
        }}
      />
    </IntroLook>
  );
}
