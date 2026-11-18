import { createContext } from 'react';

/**
 * Set by whatever opens an editor as a sheet. {@link EditorForm} reads it and draws its own
 * `Sheet` (title, Save, Delete) with `onClose` as the X, scrim and Escape; without it the form is
 * a page and draws its own heading and buttons.
 */
export type EditorSheetHost = { onClose: () => void };

export const EditorSheetContext = createContext<EditorSheetHost | null>(null);
