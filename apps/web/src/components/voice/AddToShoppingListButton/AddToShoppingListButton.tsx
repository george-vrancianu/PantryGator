import { Alert, Box, Button, useToast } from '@pocket-pantry/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { flashRows } from '@/lib/rowFlash';
import {
  applyVoiceActions,
  type VoiceAnswer,
  type VoiceApplyResult,
  type VoiceReviewAction,
} from '@/lib/voice';
import { voiceToast } from '@/lib/voicePlacement';
import { shoppingListChangeQueryKeys } from '@/lib/queryKeys';
import { shoppingListQueryKey, useShoppingList } from '@/lib/shopping';
import { useVoiceNoteState } from '@/lib/voiceNote';
import { applyToast } from '../applyResult';

/** How long the result stays, as after Apply in Review: no Undo (ADR 0017). */
const ADD_TOAST_MS = 5200;

/** The answers the Member is out of or running short of: no, only expired, or yes but Running low. */
const isShort = (answer: VoiceAnswer) =>
  answer.kind === 'no' ||
  answer.kind === 'onlyExpired' ||
  (answer.kind === 'yes' && answer.runningLow);

/**
 * The answers worth adding to the Shopping List: the ones that are short and not on it already.
 * `no` and `onlyExpired` answers say whether they are; a Running low `yes` does not, so `onList`
 * (the Ingredients on the Shopping List, any line) decides for it. An answer with no Match (an
 * Unmatched name) has no Ingredient to look up and is added by its name; `notSure` is never short.
 */
function answersToAdd(
  answers: VoiceAnswer[],
  onList: ReadonlySet<string>,
  added: ReadonlySet<string> = new Set(),
): VoiceAnswer[] {
  return answers.filter(
    (answer) =>
      isShort(answer) &&
      !added.has(answer.id) &&
      (!answer.ingredient || !onList.has(answer.ingredient.id)) &&
      (answer.kind === 'yes' ||
        ('onShoppingList' in answer && !answer.onShoppingList)),
  );
}

/** The `shopping.add` Voice Action for one answer, as the existing apply takes it. */
const addAction = (answer: VoiceAnswer): VoiceReviewAction => ({
  id: `add-${answer.id}`,
  status: 'ready',
  target: 'shopping',
  op: 'add',
  text: answer.text,
  ingredient: answer.ingredient,
  name: answer.ingredient ? null : answer.name,
  quantity: null,
  unit: null,
  scope: null,
  expiresOn: null,
  noExpiry: false,
  location: null,
  rows: {},
  defaults: {},
});

/**
 * "Add N to shopping list": one button for the answer sheet and the answer card in Review. It sends
 * `shopping.add` Voice Actions through the usual apply and tells the Member with the usual toast, with
 * no Undo. It touches nothing else of the Voice Note, so Review keeps its own actions. Hidden when
 * there is nothing to add.
 */
export function AddToShoppingListButton({
  answers,
  onAdded,
}: {
  answers: VoiceAnswer[];
  /** Called once the add landed, e.g. to move focus off the button as it goes away. */
  onAdded?: () => void;
}) {
  const { t, i18n } = useTranslation('voice');
  const { defaultTarget } = useVoiceNoteState();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useShoppingList();
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());

  const onList = new Set(
    (list.data?.groups ?? []).flatMap((group) =>
      group.items.flatMap((item) =>
        item.ingredientId ? [item.ingredientId] : [],
      ),
    ),
  );
  const wanted = answersToAdd(answers, onList, added);

  const add = useMutation({
    mutationFn: (batch: VoiceAnswer[]) =>
      applyVoiceActions(batch.map(addAction)),
    onSuccess: async (result: VoiceApplyResult, batch) => {
      const { message, detail } = applyToast(
        result,
        batch.map(addAction),
        'shopping',
        t,
        i18n.language,
      );
      setAdded((current) => new Set([...current, ...batch.map((a) => a.id)]));
      toast.show(message, {
        ...voiceToast(),
        detail,
        duration: ADD_TOAST_MS,
      });
      onAdded?.();
      // The rows exist once the list is refetched; only then is there something to flash.
      await Promise.all(
        [shoppingListQueryKey, ...shoppingListChangeQueryKeys].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      if (defaultTarget === 'shopping') {
        flashRows(
          result.applied.flatMap(
            (entry) => entry.rowIds ?? (entry.rowId ? [entry.rowId] : []),
          ),
        );
      }
    },
  });

  // Until the list is known a Running low Ingredient may already be on it, so the count would be too high.
  if (!list.isSuccess || wanted.length === 0) return null;
  return (
    <Box sx={{ mt: '10px' }}>
      {add.isError ? <Alert>{translateApiError(t, add.error)}</Alert> : null}
      <Button
        fullWidth
        variant="secondary"
        disabled={add.isPending}
        onClick={() => add.mutate(wanted)}
        data-voice-add-to-list
      >
        {t('answers.addToList', { count: wanted.length })}
      </Button>
    </Box>
  );
}
