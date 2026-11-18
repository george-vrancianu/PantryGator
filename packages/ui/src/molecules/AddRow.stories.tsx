import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '../atoms/Layout';
import { AddRow } from './AddRow';

const meta: Meta<typeof AddRow> = {
  title: 'Molecules/AddRow',
  component: AddRow,
};
export default meta;

export const Default: StoryObj<typeof AddRow> = {
  render: () => (
    <Box sx={{ p: 3, maxWidth: 400 }}>
      <AddRow label="Add a step" onClick={() => {}} />
    </Box>
  ),
};

export const LongLabel: StoryObj<typeof AddRow> = {
  render: () => (
    <Box sx={{ p: 3, maxWidth: 260 }}>
      <AddRow
        label="An add label that is also quite long and has to wrap"
        onClick={() => {}}
      />
    </Box>
  ),
};
