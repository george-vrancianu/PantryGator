import type { Decorator, Preview } from '@storybook/react-vite';
import { useLayoutEffect, type ReactNode } from 'react';
import {
  PocketPantryUiProvider,
  THEME_IDS,
  THEME_META,
  writeAppearance,
  type ThemeId,
} from '../src';

/** Applies the toolbar's Theme the way the app does, through the stored Appearance. */
function ThemeFromToolbar({
  theme,
  children,
}: {
  theme: ThemeId;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    writeAppearance({ theme, matchSystem: false });
  }, [theme]);
  return children;
}

const withTheme: Decorator = (Story, context) => (
  <PocketPantryUiProvider>
    <ThemeFromToolbar theme={context.globals.theme as ThemeId}>
      <Story />
    </ThemeFromToolbar>
  </PocketPantryUiProvider>
);

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Theme every story renders in',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: THEME_IDS.map((id) => ({
          value: id,
          title: THEME_META[id].name,
        })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: { layout: 'fullscreen' },
};

export default preview;
