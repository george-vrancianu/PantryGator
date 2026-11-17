import { useMemo } from 'react';
import {
  healthTodos,
  pantryHealth,
  withoutBatches,
  type HealthInput,
  type HealthTodo,
  type PantryHealth,
} from './health';
import {
  localIso,
  useBatches,
  useDeleteBatches,
  useLastStockedAt,
  useRunningLow,
  type Batch,
} from './pantry';
import { useFamilySettings, useStaleThresholdDays } from './settings';
import { useShoppingList } from './shopping';
import { useStaples, type Staple } from './staples';
import { useSuggestions } from './suggestions';
import { useDeferredRemoval } from './useDeferredRemoval';
import { useHealthToast } from './useHealthToast';
import { useToday } from './useToday';

export type PantryHealthState = {
  isPending: boolean;
  error: Error | null;
  /** The number of Batches in the Pantry, scored or not. */
  batchCount: number;
  /** What the score and Health To-dos were computed from, for scoring a fix before it lands. */
  input: HealthInput;
  health: PantryHealth;
  todos: HealthTodo[];
  /** What the Health To-dos' item ids point at. */
  batches: Batch[];
  staples: Staple[];
  staleThresholdDays: number;
  /** When the Family last stocked something (ISO), or null: the fourth light. Not loaded yet reads as null. */
  lastStockedAt: string | null;
  /**
   * Remove Batches from the Pantry with one Undo toast (ADR 0009). They leave the Health To-dos and the score
   * at once. `message` is the toast text, already translated; the new score is added to it when there is one.
   */
  tossBatches: (ids: string[], message: string) => void;
  /** Like `tossBatches`, for Batches the Member used. Kept apart so a reason can be sent later. */
  markUsed: (ids: string[], message: string) => void;
};

/** The Family's Pantry Health and Health To-dos, from the Pantry, Staples, Shopping List, Suggestions (dismissed ids) and Stale Threshold reads. */
export function usePantryHealth(): PantryHealthState {
  const { messageWithScore } = useHealthToast();
  const today = localIso(useToday());
  const batches = useBatches();
  const runningLow = useRunningLow();
  const staples = useStaples();
  const shopping = useShoppingList();
  const suggestions = useSuggestions(today);
  const settings = useFamilySettings();
  const staleThresholdDays = useStaleThresholdDays();
  const lastStocked = useLastStockedAt();

  const { mutateAsync: sendDeleteMany } = useDeleteBatches();
  const removal = useDeferredRemoval(['pantry'], undefined, sendDeleteMany);
  const { hiddenIds } = removal;
  const stocked = useMemo(
    () => (batches.data ?? []).filter((batch) => !hiddenIds.has(batch.id)),
    [batches.data, hiddenIds],
  );

  const input = useMemo<HealthInput>(
    () => ({
      today,
      staleThresholdDays,
      batches: stocked,
      staples: staples.data ?? [],
      runningLow: runningLow.data ?? new Set(),
      onShoppingList: new Set(
        (shopping.data?.groups ?? [])
          .flatMap((group) => group.items)
          .flatMap((item) => (item.ingredientId ? [item.ingredientId] : [])),
      ),
      dismissed: new Set(suggestions.data?.dismissed),
    }),
    [
      today,
      staleThresholdDays,
      stocked,
      staples.data,
      runningLow.data,
      shopping.data,
      suggestions.data,
    ],
  );
  const health = useMemo(() => pantryHealth(input), [input]);
  const todos = useMemo(() => healthTodos(input), [input]);

  const removeBatches = (ids: string[], message: string) => {
    removal.removeMany(
      ids,
      messageWithScore(withoutBatches(input, ids), message),
      { polite: true },
    );
  };

  return {
    isPending:
      batches.isPending ||
      staples.isPending ||
      shopping.isPending ||
      runningLow.isPending ||
      suggestions.isPending ||
      settings.isPending ||
      lastStocked.isPending,
    error:
      batches.error ??
      staples.error ??
      shopping.error ??
      runningLow.error ??
      suggestions.error,
    // Both send the same request today; neither records why.
    tossBatches: removeBatches,
    markUsed: removeBatches,
    batchCount: input.batches.length,
    input,
    health,
    todos,
    batches: stocked,
    staples: staples.data ?? [],
    staleThresholdDays,
    lastStockedAt: lastStocked.data ?? null,
  };
}
