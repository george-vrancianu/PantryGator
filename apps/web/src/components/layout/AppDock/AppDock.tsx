import {
  Dock,
  DockCapsule,
  CookbookIcon,
  HomeIcon,
  PantryIcon,
  ShoppingIcon,
  type DockEntry,
  type DockTeach,
} from '@pocket-pantry/ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { DockState } from '@/lib/dockState';
import { VOICE_LAYER } from '@/lib/voicePlacement';
import { useShowsDockMic } from '@/components/voice/VoiceNote/VoiceNote';
import { MicTeachCallout } from '@/components/voice/MicTeachCallout/MicTeachCallout';
import {
  useDockRaised,
  useMicTeach,
  useRegisterDockMicSlot,
} from '@/components/voice/VoiceHost/VoiceHost';

type Props = Partial<Pick<DockState, 'activeKey'>> & {
  /**
   * Teaching mode (the Intro): light the camera or the mic half and make everything else dim, inert and
   * out of the tab order. The lit half stays the real control with its normal name.
   */
  teach?: DockTeach;
  /** Where the camera opens; Snap passes the Scan mode the Member picked. */
  cameraHref?: string;
};

export function AppDock({ activeKey, teach, cameraHref = '/scan' }: Props) {
  const { t } = useTranslation(['dock', 'voice']);
  const registerMicSlot = useRegisterDockMicSlot();
  const showMic = useShowsDockMic();
  const raised = useDockRaised();
  const micTeach = useMicTeach();
  const hint = micTeach.teaching && showMic && teach === undefined;
  const stopTeach = micTeach.stop;
  // A Voice Note started by keyboard (or any way) ends the teach, like a press does.
  useEffect(() => {
    if (raised && micTeach.teaching) stopTeach();
  }, [raised, micTeach.teaching, stopTeach]);
  const items: DockEntry[] = [
    { key: 'home', label: t('home'), href: '/', icon: <HomeIcon /> },
    {
      key: 'shopping',
      label: t('shopping'),
      href: '/shopping',
      icon: <ShoppingIcon />,
    },
    {
      key: 'pantry',
      label: t('pantry'),
      href: '/pantry',
      icon: <PantryIcon />,
    },
    {
      key: 'recipes',
      label: t('recipes'),
      href: '/recipes',
      icon: <CookbookIcon />,
    },
  ];
  return (
    <>
      {hint ? <MicTeachCallout onDone={micTeach.stop} /> : null}
      <Dock
        label={t('label')}
        items={items}
        activeKey={activeKey}
        teaching={teach !== undefined}
        zIndex={raised ? VOICE_LAYER.dock : undefined}
        centre={
          <DockCapsule
            cameraLabel={t('camera')}
            cameraHref={cameraHref}
            micSlot={showMic ? registerMicSlot : undefined}
            micLabel={t('voice:voiceButton.label')}
            teach={teach}
            highlight={hint ? 'mic' : undefined}
          />
        }
      />
    </>
  );
}
