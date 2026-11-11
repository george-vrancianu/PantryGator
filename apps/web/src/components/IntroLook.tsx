import {
  bodyFont,
  Box,
  palette,
  SafeAreaBand,
  SAFE_TOP,
  useForcedThemeColor,
  tokens,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

/**
 * The Intro has no dark version: its screens use the light look (Warm) whatever Theme the device has,
 * so a subtree is forced into it, as the camera is forced dark.
 */
export function IntroLook({
  children,
  ground = 'cream',
}: {
  children: ReactNode;
  /** The Setup step screens stand on olive; the rest of the Intro is cream. */
  ground?: 'cream' | 'olive';
}) {
  useForcedThemeColor('warm');
  // The band matches the ground behind it, so the status bar reads as part of the screen.
  const groundColour =
    ground === 'olive' ? palette('pp-accent') : palette('background-default');
  return (
    <Box
      // `data-theme` and `data-ground` are also test hooks: the colours are theme variables jsdom cannot resolve.
      data-theme="warm"
      data-ground={ground}
      sx={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        // Every Intro and auth screen stands under this, so the first row clears the Dynamic Island (ADR 0040); screens inside size to the rest.
        pt: SAFE_TOP,
        backgroundColor: groundColour,
        // Resolved under this subtree's Theme: inherited text would keep the root's colour (light on cream in Dark).
        color: tokens.color.ink,
        fontFamily: bodyFont,
      }}
    >
      <SafeAreaBand color={groundColour} />
      {children}
    </Box>
  );
}
