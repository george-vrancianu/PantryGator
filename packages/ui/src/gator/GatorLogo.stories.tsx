import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import { useState } from 'react';
import { PlusIcon } from '../atoms/icons';
import { RefreshLoader } from '../molecules/RefreshLoader';
import { ScreenHeader } from '../molecules/ScreenHeader';
import { GatorLogo, resetGatorLogoEntrance } from './GatorLogo';

const meta: Meta<typeof GatorLogo> = {
  title: 'Atoms/GatorLogo',
  component: GatorLogo,
  args: { label: 'Refresh', size: 38 },
};
export default meta;

type Story = StoryObj<typeof GatorLogo>;

/** Switch the Theme in the toolbar: on Dark the head has a light rim and no shadow. */
export const Mark: Story = {};

export const Dashboard42: Story = { args: { size: 42 } };

/** The Entrance replays here on each mount (the story resets the once-per-load flag); 38 and 42 pt. */
function EntranceDemo({ size }: { size: 38 | 42 }) {
  const [run, setRun] = useState(0);
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <GatorLogo key={run} label="Refresh" size={size} />
      <button
        type="button"
        onClick={() => {
          resetGatorLogoEntrance();
          setRun((n) => n + 1);
        }}
      >
        Replay
      </button>
    </Box>
  );
}
export const Entrance38: Story = {
  render: () => {
    resetGatorLogoEntrance();
    return <EntranceDemo size={38} />;
  },
};
export const Entrance42: Story = {
  render: () => {
    resetGatorLogoEntrance();
    return <EntranceDemo size={42} />;
  },
};

/** Click the mark to play the Tap (0.9 s); both sizes. */
export const Tap: Story = {
  render: () => (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <GatorLogo label="Refresh" size={38} />
      <GatorLogo label="Refresh" size={42} />
    </Box>
  ),
};

/** As a link (`href`), the way the app header uses it to lead Home. */
export const AsLink: Story = {
  args: { label: 'PantryGator, go to Home', href: '#', size: 38 },
};

/** On the Dark theme, both sizes, idling. */
export const Dark: Story = {
  render: () => (
    <Box
      data-theme="dark"
      sx={{ display: 'flex', gap: 2, p: 2, bgcolor: 'background.default' }}
    >
      <GatorLogo label="Refresh" size={38} />
      <GatorLogo label="Refresh" size={42} />
    </Box>
  ),
};

type Status = 'idle' | 'busy' | 'done' | 'failed';

const LABELS = {
  busy: 'Refreshing…',
  done: 'Updated just now',
  failed: "Couldn't refresh · showing what you had",
};

function TabRootHeader({ status }: { status: Status }) {
  const [taps, setTaps] = useState(0);
  return (
    <Box sx={{ maxWidth: 390, p: 2 }} data-taps={taps}>
      <ScreenHeader
        title="Pantry"
        leading={
          <GatorLogo label="Refresh" onClick={() => setTaps((n) => n + 1)} />
        }
        action={{ label: 'Add', icon: <PlusIcon size={20} /> }}
      />
      <RefreshLoader state={status} labels={LABELS} />
      <Box
        sx={{
          opacity: status === 'busy' ? 0.55 : 1,
          transition: 'opacity 250ms',
        }}
      >
        Milk, eggs, flour
      </Box>
    </Box>
  );
}

/** A tab-root header at rest, busy, done and failed; switch the Theme in the toolbar. */
export const HeaderRest: Story = {
  render: () => <TabRootHeader status="idle" />,
};
export const HeaderBusy: Story = {
  render: () => <TabRootHeader status="busy" />,
};
export const HeaderDone: Story = {
  render: () => <TabRootHeader status="done" />,
};
export const HeaderFailed: Story = {
  render: () => <TabRootHeader status="failed" />,
};

/** A successful refresh: the head rises back into the tile and the hat lands; the tile stays still. */
function ReentranceDemo() {
  const [count, setCount] = useState(0);
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <GatorLogo label="Refresh" successCount={count} />
      <button type="button" onClick={() => setCount((n) => n + 1)}>
        Succeed
      </button>
    </Box>
  );
}
export const Reentrance: Story = { render: () => <ReentranceDemo /> };
