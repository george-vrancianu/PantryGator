import { useMemo, type ReactNode } from 'react';
import { EditorSheetContext } from '../../../components/editorSheetContext';

/**
 * Opens a Catalog editor as a sheet over its list. The editor (an `EditorForm`) draws the sheet
 * itself: its title and the X, a scrolling body, Save pinned on the right and Delete as the
 * destructive link. Closing it (the X, scrim or Escape) leaves the list as it was, with focus
 * back on the row that opened it.
 */
export function EditorSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const host = useMemo(() => ({ onClose }), [onClose]);
  return (
    <EditorSheetContext.Provider value={host}>
      {children}
    </EditorSheetContext.Provider>
  );
}
