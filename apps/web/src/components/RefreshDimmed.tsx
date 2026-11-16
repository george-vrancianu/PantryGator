import { Box } from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { useRefreshScreen } from '../lib/refresh';

/** Fades the page's content (not the top bar or header) while a refresh runs, keeping the data already shown. */
export function RefreshDimmed({ children }: { children: ReactNode }) {
  const { state } = useRefreshScreen();
  return (
    <Box
      data-testid="sheet-content"
      sx={{
        opacity: state === 'busy' ? 0.55 : 1,
        transition: 'opacity 250ms',
      }}
    >
      {children}
    </Box>
  );
}
