import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Box } from './Layout';
import { Button } from './Button';
import { Popper } from './Popper';
import { border, color, radius, shadow } from '../theme/themeVars';

const meta: Meta<typeof Popper> = {
  title: 'Atoms/Popper',
  component: Popper,
  parameters: { layout: 'fullscreen' },
};
export default meta;

function Demo({ rows, contain }: { rows: number; contain: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box
      sx={{ height: '100vh', display: 'flex', alignItems: 'flex-end', p: 3 }}
    >
      <Box ref={setAnchor} sx={{ width: '100%' }}>
        <Button variant="secondary">
          Anchor near the bottom of the screen
        </Button>
      </Box>
      <Popper open anchorEl={anchor} placement="bottom-start" contain={contain}>
        <Box
          sx={{
            width: 280,
            borderRadius: radius.card,
            border: `${border.width} solid`,
            borderColor: color.cardLine,
            bgcolor: color.cardBg,
            boxShadow: shadow.float,
          }}
        >
          {Array.from({ length: rows }, (_, index) => (
            <Box key={index} sx={{ p: '12px 14px' }}>
              Row {index + 1}
            </Box>
          ))}
        </Box>
      </Popper>
    </Box>
  );
}

/** Default: flips when there is no room, but a tall popup can still run off the screen. */
export const Default: StoryObj<typeof Popper> = {
  render: () => <Demo rows={4} contain={false} />,
};

/** `contain`: flips up from the bottom of the screen and scrolls inside when it is still too tall. */
export const Contained: StoryObj<typeof Popper> = {
  render: () => <Demo rows={4} contain />,
};

export const ContainedLongList: StoryObj<typeof Popper> = {
  render: () => <Demo rows={60} contain />,
};
