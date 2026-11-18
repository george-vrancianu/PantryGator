import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { translateApiError } from '@/i18n/translateApiError';
import type { StorageLocation, Unit } from '@/lib/catalog';
import {
  useFinishProposal,
  useFinishShopping,
  type FinishProposalLine,
} from '@/lib/finishShopping';
import { daysUntil, parseAmountText, type IsoDate } from '@/lib/pantry';
import { shoppingListQueryKey } from '@/lib/shopping';

export type ReviewEdit = {
  quantity: string;
  unit: Unit;
  location: StorageLocation;
  /** Null for no expiry. */
  expiryDate: IsoDate | null;
};

// Only an Unmatched line with no unit lands here; it has no Amount Scale, so every unit is offered.
const FALLBACK_UNIT: Unit = 'pcs';

const initialEdit = (line: FinishProposalLine): ReviewEdit => ({
  quantity: line.quantity === null ? '' : String(line.quantity),
  unit: line.unit ?? line.defaultUnit ?? FALLBACK_UNIT,
  location: line.location,
  expiryDate: line.expiryDate,
});

/**
 * The "Usual" quick pick: the proposal's pre-filled date in days from today, the purchase day. None for an Unmatched
 * line or a line the Catalog gave no Default Expiry.
 */
const usualDaysOf = (line: FinishProposalLine, today: Date): number | null =>
  line.unmatched || line.expiryDate === null
    ? null
    : daysUntil(line.expiryDate, today);

/** Review state for Finish Shopping: proposed Batches the Member can edit or drop before confirming. */
export function useFinishReview({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const proposal = useFinishProposal();
  const finish = useFinishShopping();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, Partial<ReviewEdit>>>({});
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());

  // oxlint-disable-next-line react/purity -- "today" must follow the clock across midnight; freezing it would leave a Member on a stale day
  const today = new Date();
  const lines = (proposal.data?.lines ?? []).map((line) => {
    const edit = { ...initialEdit(line), ...edits[line.itemId] };
    return {
      line,
      edit,
      usualDays: usualDaysOf(line, today),
      dropped: dropped.has(line.itemId),
      quantityValid: parseAmountText(edit.quantity).valid,
    };
  });
  const kept = lines.filter((row) => !row.dropped);
  const listId = proposal.data?.listId;
  const canConfirm =
    proposal.isSuccess &&
    listId !== undefined &&
    lines.length > 0 &&
    kept.every((row) => row.quantityValid) &&
    !finish.isPending;

  const error = proposal.error ?? finish.error;
  // The list changed under the Review: the edits no longer match, so offer a fresh proposal.
  const stale = finish.error instanceof ApiError && finish.error.status === 409;

  return {
    isLoading: proposal.isPending,
    isEmpty: proposal.isSuccess && lines.length === 0,
    stale,
    dropped: (itemId: string) => dropped.has(itemId),
    lines,
    keptCount: kept.length,
    canConfirm,
    confirming: finish.isPending,
    error: error ? translateApiError(t, error) : null,
    edit: (itemId: string, change: Partial<ReviewEdit>) =>
      setEdits((current) => ({
        ...current,
        [itemId]: { ...current[itemId], ...change },
      })),
    toggleDrop: (itemId: string) =>
      setDropped((current) => {
        const next = new Set(current);
        if (!next.delete(itemId)) next.add(itemId);
        return next;
      }),
    reload: () => {
      setEdits({});
      setDropped(new Set());
      finish.reset();
      void proposal.refetch();
      void queryClient.invalidateQueries({ queryKey: shoppingListQueryKey });
    },
    confirm: () => {
      if (!canConfirm || listId === undefined) return;
      finish.mutate(
        {
          listId,
          lines: kept.map(({ line, edit }) => {
            // Reads a comma or a dot as the decimal mark, as the amount field does.
            const { value } = parseAmountText(edit.quantity);
            return {
              itemId: line.itemId,
              quantity: value,
              unit: value === null ? null : edit.unit,
              location: edit.location,
              expiryDate: edit.expiryDate,
            };
          }),
          droppedItemIds: lines
            .filter((row) => row.dropped)
            .map((row) => row.line.itemId),
        },
        { onSuccess: onDone },
      );
    },
  };
}
