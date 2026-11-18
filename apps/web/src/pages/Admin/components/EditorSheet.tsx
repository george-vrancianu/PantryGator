import { Box, Sheet } from '@pocket-pantry/ui';
import { useMemo, useState, type ReactNode } from 'react';
import {
  EditorSheetContext,
  type EditorSheetRoles,
} from '../../../components/editorSheetContext';

/**
 * A Catalog editor as a sheet over its list: the editor's title and the X, a scrolling body, and
 * the editor's Save pinned on the right with Delete as the destructive link. Closing it (the X,
 * scrim or Escape) leaves the list as it was, with focus back on the row that opened it.
 * The editor (an `EditorForm`) supplies the title and the roles through context.
 */
export function EditorSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const [roles, setRoles] = useState<EditorSheetRoles | null>(null);
  const slot = useMemo(() => ({ report: setRoles }), []);
  return (
    <Sheet
      open
      onClose={onClose}
      title={roles?.title ?? ''}
      primary={roles?.primary}
      destructive={roles?.destructive}
    >
      <EditorSheetContext.Provider value={slot}>
        <Box sx={{ px: 3, pt: 1, pb: 3 }}>{children}</Box>
      </EditorSheetContext.Provider>
    </Sheet>
  );
}
