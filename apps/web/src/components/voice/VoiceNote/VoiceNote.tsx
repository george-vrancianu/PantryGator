import {
  APP_REVIEW,
  VoiceReview,
  type ReviewSettings,
} from '../VoiceReview/VoiceReview';
import { VoiceAnswers } from '../VoiceAnswerSheet/VoiceAnswerSheet';
import { MicSheets } from '../MicSheets/MicSheets';
import { VoiceButton } from '../VoiceButton/VoiceButton';
import { BackgroundHost } from '@/components/backgroundRead/BackgroundHost/BackgroundHost';
import { useVoiceConfigured, type VoiceDefaultTarget } from '@/lib/voice';
import { useVoiceNote } from '@/lib/useVoiceNote';
import { dockStateFor } from '@/lib/dockState';
import { useLocation } from 'react-router-dom';

/** The Default List of a route: the list its page acts on, or `none` on every other page (ADR 0021). */
export function defaultTargetFor(pathname: string): VoiceDefaultTarget {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/shopping') return 'shopping';
  if (path === '/pantry') return 'pantry';
  return 'none';
}

/**
 * How a Voice Note host behaves. The app's layout passes `APP_VOICE_SETTINGS`; the Intro's Say it passes its own.
 * The host and the Voice Note module never ask where they are.
 */
export type VoiceNoteSettings = {
  /** The Default List this host forces over the route's (ADR 0021). Absent: the route's. */
  defaultTarget?: VoiceDefaultTarget;
  /** How the Review looks and what Apply does: the app's, or the Intro's (happy Gator, "Here's what I heard", "Do these N"). */
  review: ReviewSettings;
  /** Whether this host mounts the background strip itself. Default: yes. The app's layout turns it off and hosts the strip apart from voice, so it shows without voice too. */
  hostsStrip?: boolean;
};

/** Today's in-app settings: the background strip, the route's Default List, a toast. */
export const APP_VOICE_SETTINGS: VoiceNoteSettings = { review: APP_REVIEW };

/**
 * Voice Notes, hosted once in the app layout: the hold-to-talk mic in the Dock's capsule with
 * its notices, and the Review sheet that shows "What I heard".
 * Shown on every page with the Dock, acting on that page's list on the Shopping List and the Pantry and on no
 * list elsewhere unless the settings force one. Hidden until the server says transcription is configured.
 */
export function VoiceNote({
  settings = APP_VOICE_SETTINGS,
}: {
  settings?: VoiceNoteSettings;
} = {}) {
  const showsMic = useShowsDockMic();
  const routeTarget = defaultTargetFor(useLocation().pathname);
  const defaultTarget = settings.defaultTarget ?? routeTarget;
  if (!showsMic) return null;
  return (
    <VoiceNoteControls
      key={defaultTarget}
      defaultTarget={defaultTarget}
      settings={settings}
    />
  );
}

/** Whether the Dock's capsule has a mic half: voice is configured and the page shows the Dock. The only gate for the mic. */
export function useShowsDockMic() {
  const configured = useVoiceConfigured();
  // Call every hook on every render: `useLocation()` behind `&&` ran only once voice was configured.
  const { pathname } = useLocation();
  return configured && dockStateFor(pathname).visible;
}

function VoiceNoteControls({
  defaultTarget,
  settings,
}: {
  defaultTarget: VoiceDefaultTarget;
  settings: VoiceNoteSettings;
}) {
  const voice = useVoiceNote(defaultTarget);

  return (
    <>
      <VoiceButton
        voice={voice}
        target={defaultTarget}
        scanStripHosted={settings.hostsStrip === false}
      />

      {settings.hostsStrip === false ? null : <BackgroundHost dock={false} />}

      <MicSheets mic={voice.mic} target={defaultTarget} />

      <VoiceReview review={settings.review} />

      <VoiceAnswers />
    </>
  );
}
