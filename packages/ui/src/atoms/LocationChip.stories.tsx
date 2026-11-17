import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import { LocationChip } from './LocationChip';

const meta: Meta<typeof LocationChip> = {
  title: 'Atoms/LocationChip',
  component: LocationChip,
};
export default meta;

export const States: StoryObj<typeof LocationChip> = {
  render: () => (
    <Box sx={{ p: 3, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <LocationChip
        label="Fridge"
        count={4}
        selected={false}
        onClick={() => {}}
      />
      <LocationChip label="Freezer" count={7} selected onClick={() => {}} />
      <LocationChip
        label="Dry goods and baking supplies"
        count={12}
        selected={false}
        onClick={() => {}}
      />
      <LocationChip
        label="Spices"
        count={0}
        selected={false}
        onClick={() => {}}
      />
      <LocationChip label="Cupboard" selected={false} onClick={() => {}} />
    </Box>
  ),
};
