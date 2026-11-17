import {
  bodyFont,
  Box,
  canopy,
  palette,
  SafeAreaBand,
  SAFE_TOP,
  useForcedThemeColor,
  tokens,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';

/**
 * The Intro has no dark version: its screens use the light look (Light) whatever Theme the device has,
 * so a subtree is forced into it, as the camera is forced dark.
 */
export function IntroLook({
  children,
  ground = 'cream',
}: {
  children: ReactNode;
  /** The Setup step screens stand on olive; the rest of the Intro is cream. Launch is `canopy`: a dark band over a cream sheet, which it draws itself, so no top padding here. */
  ground?: 'cream' | 'olive' | 'canopy';
}) {
  useForcedThemeColor('light');
  // The band matches the ground behind it, so the status bar reads as part of the screen.
  const groundColour =
    ground === 'olive'
      ? palette('pp-accent')
      : ground === 'canopy'
        ? canopy.base
        : palette('background-default');
  return (
    <Box
      // `data-theme` and `data-ground` are also test hooks: the colours are theme variables jsdom cannot resolve.
      data-theme="light"
      data-ground={ground}
      sx={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        // Every Intro and auth screen stands under this, so the first row clears the Dynamic Island (ADR 0040); screens inside size to the rest.
        pt: ground === 'canopy' ? 0 : SAFE_TOP,
        backgroundColor: groundColour,
        // Resolved under this subtree's Theme: inherited text would keep the root's colour (light on cream in Dark).
        color: tokens.color.ink,
        fontFamily: bodyFont,
      }}
    >
      {ground === 'canopy' ? null : <SafeAreaBand color={groundColour} />}
      {children}
    </Box>
  );
}
