import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { introPath, nextStep, skipStep } from '@/lib/intro';
import { resetScanSession, useScanSession } from '@/lib/scanSession';
import {
  useSetupLeave,
  type SetupLeave,
} from '../components/SetupLeave/SetupLeave';

/**
 * Next and the Skip confirm for Snap, its Setup overview and its line editor: the Scan Session holds
 * unsaved cards while it has any. Next moves on to Say it and leaves them there for the app's Review;
 * Skip drops them (after the confirm) and moves on. `onDrop` runs just before Skip empties the session,
 * for a page that must not bounce on the emptied session.
 */
export function useSnapLeave(onDrop?: () => void): SetupLeave {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const { scans } = useScanSession();
  return useSetupLeave({
    unsaved: scans.length > 0,
    lostMessage: t('setupStep.lostPhotos', { count: scans.length }),
    onNext: () => navigate(introPath(nextStep('snap')), { replace: true }),
    onSkip: () => {
      onDrop?.();
      resetScanSession();
      navigate(introPath(skipStep('snap')), { replace: true });
    },
  });
}
