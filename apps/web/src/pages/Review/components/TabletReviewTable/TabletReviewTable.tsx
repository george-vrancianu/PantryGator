import { Box, visuallyHidden, radius, palette } from '@pocket-pantry/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogParent } from '@/lib/catalog';
import {
  accessibleNamesOf,
  displayName,
  statusOf,
  type ReviewLine,
} from '@/lib/review';
import { rowGroup, type ReviewState } from '@/lib/reviewState';
import type { CameraMode } from '@/lib/cameraMode';
import { ExcludedRow } from '../ExcludedRow/ExcludedRow';
import { TabletReviewRow } from '../TabletReviewRow/TabletReviewRow';
import { linkButtonSx, TABLET_COLUMNS, tabletRowSx } from '../layout';

type Props = {
  state: ReviewState;
  groups: { review: ReviewLine[]; sure: ReviewLine[]; excluded: ReviewLine[] };
  parents: CatalogParent[];
  mode: CameraMode;
  /** Rows whose Save or Done was blocked. */
  blocked: Record<string, boolean>;
  onOpen: (key: string) => void;
  onToggle: (key: string) => void;
  onChange: (key: string, patch: Partial<ReviewLine>) => void;
  onSwapMatch: (key: string) => void;
  onRemove: (key: string) => void;
  onConfirm: (key: string) => void;
  onRestore: (key: string) => void;
  onToggleSureGroup: () => void;
};

/** A full-width row titling a group; "Sigure" also carries the collapse toggle. */
function GroupHeaderRow({
  kind,
  count,
  expanded,
  onToggle,
  controls,
  span,
}: {
  kind: 'review' | 'sure';
  count: number;
  expanded?: boolean;
  onToggle?: () => void;
  controls?: string;
  /** Columns of the table, for the full-width cells. */
  span: number;
}) {
  const { t } = useTranslation('review');
  return (
    <Box
      role="row"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 40,
        px: '20px',
        bgcolor: palette('pp-subtle'),
        borderTop: `1px solid ${palette('divider')}`,
      }}
    >
      <Box
        role="cell"
        aria-colspan={onToggle ? span - 1 : span}
        sx={{ flexGrow: 1 }}
      >
        <Box
          component="h2"
          sx={{
            m: 0,
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color:
              kind === 'review' ? palette('error-main') : palette('pp-accent'),
          }}
        >
          {`${t(`group.${kind}`)} · ${count}`}
        </Box>
      </Box>
      {onToggle ? (
        <Box role="cell">
          <Box
            component="button"
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? controls : undefined}
            onClick={onToggle}
            sx={linkButtonSx}
          >
            {t(expanded ? 'group.collapse' : 'group.expand')}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The tablet and laptop table (handoff §5.2): a CSS grid with table roles.
 * Same state, groups and handlers as the phone's `ReviewTable`.
 */
export function TabletReviewTable({
  state,
  groups,
  parents,
  mode,
  blocked,
  onOpen,
  onToggle,
  onChange,
  onSwapMatch,
  onRemove,
  onConfirm,
  onRestore,
  onToggleSureGroup,
}: Props) {
  const { t } = useTranslation('review');
  const sureId = useId();
  const accessibleNameOf = accessibleNamesOf(
    [...groups.review, ...groups.sure],
    (name, position) => t('position', { name, ...position }),
  );
  const row = (line: ReviewLine) => {
    const toCheck = rowGroup(state, line) !== 'ok';
    return (
      <TabletReviewRow
        key={line.key}
        line={line}
        status={statusOf(line, !!state.confirmed[line.key])}
        toCheck={toCheck}
        editing={toCheck || !!state.open[line.key]}
        parents={parents}
        mode={mode}
        blocked={!!blocked[line.key]}
        onEdit={() => onToggle(line.key)}
        onChange={(patch) => {
          // Open first, so the row keeps its group while it is typed in: it can turn sure mid-edit.
          if (toCheck) onOpen(line.key);
          onChange(line.key, patch);
        }}
        onSwapMatch={() => {
          // Hold the row in its group: a new Match clears low confidence and must not move it mid-swap.
          if (toCheck) onOpen(line.key);
          onSwapMatch(line.key);
        }}
        onRemove={() => onRemove(line.key)}
        onDone={() => onConfirm(line.key)}
        accessibleName={accessibleNameOf(line)}
      />
    );
  };
  return (
    <Box
      role="table"
      aria-label={t('title')}
      sx={{
        mt: '24px',
        bgcolor: palette('background-paper'),
        border: `1px solid ${palette('pp-line')}`,
        borderRadius: radius.card,
        overflow: 'hidden',
      }}
    >
      <Box role="rowgroup">
        <Box
          role="row"
          sx={{
            ...tabletRowSx,
            alignItems: 'center',
            height: 44,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: palette('text-secondary'),
          }}
        >
          {TABLET_COLUMNS.map((column) => (
            <Box
              key={column.key}
              role="columnheader"
              sx={{ pl: column.indent ? '12px' : 0 }}
            >
              {column.key === 'status' || column.key === 'actions' ? (
                <Box component="span" sx={visuallyHidden}>
                  {t(`col.${column.key}`)}
                </Box>
              ) : (
                t(`col.${column.key}`)
              )}
            </Box>
          ))}
        </Box>
      </Box>
      {groups.review.length > 0 ? (
        <Box role="rowgroup" aria-label={t('group.review')}>
          <GroupHeaderRow
            kind="review"
            count={groups.review.length}
            span={TABLET_COLUMNS.length}
          />
          {groups.review.map(row)}
        </Box>
      ) : null}
      {groups.sure.length > 0 ? (
        <Box role="rowgroup" aria-label={t('group.sure')}>
          <GroupHeaderRow
            kind="sure"
            count={groups.sure.length}
            expanded={state.sureOpen}
            onToggle={onToggleSureGroup}
            controls={sureId}
            span={TABLET_COLUMNS.length}
          />
          {state.sureOpen ? (
            <Box id={sureId}>{groups.sure.map(row)}</Box>
          ) : (
            <Box
              role="row"
              sx={{
                px: '20px',
                py: '10px',
                fontSize: 13,
                color: palette('text-secondary'),
                borderTop: `1px solid ${palette('divider')}`,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <Box role="cell" aria-colspan={TABLET_COLUMNS.length}>
                {groups.sure.map((line) => displayName(line)).join(', ')}
              </Box>
            </Box>
          )}
        </Box>
      ) : null}
      {groups.excluded.length > 0 ? (
        <Box role="rowgroup">
          <Box role="row">
            <Box role="cell" aria-colspan={TABLET_COLUMNS.length}>
              <ExcludedRow lines={groups.excluded} onRestore={onRestore} />
            </Box>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
