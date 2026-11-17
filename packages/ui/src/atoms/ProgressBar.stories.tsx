import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import { ProgressBar } from './ProgressBar';
import { canopy } from '../theme/themeVars';

const meta: Meta<typeof ProgressBar> = {
  title: 'Atoms/ProgressBar',
  component: ProgressBar,
};
export default meta;

export const Sizes: StoryObj<typeof ProgressBar> = {
  render: () => (
    <Box sx={{ p: 3, display: 'grid', gap: 2, maxWidth: 320 }}>
      <ProgressBar label="Default" value={1} max={3} />
      <ProgressBar label="Large" value={2} max={3} size="large" />
    </Box>
  ),
};

export const OnCanopy: StoryObj<typeof ProgressBar> = {
  render: () => (
    <Box
      sx={{
        p: 3,
        display: 'grid',
        gap: 2,
        maxWidth: 320,
        background: canopy.bg,
      }}
    >
      <ProgressBar tone="canopy" label="Empty" value={0} max={4} />
      <ProgressBar tone="canopy" label="Part" value={1} max={4} />
      <ProgressBar tone="canopy" label="Done" value={4} max={4} />
    </Box>
  ),
};
