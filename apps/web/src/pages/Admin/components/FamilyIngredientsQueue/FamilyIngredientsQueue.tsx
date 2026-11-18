import {
  Card,
  PeopleIcon,
  Stack,
  Tag,
  visuallyHidden,
  Typography,
} from '@pocket-pantry/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFamilyIngredientsQueue } from '@/lib/familyIngredientsQueue';
import { FamilyIngredientSheet } from '../FamilyIngredientSheet/FamilyIngredientSheet';
import {
  EmptyCard,
  HintLine,
  QueueNotice,
  useLoadMore,
  useReviewSheet,
  useSheetFocus,
} from '../ReviewParts/ReviewParts';
import { ReviewRow, ReviewTile } from '../ReviewRow/ReviewRow';
import type { FamilyIngredientGroup } from '@/lib/familyIngredientsQueue';

/**
 * The Admin queue of Family Ingredients: one row per normalised name across
 * Families, most owned first. A row opens a sheet with Promote to Catalog and Merge into….
 */
export function FamilyIngredientsQueue() {
  const { t } = useTranslation(['admin', 'common']);
  const queue = useFamilyIngredientsQueue(true);
  const groups = queue.data?.groups ?? [];
  const sheet = useReviewSheet<FamilyIngredientGroup>();
  const {
    heading,
    setNotice: noticeRegion,
    resultNext,
    afterExit,
  } = useSheetFocus(groups.length);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { status, loadMore } = useLoadMore(queue, groups.length, listRef);
  const finish = (message: string) => {
    setNotice(message);
    resultNext();
    sheet.close();
  };

  return (
    <Stack spacing={2}>
      {/* Visually hidden: the focus target when a row goes away. */}
      <Typography
        component="h2"
        ref={heading}
        tabIndex={-1}
        sx={visuallyHidden}
      >
        {t('admin:review.kinds.family')}
      </Typography>
      <HintLine>{t('admin:review.hint.family')}</HintLine>
      <QueueNotice ref={noticeRegion} message={notice} />
      {status}
      {queue.isSuccess && groups.length === 0 ? (
        <EmptyCard
          title={t('admin:review.emptyTitle')}
          text={t('admin:familyIngredients.empty')}
        />
      ) : null}
      {groups.length > 0 ? (
        <Card
          component="ul"
          variant="list"
          ref={listRef}
          aria-label={t('admin:review.kinds.family')}
          sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
        >
          {groups.map((group) => (
            <ReviewRow
              key={group.normalizedName}
              rowKey={group.normalizedName}
              leading={
                <ReviewTile tone="butter">
                  <PeopleIcon size={19} />
                </ReviewTile>
              }
              title={group.name}
              meta={`${group.leafCategory.name} · ${t(`admin:locales.${group.locale}`)}`}
              tags={
                group.familyCount > 1 ? (
                  <Tag tone="neutral">
                    {t('admin:review.otherFamilies', {
                      count: group.familyCount - 1,
                    })}
                  </Tag>
                ) : null
              }
              onOpen={() => {
                setNotice(null);
                sheet.show(group);
              }}
            />
          ))}
        </Card>
      ) : null}
      {loadMore}
      {sheet.item ? (
        <FamilyIngredientSheet
          group={sheet.item}
          open={sheet.open}
          onClose={sheet.close}
          onExited={() => {
            sheet.exited();
            afterExit();
          }}
          onPromoted={(result) =>
            finish(
              t('admin:familyIngredients.promoted', {
                name: result.name,
                count: result.mergedIngredientIds.length,
              }),
            )
          }
          onMerged={(target) =>
            finish(
              t('admin:familyIngredients.merged', {
                name: sheet.item?.name,
                target,
              }),
            )
          }
        />
      ) : null}
    </Stack>
  );
}
