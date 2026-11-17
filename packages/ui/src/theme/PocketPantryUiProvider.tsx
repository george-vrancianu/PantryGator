import { CssBaseline, GlobalStyles } from '@mui/material';
import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import { useEffect, useMemo, type ElementType, type ReactNode } from 'react';
import { ToastProvider } from '../molecules/ToastProvider';
import { appearanceStorageManager } from './appearanceStorageManager';
import { createPocketPantryTheme, ppCssVariables } from './theme';
import { isThemeId } from './appearance';
import { THEMES } from './themes';
import { focusRingStyle } from './focusRing';
import { bodyFont, palette } from './themeVars';
import './fonts.css';

type Props = {
  children: ReactNode;
  /** Router link component so `href` props navigate client-side. */
  linkComponent?: ElementType;
};

const colourTransition = 'background-color 200ms, color 200ms';

const globalStyles = {
  ...ppCssVariables(),
  html: {
    transition: colourTransition,
    // No double-tap zoom; no font inflation when the phone rotates.
    touchAction: 'manipulation',
    WebkitTextSizeAdjust: '100%',
    textSizeAdjust: '100%',
  },
  body: {
    margin: 0,
    fontFamily: bodyFont,
    color: palette('text-primary'),
    transition: colourTransition,
  },
  ':focus-visible': focusRingStyle,
  // Also makes the Theme change instant.
  '@media (prefers-reduced-motion: reduce)': {
    '*, *::before, *::after': {
      animationDuration: '0.01ms !important',
      transitionDuration: '0.01ms !important',
    },
  },
};

/** Keeps the browser's `theme-color` on the active Theme's bg after the pre-paint script has set it. */
function ThemeColorMeta() {
  const { colorScheme } = useColorScheme();
  useEffect(() => {
    if (!isThemeId(colorScheme)) return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )) {
      meta.content = THEMES[colorScheme].bg;
    }
  }, [colorScheme]);
  return null;
}

export function PocketPantryUiProvider({ children, linkComponent }: Props) {
  const theme = useMemo(
    () => createPocketPantryTheme({ linkComponent }),
    [linkComponent],
  );
  return (
    <ThemeProvider theme={theme} storageManager={appearanceStorageManager}>
      <CssBaseline />
      <GlobalStyles styles={globalStyles} />
      <ThemeColorMeta />
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
