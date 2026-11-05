import { Box, Sheet } from '@pocket-pantry/ui';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorSheetContext } from '../../../components/editorSheetContext';
import { SheetHeader } from '../../../components/SheetHeader';

/**
 * A Catalog editor as a sheet over its list: a header with the editor's title and a close button,
 * a scrolling body, and the editor's Save / Cancel pinned in the footer. Closing it (the × button,
 * scrim, Escape or Cancel) leaves the list as it was, with focus back on the row that opened it.
 * The editor (an `EditorForm`) supplies the title and the footer's buttons through context.
 */
export function EditorSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('admin');
  const [title, setTitle] = useState('');
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const slot = useMemo(() => ({ footer, setTitle }), [footer]);
  return (
    <Sheet
      open
      label={title}
      onClose={onClose}
      initialFocus={titleRef}
      header={
        <SheetHeader
          size="roomy"
          title={title}
          titleRef={titleRef}
          onClose={onClose}
          closeLabel={t('common.close')}
        />
      }
      footer={<Box ref={setFooter} sx={{ px: 3, py: 2 }} />}
    >
      <EditorSheetContext.Provider value={slot}>
        <Box sx={{ px: 3, pt: 1, pb: 3 }}>{children}</Box>
      </EditorSheetContext.Provider>
    </Sheet>
  );
}
