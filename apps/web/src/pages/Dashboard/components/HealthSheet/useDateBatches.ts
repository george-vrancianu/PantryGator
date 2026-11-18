import { useToast } from '@pocket-pantry/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { usualExpiryDate, withExpiryDates } from '@/lib/health';
import { useUpdateBatch, type Batch, type IsoDate } from '@/lib/pantry';
import type { PantryHealthState } from '@/lib/usePantryHealth';
import { useHealthToast } from '@/lib/useHealthToast';

export type DateFix = {
  isPending: boolean;
  /** Gives each Batch (by id) with a Default Expiry its usual date; the others are left as they are. */
  dateAll: (batchIds: string[]) => Promise<void>;
  /** Sets one Batch's expiry date, with Undo back to what it was. */
  setDate: (batch: Batch, expiryDate: IsoDate) => Promise<void>;
};

type Change = { id: string; expiryDate: IsoDate | null };

/**
 * The date fixes of the "Date N Batches" Health To-do: one PATCH per Batch, then a toast with the new score
 * whose Undo PATCHes every Batch back to the date it had.
 */
export function useDateBatches(state: PantryHealthState): DateFix {
  const { t } = useTranslation('dashboard');
  const { messageWithScore, undoOptions } = useHealthToast();
  const toast = useToast();
  const queryClient = useQueryClient();
  const update = useUpdateBatch();
  // One mutation tracks only its latest call, so the whole batch of PATCHes is counted here.
  const [running, setRunning] = useState(0);

  const track = async <T>(work: Promise<T>) => {
    setRunning((n) => n + 1);
    try {
      return await work;
    } finally {
      setRunning((n) => n - 1);
    }
  };

  const patch = (changes: Change[]) =>
    track(
      Promise.allSettled(
        changes.map(({ id, expiryDate }) =>
          update.mutateAsync({ id, edit: { expiryDate } }),
        ),
      ),
    );

  const undo = async (previous: Change[]) => {
    const results = await patch(previous);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) toast.show(translateApiError(t, failed.reason));
    await queryClient.invalidateQueries({ queryKey: ['pantry'] });
  };

  /** Applies the changes, then announces the ones that landed with the score they lead to. */
  const apply = async (
    changes: Change[],
    previous: Change[],
    message: (landed: number) => string,
  ) => {
    const results = await patch(changes);
    const landed = changes.filter(
      (_, index) => results[index].status === 'fulfilled',
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (landed.length === 0) {
      if (failed) toast.show(translateApiError(t, failed.reason));
      return;
    }
    const dates = new Map(landed.map((change) => [change.id, change]));
    const text = message(landed.length);
    const notSaved = changes.length - landed.length;
    toast.show(
      messageWithScore(
        withExpiryDates(
          state.input,
          new Map(landed.map((change) => [change.id, change.expiryDate])),
        ),
        notSaved > 0
          ? t('health.toast.withNotSaved', {
              message: text,
              notSaved: t('health.toast.notSaved', { count: notSaved }),
            })
          : text,
      ),
      undoOptions(
        () => void undo(previous.filter((change) => dates.has(change.id))),
      ),
    );
  };

  const dateAll = async (batchIds: string[]) => {
    const ids = new Set(batchIds);
    const changes: Change[] = [];
    const previous: Change[] = [];
    for (const batch of state.batches) {
      if (!ids.has(batch.id)) continue;
      const expiryDate = usualExpiryDate(batch, state.input.today);
      if (expiryDate === null) continue;
      changes.push({ id: batch.id, expiryDate });
      previous.push({ id: batch.id, expiryDate: batch.expiryDate });
    }
    if (changes.length === 0) return;
    await apply(changes, previous, (count) =>
      t('health.toast.usual', { count }),
    );
  };

  const setDate = (batch: Batch, expiryDate: IsoDate) =>
    apply(
      [{ id: batch.id, expiryDate }],
      [{ id: batch.id, expiryDate: batch.expiryDate }],
      () => t('health.toast.dated', { name: batch.name }),
    );

  return { isPending: running > 0, dateAll, setDate };
}
