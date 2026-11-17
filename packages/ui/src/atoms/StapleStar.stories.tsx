import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import { StapleStar } from './StapleStar';

const meta: Meta<typeof StapleStar> = {
  title: 'Atoms/StapleStar',
  component: StapleStar,
};
export default meta;

/** On and off at the sheet size (19) and the Pantry chip size (16). Switch the Theme to check the off outline in Dark. */
export const States: StoryObj<typeof StapleStar> = {
  render: () => (
    <Box sx={{ p: 3, display: 'flex', gap: 3, alignItems: 'center' }}>
      <StapleStar on />
      <StapleStar on={false} />
      <StapleStar on size={16} />
      <StapleStar on={false} size={16} />
    </Box>
  ),
};
