import { useLocation, useOutlet } from 'react-router-dom';
import { dockStateFor } from '../lib/dockState';
import { useUnloadPromptWhileReading } from '../lib/recipeReads';
import { micClearance } from '../lib/voicePlacement';
import { ApplyMemberLocale } from './ApplyMemberLocale';
import { ApplyMemberTheme } from './ApplyMemberTheme';
import { AppDock } from './AppDock';
import { RefreshProvider } from '../lib/refresh';
import { LayoutFrame } from './layout/LayoutFrame';
import {
  APP_VOICE_SETTINGS,
  useShowsDockMic,
  VoiceNote,
  type VoiceNoteSettings,
} from './VoiceNote';
import { BackgroundHost } from './background/BackgroundHost';
import { useRecipeReadsSideEffects } from './background/useRecipeReadsSideEffects';
import { useRefreshCreditsOnReads } from './background/useRefreshCreditsOnReads';
import { VoiceHostProvider, VoiceHostSlot } from './voice/VoiceHost';

/** The layout hosts the Gator bubble itself, so it shows on every page but the camera without voice configured. */
const LAYOUT_VOICE_SETTINGS: VoiceNoteSettings = {
  ...APP_VOICE_SETTINGS,
  hostsStrip: false,
};

/** The camera is full-screen: the Gator bubble stays out of it. */
const isCamera = (pathname: string) => pathname.replace(/\/$/, '') === '/scan';

/** The line editor, whose tablet layout is a wide table (the overview of cards is not). */
const isWide = (pathname: string) => pathname.startsWith('/scan/review/');

/** The signed-in shell: page frame plus the Dock for the current route. */
export function AppLayout() {
  const { pathname } = useLocation();
  const dock = dockStateFor(pathname);
  const outlet = useOutlet();
  const showsMic = useShowsDockMic();
  useUnloadPromptWhileReading();
  useRecipeReadsSideEffects();
  useRefreshCreditsOnReads();
  return (
    <>
      <ApplyMemberLocale />
      <ApplyMemberTheme />
      <RefreshProvider>
        <VoiceHostProvider>
          <LayoutFrame
            outlet={outlet}
            withDock={dock.visible}
            dockClearance={showsMic ? micClearance : undefined}
            wide={isWide(pathname)}
          />
          <VoiceHostSlot />
          <VoiceNote settings={LAYOUT_VOICE_SETTINGS} />
          {isCamera(pathname) ? null : (
            <BackgroundHost
              // The Scan Session waits for its own Review: it is not in the bubble under /scan.
              scanSession={!pathname.startsWith('/scan')}
              recipeReads
              dock={dock.visible}
            />
          )}
          {dock.visible ? <AppDock activeKey={dock.activeKey} /> : null}
        </VoiceHostProvider>
      </RefreshProvider>
    </>
  );
}
