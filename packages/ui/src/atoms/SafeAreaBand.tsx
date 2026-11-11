import Box from '@mui/material/Box';
import { SAFE_TOP } from '../theme/safeArea';
import { palette } from '../theme/themeVars';

/**
 * A fixed strip the height of the top inset that covers the status bar: scrolled content goes
 * under it, and nothing tappable sits behind the island. Paint it in the colour of the screen
 * behind it (a CSS colour); it defaults to the page background.
 */
export function SafeAreaBand({
  color = palette('background-default'),
}: {
  color?: string;
}) {
  return (
    <Box
      aria-hidden
      data-testid="safe-area-band"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: SAFE_TOP,
        bgcolor: color,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    />
  );
}
