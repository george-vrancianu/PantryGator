import { INTRO_PATHS, INTRO_REVIEW_PATH } from '@/lib/intro';
import type { CameraMode } from '@/lib/cameraMode';
import { useNavigate } from 'react-router-dom';
import { ScanPage } from '@/pages/Scan/ScanPage';

/** Setup's photos are of ingredients or a receipt: the only modes the Intro's camera offers. */
const INTRO_MODES: readonly CameraMode[] = ['ingredients', 'receipt'];

/**
 * The Intro's camera (opened from Snap's Dock): the shared Scan screen with the Intro's settings. Only
 * Ingredients and Receipt, no Import, and the mode is not remembered. The shutter keeps shooting (each
 * photo is read in the background), the photo stack opens the Setup overview, and Close goes back to Snap.
 */
export function IntroCameraPage() {
  const navigate = useNavigate();
  return (
    <ScanPage
      modes={INTRO_MODES}
      defaultMode="ingredients"
      rememberMode={false}
      importOffered={false}
      openStack={() => navigate(INTRO_REVIEW_PATH)}
      closeTo={INTRO_PATHS.snap}
    />
  );
}
