import { Box, Sheet, tokens } from '@pocket-pantry/ui';
import { useState, type RefObject } from 'react';
import type { CatalogParent, CatalogSearchResult } from '../../../lib/catalog';
import {
  displayName,
  type ReviewLine,
  type RowStatus,
} from '../../../lib/review';
import { sheetTitleId } from './layout';
import { RowEditPanel } from './RowEditPanel';

type Props = {
  open: boolean;
  line: ReviewLine;
  status: RowStatus;
  /** The Confirm button reads "Done" on a row that was already sure. */
  sure: boolean;
  parents: CatalogParent[];
  blocked: boolean;
  /** From `accessibleNamesOf`: the display name, position-qualified when repeated. */
  accessibleName: string;
  /** Swipe, backdrop or Escape: the edits stay and the line is not confirmed. */
  onClose: () => void;
  /** Where focus lands once the sheet has opened (ADR 0039). */
  initialFocus: RefObject<HTMLElement | null>;
  /** Non-focus work once the sheet has opened. */
  onEntered: () => void;
  onExited: () => void;
  onChange: (patch: Partial<ReviewLine>) => void;
  onPickMatch: (match: CatalogSearchResult) => void;
  onRemove: () => void;
  onConfirm: () => void;
};

/** The phone Review's line editor: one line's whole form in a sheet titled with its name. */
export function ReviewLineSheet({
  open,
  line,
  accessibleName,
  onClose,
  initialFocus,
  onEntered,
  onExited,
  ...panel
}: Props) {
  // Bumped once the sheet has closed, so a search left half-done is gone (the old match stays) when it opens again.
  const [opened, setOpened] = useState(0);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      initialFocus={initialFocus}
      onEntered={onEntered}
      onExited={() => {
        setOpened((n) => n + 1);
        onExited();
      }}
      label={accessibleName}
      header={
        <Box
          component="h2"
          id={sheetTitleId(line.key)}
          // Focus lands here (not on a field) when a matched line has nothing to fix.
          tabIndex={-1}
          sx={{
            m: 0,
            px: '20px',
            py: '12px',
            fontSize: 18,
            fontWeight: 700,
            color: tokens.color.ink,
            overflowWrap: 'anywhere',
          }}
        >
          {displayName(line)}
        </Box>
      }
    >
      <RowEditPanel
        key={opened}
        line={line}
        accessibleName={accessibleName}
        {...panel}
      />
    </Sheet>
  );
}
