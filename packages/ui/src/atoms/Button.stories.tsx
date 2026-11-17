import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import { AddButton, Button } from './Button';
import { PantryIcon } from './icons';

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  args: { children: 'Save list' },
  decorators: [
    (Story) => (
      <Box sx={{ p: 3 }}>
        <Story />
      </Box>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {};

/** Every variant, size and shape; switch the Theme in the toolbar. */
export const All: Story = {
  render: () => (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tonal">Tonal</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete</Button>
        <Button disabled>Disabled</Button>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
        <Button size="sm">Small</Button>
        <Button size="sm" variant="secondary">
          Small secondary
        </Button>
        <Button>Done</Button>
        <Button startIcon={<PantryIcon size={18} />}>Move 3 to Pantry</Button>
        <AddButton aria-label="Add items" />
      </Box>
    </Box>
  ),
};
