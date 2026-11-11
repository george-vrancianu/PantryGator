import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { Card } from '../atoms/Card';
import { SAFE_TOP } from '../theme/safeArea';
import { tokens } from '../theme/tokens';

/** A centred card on the app background, for signed-out screens. */
export function CenteredLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        // Under IntroLook, which pads the top by the inset: this fills the rest of the screen.
        minHeight: `calc(100vh - ${SAFE_TOP})`,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: '20px',
        py: '32px',
        backgroundColor: tokens.color.bg,
      }}
    >
      <Card
        component="main"
        sx={{
          width: '100%',
          maxWidth: 420,
          boxSizing: 'border-box',
          p: '24px',
        }}
      >
        {children}
      </Card>
    </Box>
  );
}
