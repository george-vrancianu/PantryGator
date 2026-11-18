import { createContext } from 'react';

/** What an editor hands the sheet that hosts it: the sheet's title and its action roles. */
export type EditorSheetRoles = {
  title: string;
  primary?: {
    label: string;
    pending?: boolean;
    disabled?: boolean;
    form: string;
  };
  destructive?: { label: string; onClick: () => void };
};

/**
 * Set by a sheet that hosts an editor. `report` hands the editor's heading and its Save / Delete to
 * the sheet, which draws them as its title and action roles, so {@link EditorForm} draws none of
 * its own. `report(null)` when the editor goes.
 */
export type EditorSheetSlot = {
  report: (roles: EditorSheetRoles | null) => void;
};

export const EditorSheetContext = createContext<EditorSheetSlot | null>(null);
