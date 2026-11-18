import {
  Card,
  LinkIcon,
  Stack,
  Typography,
  visuallyHidden,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useFamilySynonymsQueue,
  type FamilySynonymCandidate,
} from '@/lib/familySynonymsQueue';
import { FamilySynonymAdd } from '../FamilySynonymAdd/FamilySynonymAdd';
import {
  EmptyCard,
  HintLine,
  QueueNotice,
  useLoadMore,
  useReviewSheet,
  useSheetFocus,
} from '../ReviewParts/ReviewParts';
import { ReviewRow, ReviewTile } from '../ReviewRow/ReviewRow';

const keyOf = (candidate: FamilySynonymCandidate) =>
  `${candidate.normalizedName}|${candidate.ingredient.id}`;

/**
 * The Admin queue of Family Synonyms: one row per (name, Ingredient) across
 * Families, most owned first. A row opens a sheet to add it as a shared Synonym.
 */
export function FamilySynonymsQueue() {
  const { t } = useTranslation(['admin', 'common']);
  const queue = useFamilySynonymsQueue(true);
  const candidates = queue.data?.candidates ?? [];
  const sheet = useReviewSheet<FamilySynonymCandidate>();
  const {
    heading,
    setNotice: noticeRegion,
    resultNext,
    afterExit,
  } = useSheetFocus(candidates.length);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { status, loadMore } = useLoadMore(queue, candidates.length, listRef);

  return (
    <Stack spacing={2}>
      {/* Visually hidden: the focus target when a row goes away. */}
      <Typography
        component="h2"
        ref={heading}
        tabIndex={-1}
        sx={visuallyHidden}
      >
        {t('admin:review.kinds.synonyms')}
      </Typography>
      <HintLine>{t('admin:review.hint.synonyms')}</HintLine>
      <QueueNotice ref={noticeRegion} message={notice} />
      {status}
      {queue.isSuccess && candidates.length === 0 ? (
        <EmptyCard
          title={t('admin:review.emptyTitle')}
          text={t('admin:familySynonyms.empty')}
        />
      ) : null}
      {candidates.length > 0 ? (
        <Card
          component="ul"
          variant="list"
          ref={listRef}
          aria-label={t('admin:review.kinds.synonyms')}
          sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
        >
          {candidates.map((candidate) => (
            <ReviewRow
              key={keyOf(candidate)}
              rowKey={keyOf(candidate)}
              leading={
                <ReviewTile tone="butter">
                  <LinkIcon size={19} />
                </ReviewTile>
              }
              title={t('admin:review.synonymTitle', {
                name: candidate.name,
                ingredient: candidate.ingredient.name,
              })}
              meta={t('admin:familyIngredients.families', {
                count: candidate.familyCount,
              })}
              onOpen={() => {
                setNotice(null);
                sheet.show(candidate);
              }}
            />
          ))}
        </Card>
      ) : null}
      {loadMore}
      {sheet.item ? (
        <FamilySynonymAdd
          candidate={sheet.item}
          open={sheet.open}
          onClose={sheet.close}
          onExited={() => {
            sheet.exited();
            afterExit();
          }}
          onDone={() => {
            setNotice(
              t('admin:familySynonyms.added', {
                name: sheet.item?.name,
                ingredient: sheet.item?.ingredient.name,
              }),
            );
            resultNext();
            sheet.close();
          }}
        />
      ) : null}
    </Stack>
  );
}
