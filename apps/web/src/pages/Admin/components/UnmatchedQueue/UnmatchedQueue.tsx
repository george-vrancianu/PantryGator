import {
  AlertIcon,
  Box,
  Card,
  Chip,
  ListRow,
  SegmentedControl,
  Stack,
  SwipeRow,
  Typography,
  visuallyHidden,
  type SwipeRowLabels,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReviewCounts } from '@/lib/reviewCounts';
import type { AdminCatalog } from '@/lib/admin';
import {
  unmatchedQueueKey,
  useDismissUnmatched,
  useUndismissUnmatched,
  useUnmatchedQueue,
  type UnmatchedEntry,
  type UnmatchedStatus,
} from '@/lib/unmatched';
import { useDeferredRemoval } from '@/lib/useDeferredRemoval';
import { useRowHint, type RowHint } from '@/lib/useRowHint';
import { FamilyIngredientsQueue } from '../FamilyIngredientsQueue/FamilyIngredientsQueue';
import { FamilySynonymsQueue } from '../FamilySynonymsQueue/FamilySynonymsQueue';
import {
  EmptyCard,
  HintLine,
  QueueNotice,
  useLoadMore,
  useReviewSheet,
  useSheetFocus,
} from '../ReviewParts/ReviewParts';
import { ReviewRow, ReviewTile, rowChevron } from '../ReviewRow/ReviewRow';
import { UnmatchedMeta } from '../UnmatchedMeta/UnmatchedMeta';
import { UnmatchedResolver } from '../UnmatchedResolver/UnmatchedResolver';

type Kind = 'unmatched' | 'family' | 'synonyms';

type Props = { catalog: AdminCatalog };

/**
 * The Admin To review queues, one kind at a time (Unmatched, Family, Names) with a count on each.
 * Unmatched names are one row per distinct normalised name; tapping one opens the resolver sheet, a
 * swipe left sets it aside (deferred, with Undo), and the Dismissed view puts it back. More pages
 * load on demand.
 */
export function UnmatchedQueue({ catalog }: Props) {
  const { t } = useTranslation(['admin', 'errors', 'common']);
  const [kind, setKind] = useState<Kind>('unmatched');
  const counts = useReviewCounts();
  const dismiss = useDismissUnmatched();
  const removal = useDeferredRemoval(unmatchedQueueKey, dismiss.mutateAsync);
  // The removal lives here, not in UnmatchedNames, so switching kind does not send it early.
  const waitingCount = useWaitingCount(removal.hiddenIds);
  const kindOptions: { value: Kind; label: string; badge: number }[] = [
    {
      value: 'unmatched',
      label: t('admin:review.kinds.unmatched'),
      badge: Math.max(0, counts.unmatched - waitingCount),
    },
    {
      value: 'family',
      label: t('admin:review.kinds.family'),
      badge: counts.family,
    },
    {
      value: 'synonyms',
      label: t('admin:review.kinds.synonyms'),
      badge: counts.names,
    },
  ];
  return (
    <Stack spacing={1.5}>
      <SegmentedControl
        label={t('admin:familyIngredients.kindLabel')}
        value={kind}
        onChange={setKind}
        dense
        options={kindOptions}
      />
      {kind === 'family' ? <FamilyIngredientsQueue /> : null}
      {kind === 'synonyms' ? <FamilySynonymsQueue /> : null}
      {kind === 'unmatched' ? (
        <UnmatchedNames
          catalog={catalog}
          removal={removal}
          dismissPending={dismiss.isPending}
          waitingCount={waitingCount}
        />
      ) : null}
    </Stack>
  );
}

/** How many open names are hidden while they wait on their Undo; names already gone from the data do not count. */
function useWaitingCount(hiddenIds: ReadonlySet<string>) {
  const open = useUnmatchedQueue('open');
  return (open.data?.entries ?? []).filter((entry) =>
    hiddenIds.has(entry.normalizedName),
  ).length;
}

