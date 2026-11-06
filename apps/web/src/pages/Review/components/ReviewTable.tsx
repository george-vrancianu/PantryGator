import { Box, tokens, radius } from '@pocket-pantry/ui';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogParent, CatalogSearchResult } from '../../../lib/catalog';
import {
  accessibleNamesOf,
  displayName,
  statusOf,
  type ReviewLine,
} from '../../../lib/review';
import type { CameraMode } from '../../../lib/cameraMode';
import { rowGroup, type ReviewState } from '../../../lib/reviewState';
import { ExcludedRow } from './ExcludedRow';
import { ReviewGroup } from './ReviewGroup';
import { ReviewLineSheet } from './ReviewLineSheet';
import { ReviewRow } from './ReviewRow';
import { rowGridSx } from './layout';

type Props = {
  state: ReviewState;
  groups: { review: ReviewLine[]; sure: ReviewLine[]; excluded: ReviewLine[] };
  parents: CatalogParent[];
  /** The key of the line whose sheet is open, kept after it closes so the sheet fades with its content. */
  sheetKey: string | null;
  sheetOpen: boolean;
  onOpenSheet: (key: string) => void;
  onCloseSheet: () => void;
  sheetInitialFocus: RefObject<HTMLElement | null>;
  onSheetEntered: () => void;
  onSheetExited: () => void;
  onChange: (key: string, patch: Partial<ReviewLine>) => void;
  onPickMatch: (key: string, match: CatalogSearchResult) => void;
  onRemove: (key: string) => void;
  onConfirm: (key: string) => void;
  onRestore: (key: string) => void;
  onToggleSureGroup: () => void;
  /** Rows whose Save or Confirm was blocked. */
  blocked: Record<string, boolean>;
  mode: CameraMode;
};

/** The card: a column header, the groups to check and the confident ones, then Excluded. */
export function ReviewTable({
  state,
  groups,
  parents,
  sheetKey,
  sheetOpen,
  onOpenSheet,
  onCloseSheet,
  sheetInitialFocus,
  onSheetEntered,
  onSheetExited,
  onChange,
  onPickMatch,
  onRemove,
  onConfirm,
  onRestore,
  onToggleSureGroup,
  blocked,
  mode,
}: Props) {
  const { t } = useTranslation('review');
  const accessibleNameOf = accessibleNamesOf(
    [...groups.review, ...groups.sure],
    (name, position) => t('position', { name, ...position }),
  );
  const row = (line: ReviewLine) => (
    <ReviewRow
      key={line.key}
      line={line}
      status={statusOf(line, !!state.confirmed[line.key])}
      open={sheetOpen && sheetKey === line.key}
      mode={mode}
      onOpen={() => onOpenSheet(line.key)}
      accessibleName={accessibleNameOf(line)}
    />
  );
  const sheetLine = state.lines.find((l) => l.key === sheetKey) ?? null;
  const columns = ['product', 'qty', 'location', 'expiry'];

  return (
    <Box
      sx={{
        mt: '14px',
        bgcolor: tokens.color.surface,
        border: `1px solid ${tokens.color.line}`,
        borderRadius: radius.card,
        overflow: 'hidden',
      }}
    >
      {/* Each row names its own cells, so the column header adds nothing for a screen reader. */}
      <Box
        aria-hidden="true"
        sx={{
          ...rowGridSx,
          height: 36,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: tokens.color.muted,
        }}
      >
        {columns.map((column, index) => (
          <Box key={column} sx={{ pl: index === 0 ? '26px' : 0 }}>
            {t(`col.${column}`)}
          </Box>
        ))}
      </Box>
      {groups.review.length > 0 ? (
        <ReviewGroup kind="review" count={groups.review.length}>
          {groups.review.map(row)}
        </ReviewGroup>
      ) : null}
      {groups.sure.length > 0 ? (
        <ReviewGroup
          kind="sure"
          count={groups.sure.length}
          expanded={state.sureOpen}
          onToggle={onToggleSureGroup}
          summary={groups.sure.map((line) => displayName(line)).join(', ')}
        >
          {groups.sure.map(row)}
        </ReviewGroup>
      ) : null}
      <ExcludedRow lines={groups.excluded} onRestore={onRestore} />
      {sheetLine ? (
        <ReviewLineSheet
          open={sheetOpen}
          line={sheetLine}
          status={statusOf(sheetLine, !!state.confirmed[sheetLine.key])}
          sure={rowGroup(state, sheetLine) === 'ok'}
          parents={parents}
          blocked={!!blocked[sheetLine.key]}
          accessibleName={accessibleNameOf(sheetLine)}
          onClose={onCloseSheet}
          initialFocus={sheetInitialFocus}
          onEntered={onSheetEntered}
          onExited={onSheetExited}
          onChange={(patch) => onChange(sheetLine.key, patch)}
          onPickMatch={(match) => onPickMatch(sheetLine.key, match)}
          onRemove={() => onRemove(sheetLine.key)}
          onConfirm={() => onConfirm(sheetLine.key)}
        />
      ) : null}
    </Box>
  );
}
