import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, Typography } from '@mui/material';
import { useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';
import { Tag } from './Tag';
import { Sheet } from '../molecules/Sheet';
import { useToast } from '../molecules/ToastProvider';
import { nestedRadius, palette, radius } from '../theme/themeVars';

const meta: Meta<typeof Card> = {
  title: 'Atoms/Card and surfaces',
  component: Card,
};
export default meta;

const rows = [
  ['Tomatoes', '1 kg'],
  ['Feta', '200 g'],
  ['Cumin', '—'],
];

/** The prototype's stat, media and list cards. */
function Cards() {
  return (
    <Box
      sx={{
        p: 3,
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ display: 'grid', gap: 1 }}>
        <Typography
          sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}
        >
          Expiring soon
        </Typography>
        <Typography variant="h2" component="p" sx={{ fontSize: 26 }}>
          12
        </Typography>
        <ProgressBar label="Used" value={5} max={12} size="large" />
        <Typography variant="meta" color="text.secondary">
          5 of 12 used in a recipe
        </Typography>
      </Card>
      <Card variant="media" sx={{ display: 'grid', gap: 1 }}>
        <Box
          sx={{
            height: 96,
            borderRadius: nestedRadius(radius.card, 6),
            backgroundImage: `linear-gradient(135deg, ${palette('pp-accentTint')}, ${palette('secondary-main')})`,
          }}
        />
        <Box sx={{ px: '6px', display: 'grid', gap: 1 }}>
          <Typography variant="h4" component="p" sx={{ fontSize: 17 }}>
            Shakshuka with feta
          </Typography>
          <Typography variant="meta" color="text.secondary">
            35 min · uses 7 of 9
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            <Tag tone="accent">Can cook</Tag>
            <Tag tone="soon">2 expiring</Tag>
          </Box>
        </Box>
      </Card>
      <Card variant="list">
        {rows.map(([name, qty], index) => (
          <Box
            key={name}
            sx={{
              display: 'flex',
              py: '10px',
              borderTop: index ? 1 : 0,
              borderColor: 'divider',
            }}
          >
            <Typography sx={{ flex: 1, fontWeight: 600 }}>{name}</Typography>
            <Typography variant="meta" color="text.secondary">
              {qty}
            </Typography>
          </Box>
        ))}
      </Card>
      <Box sx={{ gridColumn: '1 / -1' }}>
        <Typography variant="sectionLabel">Section label</Typography>
      </Box>
    </Box>
  );
}

export const Cards_: StoryObj<typeof Card> = {
  name: 'Cards',
  render: () => <Cards />,
};

function ToastAndSheet() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ p: 3, display: 'flex', gap: 1 }}>
      <Button
        onClick={() =>
          toast.show('Saved “Weekly shop”', {
            action: { label: 'Edit', onClick: () => undefined },
            duration: 60000,
          })
        }
      >
        Show toast
      </Button>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add items"
        size="content"
      >
        <Box sx={{ p: 3 }}>Sheet body</Box>
      </Sheet>
    </Box>
  );
}

/** Dark-first uses a light toast. */
export const ToastAndSheet_: StoryObj<typeof Card> = {
  name: 'Toast and sheet',
  render: () => <ToastAndSheet />,
};
