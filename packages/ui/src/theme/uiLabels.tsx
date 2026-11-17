import { createContext, useContext } from 'react';

/**
 * Words the design system draws itself, such as a Sheet's X. The package has no i18n, so the app
 * passes the translated text once to `PocketPantryUiProvider`; Storybook and tests get English.
 */
export type UiLabels = {
  /** The accessible name of every Sheet's X. */
  sheetClose: string;
  /** The accessible name of a Sheet's Back. */
  sheetBack: string;
};

export const DEFAULT_UI_LABELS: UiLabels = {
  sheetClose: 'Close',
  sheetBack: 'Back',
};

export const UiLabelsContext = createContext<UiLabels>(DEFAULT_UI_LABELS);

export function useUiLabels(): UiLabels {
  return useContext(UiLabelsContext);
}
