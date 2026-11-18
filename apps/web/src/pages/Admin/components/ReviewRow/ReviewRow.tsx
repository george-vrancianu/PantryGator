import {
  Box,
  ChevronRightIcon,
  ListRow,
  ListRowItem,
  insetFocusRingStyle,
  type ListRowProps,
  palette,
} from '@pocket-pantry/ui';
import type { ReactNode } from 'react';
import { RowTile } from '../CatalogRowParts/CatalogRowParts';

/** The 38 pt icon tile of a To review row: `soon` for names that need a match, `butter` for what a family added. */
export function ReviewTile({
  tone,
  children,
}: {
  tone: 'soon' | 'butter';
  children: ReactNode;
}) {
  return (
    <RowTile
      background={
        tone === 'soon' ? palette('warning-light') : palette('secondary-main')
      }
      color={
        tone === 'soon'
          ? palette('warning-main')
          : palette('secondary-contrastText')
      }
    >
      {children}
    </RowTile>
  );
}

/** The trailing chevron of a row that opens a sheet. */
export const rowChevron = <ChevronRightIcon size={18} />;

type Props = Pick<ListRowProps, 'leading' | 'title' | 'meta' | 'tags'> & {
  onOpen: () => void;
  /** Marks the row so focus can come back to it. */
  rowKey: string;
};

/** A row of the To review card that is not a swipe row: a button over a `ListRow`. */
export function ReviewRow({ onOpen, rowKey, ...row }: Props) {
  return (
    <ListRowItem>
      <Box
        component="button"
        type="button"
        data-review-row={rowKey}
        onClick={onOpen}
        sx={{
          display: 'block',
          width: '100%',
          p: 0,
          border: 0,
          background: 'none',
          font: 'inherit',
          color: 'inherit',
          textAlign: 'start',
          cursor: 'pointer',
          '&:focus-visible': insetFocusRingStyle,
        }}
      >
        <ListRow {...row} trailing={rowChevron} />
      </Box>
    </ListRowItem>
  );
}
