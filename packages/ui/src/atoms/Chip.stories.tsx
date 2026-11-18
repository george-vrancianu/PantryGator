import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '@mui/material';
import { useState } from 'react';
import { Chip } from './Chip';
import { CheckIcon, PlusIcon, TemplateIcon } from './icons';
import { Tag } from './Tag';

const meta: Meta<typeof Chip> = {
  title: 'Atoms/Chip and Tag',
  component: Chip,
};
export default meta;

function Chips() {
  const [on, setOn] = useState(true);
  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Chip
          icon={<PlusIcon />}
          label="Milk"
          meta="1 l"
          onDismiss={() => undefined}
          dismissLabel="Remove Milk"
        />
        <Chip icon={<PlusIcon />} label="Eggs" meta="12 pcs" />
        <Chip
          icon={<CheckIcon />}
          label="Butter"
          selected={on}
          onClick={() => setOn(!on)}
        />
        <Chip icon={<TemplateIcon />} label="Weekly shop" meta="12 items" />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Tag tone="accent">Covered</Tag>
        <Tag tone="ok">In Pantry</Tag>
        <Tag tone="soon">On list</Tag>
        <Tag tone="soon">2 days</Tag>
        <Tag tone="urgent">Expired</Tag>
      </Box>
    </Box>
  );
}

/** The handoff's chip row and tag pairs; switch the Theme in the toolbar. */
export const All: StoryObj<typeof Chip> = { render: () => <Chips /> };
