import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import { useState } from 'react';
import { canopy } from '../theme/themeVars';
import { SegmentedTabs } from './SegmentedTabs';

const meta: Meta<typeof SegmentedTabs> = {
  title: 'Molecules/SegmentedTabs',
  component: SegmentedTabs,
};
export default meta;

function Tabs({ onCanopy }: { onCanopy: boolean }) {
  const [value, setValue] = useState<'you' | 'family'>('you');
  return (
    <Box
      sx={{
        p: 3,
        ...(onCanopy ? { background: canopy.bg, color: canopy.ink } : {}),
      }}
    >
      <SegmentedTabs
        label="Settings"
        id="story"
        onCanopy={onCanopy}
        tabs={[
          { value: 'you', label: 'You' },
          { value: 'family', label: 'Family' },
        ]}
        value={value}
        onChange={setValue}
      />
    </Box>
  );
}

export const OnSheet: StoryObj<typeof SegmentedTabs> = {
  render: () => <Tabs onCanopy={false} />,
};

/** On the Canopy header (Settings You / Family): 44 high recessed track, a raised 34 high selected tile. */
export const OnCanopy: StoryObj<typeof SegmentedTabs> = {
  render: () => <Tabs onCanopy />,
};
