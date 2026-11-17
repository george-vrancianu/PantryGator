import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MicIcon,
  PantryIcon,
  HomeIcon,
  CookbookIcon,
  ShoppingIcon,
} from '../atoms/icons';
import { Box } from '../atoms/Layout';
import { radius } from '../theme/themeVars';
import { Dock, type DockEntry } from './Dock';
import { DockCapsule, type DockTeach } from './DockCapsule';

const meta: Meta<typeof Dock> = {
  title: 'Organisms/Dock',
  component: Dock,
};
export default meta;
type Story = StoryObj<typeof Dock>;

const items: DockEntry[] = [
  { key: 'home', label: 'Home', href: '/', icon: <HomeIcon /> },
  {
    key: 'shopping',
    label: 'Shopping',
    href: '/shopping',
    icon: <ShoppingIcon />,
  },
  { key: 'pantry', label: 'Pantry', href: '/pantry', icon: <PantryIcon /> },
  {
    key: 'recipes',
    label: 'Recipes',
    href: '/recipes',
    icon: <CookbookIcon />,
  },
];

/** Stands in for the app's hold-to-talk button, which is portalled into the capsule's mic half. */
function MicStandIn({ slot }: { slot: HTMLElement | null }) {
  return slot
    ? createPortal(
        <Box
          component="button"
          type="button"
          aria-label="Hold to record a Voice Note"
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 0,
            p: 0,
            bgcolor: 'transparent',
            color: 'inherit',
            borderRadius: `0 0 ${radius.cap} ${radius.cap}`,
          }}
        >
          <MicIcon size={26} />
        </Box>,
        slot,
      )
    : null;
}

function Teaching({ teach }: { teach?: DockTeach }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    // The Intro's ground: green, in the light look.
    <Box
      data-theme="light"
      sx={{ minHeight: '100vh', bgcolor: 'pp.accent', color: 'pp.accentInk' }}
    >
      <Dock
        label="Main"
        items={items}
        activeKey="home"
        teaching={teach !== undefined}
        centre={
          <DockCapsule
            cameraLabel="Camera"
            cameraHref="/scan"
            micSlot={setSlot}
            micLabel="Hold to record a Voice Note"
            teach={teach}
          />
        }
      />
      {teach === 'mic' ? <MicStandIn slot={slot} /> : null}
    </Box>
  );
}

/** The ordinary Dock, for comparison. */
export const Normal: Story = { render: () => <Teaching /> };

/** Teaching the camera: only it is lit and pulsing; the tabs and the mic are dimmed and do nothing. */
export const TeachCamera: Story = { render: () => <Teaching teach="camera" /> };

/** Teaching the mic: the hold-to-talk button's half is lit; the camera and tabs are dimmed. */
export const TeachMic: Story = { render: () => <Teaching teach="mic" /> };