function UnmatchedNames({
  catalog,
  removal,
  dismissPending,
  waitingCount,
}: Props & {
  removal: ReturnType<typeof useDeferredRemoval<string>>;
  dismissPending: boolean;
  waitingCount: number;
}) {
  const { t } = useTranslation(['admin', 'errors', 'common']);
  const [status, setStatus] = useState<UnmatchedStatus>('open');
  const [notice, setNotice] = useState<string | null>(null);
  const open = useUnmatchedQueue('open');
  const dismissedQueue = useUnmatchedQueue('dismissed');
  const queue = status === 'open' ? open : dismissedQueue;
  const undismiss = useUndismissUnmatched();
  // A name waiting on its Undo stays out of the list, refetches included, until its dismiss has settled.
  const entries = (queue.data?.entries ?? []).filter(
    (entry) => !removal.hiddenIds.has(entry.normalizedName),
  );
  const sheet = useReviewSheet<UnmatchedEntry>();
  const {
    heading,
    setNotice: noticeRegion,
    resultNext,
    afterExit,
  } = useSheetFocus(entries.length);
  const listRef = useRef<HTMLUListElement>(null);
  const { status: loadStatus, loadMore } = useLoadMore(
    queue,
    entries.length,
    listRef,
  );
  const hint = useRowHint(
    'adminQueue',
    status === 'open' && entries.length > 0,
  );
  const dismissed = status === 'dismissed';

  return (
    <Stack spacing={1.5}>
      {/* Visually hidden: the focus target when a row or the Load more button goes away. */}
      <Typography
        component="h2"
        ref={heading}
        tabIndex={-1}
        sx={visuallyHidden}
      >
        {t('admin:unmatched.title')}
      </Typography>
      <Box
        role="group"
        aria-label={t('admin:unmatched.statusLabel')}
        sx={{ display: 'flex', gap: 1 }}
      >
        {(['open', 'dismissed'] as const).map((value) => (
          <Chip
            key={value}
            label={t(`admin:unmatched.status.${value}`)}
            meta={
              value === 'open'
                ? Math.max(0, (open.data?.total ?? 0) - waitingCount)
                : (dismissedQueue.data?.total ?? 0)
            }
            selected={status === value}
            onClick={() => {
              setStatus(value);
              setNotice(null);
            }}
          />
        ))}
      </Box>
      <HintLine>{t('admin:review.hint.unmatched')}</HintLine>
      <QueueNotice ref={noticeRegion} message={notice} />
      {loadStatus}
      {queue.isSuccess && entries.length === 0 ? (
        <EmptyCard
          title={t('admin:review.emptyTitle')}
          text={t(
            dismissed ? 'admin:review.emptyDismissed' : 'admin:review.empty',
          )}
        />
      ) : null}
      {entries.length > 0 ? (
        <Box data-row-scope>
          <Card
            component="ul"
            variant="list"
            ref={listRef}
            aria-label={t('admin:unmatched.title')}
            sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
          >
            {entries.map((entry, index) =>
              dismissed ? (
                <ReviewRow
                  key={entry.normalizedName}
                  rowKey={entry.normalizedName}
                  leading={<Tile />}
                  title={entry.rawName}
                  meta={<UnmatchedMeta entry={entry} />}
                  onOpen={() => {
                    setNotice(null);
                    undismiss.reset();
                    sheet.show(entry);
                  }}
                />
              ) : (
                <UnmatchedRow
                  key={entry.normalizedName}
                  entry={entry}
                  peek={index === 0 && hint.peek}
                  onLearned={hint.onLearned}
                  disabled={dismissPending}
                  onOpen={() => {
                    setNotice(null);
                    sheet.show(entry);
                  }}
                  onDismiss={() =>
                    removal.remove(
                      entry.normalizedName,
                      entry.rawName,
                      t('admin:review.dismissed', { name: entry.rawName }),
                      { polite: true },
                    )
                  }
                />
              ),
            )}
          </Card>
        </Box>
      ) : null}
      {loadMore}
      {sheet.item ? (
        <UnmatchedResolver
          entry={sheet.item}
          catalog={catalog}
          open={sheet.open}
          onClose={sheet.close}
          onExited={() => {
            sheet.exited();
            afterExit();
          }}
          onRestore={
            dismissed
              ? () =>
                  undismiss.mutate(sheet.item?.normalizedName ?? '', {
                    onSuccess: sheet.close,
                  })
              : undefined
          }
          restoring={undismiss.isPending}
          restoreError={dismissed ? undismiss.error : undefined}
          onDone={(message) => {
            setNotice(message);
            resultNext();
            sheet.close();
          }}
        />
      ) : null}
    </Stack>
  );
}

function Tile() {
  return (
    <ReviewTile tone="soon">
      <AlertIcon size={19} />
    </ReviewTile>
  );
}

function UnmatchedRow({
  entry,
  peek,
  onLearned,
  disabled,
  onOpen,
  onDismiss,
}: {
  entry: UnmatchedEntry;
  peek: boolean;
  onLearned: RowHint['onLearned'];
  disabled: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const labels: SwipeRowLabels = {
    question: t('admin:review.dismissQuestion', { name: entry.rawName }),
    context: t('admin:unmatched.rows', { count: entry.count }),
    keep: t('common:row.keep'),
    remove: t('admin:unmatched.dismiss'),
    releaseToDelete: t('admin:unmatched.dismiss'),
    hint: t('admin:review.swipeHint'),
    editAction: t('admin:unmatched.resolveName', { name: entry.rawName }),
    removeAction: t('admin:unmatched.dismissName', { name: entry.rawName }),
  };
  return (
    <SwipeRow
      name={entry.rawName}
      labels={labels}
      disabled={disabled}
      peek={peek}
      onLearned={onLearned}
      onTap={onOpen}
      onEdit={onOpen}
      onRemove={onDismiss}
    >
      <ListRow
        leading={<Tile />}
        title={entry.rawName}
        meta={<UnmatchedMeta entry={entry} />}
        trailing={rowChevron}
      />
    </SwipeRow>
  );
}
