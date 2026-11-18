import { IntroLook } from '@pocket-pantry/ui';
import { useState } from 'react';
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useSnapLeave } from './hooks/useSnapLeave';
import { SetupReviewView } from './components/SetupReviewView/SetupReviewView';
import { INTRO_CAMERA_PATH, INTRO_REVIEW_PATH } from '@/lib/intro';
import { readScans } from '@/lib/scanReads';
import {
  dispatchScanSession,
  scanDisplayState,
  useScanSession,
} from '@/lib/scanSession';
import { useIntro } from '@/lib/useIntro';
import { ReviewPage } from '@/pages/Review/ReviewPage';

/**
 * The Setup line editor of one card of the Scan Session: the real line editor in the Intro's frame with
 * Gator's banner. It lives at `setupReviewPath(scanId)`, outside the app shell, so the Dock cannot lead
 * the Member away. Saving counts the Batches for All set and returns to the Setup overview; "‹ Review"
 * goes back to it keeping the card; Retake drops the card and goes to the camera in the same mode.
 */
export function SetupReviewPage() {
  const { scanId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { recordSaved } = useIntro();
  const scan = useScanSession().scans.find((s) => s.id === scanId);
  // Leaving drops cards from the Scan Session, which must not bounce this page to the overview on the way out.
  const [leaving, setLeaving] = useState(false);
  const leave = useSnapLeave(() => setLeaving(true));

  // A card that is not read yet (or is gone) has no editor: the overview shows its state.
  if (!scan || scanDisplayState(scan) !== 'read')
    return leaving ? null : <Navigate to={INTRO_REVIEW_PATH} replace />;

  // The editor was opened from the overview, so back is a step in the history: replacing it would leave two
  // overview entries. Opened straight (no entry before it), it goes to the overview in its place.
  const toOverview = () =>
    location.key === 'default'
      ? navigate(INTRO_REVIEW_PATH, { replace: true })
      : navigate(-1);
  const onBack = toOverview;
  const onRetake = () => {
    const { mode } = scan;
    setLeaving(true);
    dispatchScanSession({ type: 'remove', id: scan.id });
    // A photo held back by the Scan Cap can go on now.
    readScans();
    navigate(`${INTRO_CAMERA_PATH}?mode=${mode}`, { replace: true });
  };

  return (
    <IntroLook ground="canopy">
      <ReviewPage
        key={scan.id}
        settings={{
          renderFrame: (frame) => (
            <SetupReviewView
              {...frame}
              onBack={onBack}
              onRetake={onRetake}
              leave={leave}
            />
          ),
          onSaved: (saved) => {
            setLeaving(true);
            recordSaved({ batches: saved }, 'snap');
            toOverview();
          },
          onRetake,
        }}
      />
    </IntroLook>
  );
}
