import { Sheet } from '@pocket-pantry/ui';
import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogParent, CatalogSearchResult } from '../../../lib/catalog';
import {
  displayName,
  type ReviewLine,
  type RowStatus,
} from '../../../lib/review';
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
  sure,
  onRemove,
  onConfirm,
  onClose,
  initialFocus,
  onEntered,
  onExited,
  ...panel
}: Props) {
  const { t } = useTranslation('review');
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
      title={displayName(line)}
      primary={{
        label: t(sure ? 'action.done' : 'action.confirm'),
        onClick: onConfirm,
      }}
      destructive={{
        label: t('action.remove', { name: accessibleName }),
        onClick: onRemove,
      }}
    >
      <RowEditPanel key={opened} line={line} {...panel} />
    </Sheet>
  );
}
