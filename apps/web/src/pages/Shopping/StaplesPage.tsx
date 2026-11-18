import {
  Alert,
  ListRow,
  Spinner,
  Stack,
  SwipeRow,
  Typography,
  useToast,
  type SwipeRowHandle,
  Card,
} from '@pocket-pantry/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AmountSheet } from '../../components/AmountSheet';
import { Screen } from '../../components/layout/Screen';
import { CatalogSearch } from '@/components/catalogSearch/CatalogSearch/CatalogSearch';
import { BrowseByAisle } from '@/components/catalogSearch/emptyState/BrowseByAisle/BrowseByAisle';
import { translateApiError } from '../../i18n/translateApiError';
import { formatAmount, type Amount } from '../../lib/amount';
import {
  isPendingStaple,
  staplesQueryKey,
  useStapleMutations,
  useStaples,
  type Staple,
} from '../../lib/staples';
import { useDeferredRemoval } from '../../lib/useDeferredRemoval';
import { useRowHint, type RowHint } from '../../lib/useRowHint';
import { useSwipeRowLabels } from '../../lib/useSwipeRowLabels';
import { RowHintNote } from '../../components/RowHintNote';

/** The Family's Staples: add by Catalog search, set a preferred quantity and unit, or remove. */
export function StaplesPage() {
  const { t } = useTranslation(['staples', 'common']);
  const staples = useStaples();
  const { add, update, remove } = useStapleMutations();
  const [formKey, setFormKey] = useState(0);
  const removal = useDeferredRemoval(staplesQueryKey, remove.mutateAsync);
  // A removed Staple stays out of the list, refetches included, until its delete has settled.
  const visible = useMemo(
    () => staples.data?.filter((staple) => !removal.hiddenIds.has(staple.id)),
    [staples.data, removal.hiddenIds],
  );

  // Removing the last Staple unmounts the list that held focus: hand it to the empty text.
  const empty = useRef<HTMLElement>(null);
  const hadStaples = useRef(false);
  const stapleCount = visible?.length ?? 0;
  useEffect(() => {
    if (stapleCount === 0 && hadStaples.current) {
      const active = document.activeElement;
      if (!active || active === document.body) empty.current?.focus();
    }
    hadStaples.current = stapleCount > 0;
  }, [stapleCount]);

  const hint = useRowHint('staples', (visible?.length ?? 0) > 0);

  // A failed save is shown by the amount sheet and a failed removal by its toast.
  const error = staples.error ?? add.error;

  return (
    <Screen
      title={t('staples:title')}
      back={{ label: t('screenHeader:back'), href: '/shopping' }}
    >
      <RowHintNote hint={hint} />
      <Stack spacing={2}>
        <Typography color="text.secondary">{t('staples:hint')}</Typography>
        {error ? <Alert>{translateApiError(t, error)}</Alert> : null}
        <CatalogSearch
          emptyState={<BrowseByAisle />}
          key={formKey}
          showUnit={false}
          onSelect={(ingredient) =>
            add.mutate(
              { ingredientId: ingredient.id, name: ingredient.name },
              { onSettled: () => setFormKey((key) => key + 1) },
            )
          }
        />
        {staples.isPending ? <Spinner label={t('common:loading')} /> : null}
        {visible?.length === 0 ? (
          <Typography
            ref={empty}
            tabIndex={-1}
            color="text.secondary"
            sx={{ outline: 'none' }}
          >
            {t('staples:empty')}
          </Typography>
        ) : null}
        {visible && visible.length > 0 ? (
          <Card
            component="ul"
            variant="list"
            aria-label={t('staples:listLabel')}
            sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
          >
            {visible.map((staple, index) => (
              <StapleRow
                key={staple.id}
                staple={staple}
                peek={index === 0 && hint.peek}
                onLearned={hint.onLearned}
                onSave={(amount) =>
                  update.mutateAsync({ id: staple.id, ...amount })
                }
                onRemove={() => removal.remove(staple.id, staple.name)}
              />
            ))}
          </Card>
        ) : null}
      </Stack>
    </Screen>
  );
}

function StapleRow({
  staple,
  peek,
  onLearned,
  onSave,
  onRemove,
}: {
  staple: Staple;
  peek: boolean;
  onLearned: RowHint['onLearned'];
  /** Rejects with the API error, which the amount sheet shows. */
  onSave: (amount: Amount) => Promise<unknown>;
  onRemove: () => void;
}) {
  const { t, i18n } = useTranslation(['staples', 'common']);
  const toast = useToast();
  const labels = useSwipeRowLabels(staple.name, 'staples', { hold: true });
  const [editing, setEditing] = useState(false);
  const row = useRef<SwipeRowHandle>(null);

  return (
    <>
      <SwipeRow
        ref={row}
        name={staple.name}
        labels={labels}
        // A Staple whose add is still out has no id to save or remove by yet.
        disabled={editing || isPendingStaple(staple)}
        peek={peek}
        onLearned={onLearned}
        onEdit={() => setEditing(true)}
        onRemove={onRemove}
      >
        <ListRow
          title={staple.name}
          meta={
            staple.quantity !== null && staple.unit
              ? formatAmount(staple.quantity, staple.unit, i18n.language, t)
              : null
          }
        />
      </SwipeRow>
      <AmountSheet
        open={editing}
        name={staple.name}
        context={t('common:row.context.staples')}
        amount={{ quantity: staple.quantity, unit: staple.unit }}
        requireUnit
        onSave={async (amount) => {
          await onSave(amount);
          setEditing(false);
          toast.show(t('common:row.updated', { name: staple.name }));
        }}
        onClose={() => setEditing(false)}
        removeLabel={t('common:edit.removeStaple')}
        onRemove={() => row.current?.askToRemove()}
      />
    </>
  );
}
