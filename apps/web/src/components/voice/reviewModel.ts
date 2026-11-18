import type { StorageLocation } from '@/lib/catalog';
import type {
  VoiceBatchRow,
  VoiceDefaultTarget,
  VoiceList,
  VoiceReviewAction,
} from '@/lib/voice';

/** The verb a Voice Action shows on its row; also the key of its `review.op.*` string. */
export type VoiceActionKind =
  | 'check'
  | 'addChecked'
  | 'add'
  | 'uncheck'
  | 'remove'
  | 'removeAll'
  | 'use'
  | 'setQuantity'
  | 'runningLow';

export const displayName = (action: VoiceReviewAction) =>
  action.ingredient?.name ?? action.name ?? action.text;

/** The Location a Pantry add will use: the spoken one, else the Catalog default. */
export const effectiveLocation = (
  action: VoiceReviewAction,
): StorageLocation | null =>
  action.location ?? action.defaults.location ?? null;

/** The expiry a Pantry add will use; null is "no expiry". */
export const effectiveExpiry = (action: VoiceReviewAction): string | null =>
  action.noExpiry
    ? null
    : (action.expiresOn ?? action.defaults.expiresOn ?? null);

/** Soonest first, undated last. */
export function soonestFirst(batches: VoiceBatchRow[]): VoiceBatchRow[] {
  return [...batches].sort((a, b) => {
    if (a.expiresOn === b.expiresOn) return 0;
    if (a.expiresOn === null) return 1;
    if (b.expiresOn === null) return -1;
    return a.expiresOn < b.expiresOn ? -1 : 1;
  });
}

export function kindOf(action: VoiceReviewAction): VoiceActionKind {
  if (action.status === 'needsList') {
    return action.op === 'remove' ? 'remove' : 'add';
  }
  if (action.target === 'shopping') {
    switch (action.op) {
      case 'check':
        return action.rows.shoppingItem ? 'check' : 'addChecked';
      case 'uncheck':
      case 'remove':
      case 'setQuantity':
        return action.op;
      default:
        return 'add';
    }
  }
  if (action.op === 'runningLow') {
    return action.rows.shoppingFallback ? 'add' : 'runningLow';
  }
  if (action.op === 'remove') {
    if (action.status === 'needsBatch') return 'use';
    if (action.scope === 'all') return 'removeAll';
    return (action.rows.batches?.length ?? 0) > 1 ? 'use' : 'remove';
  }
  return 'add';
}

/** Not an add or Running low into Pantry: tied to the Batches of its Match, so the Ingredient can't change. */
export const canChangeIngredient = (action: VoiceReviewAction) =>
  action.target === 'shopping' || action.op === 'add';

/** Ops that carry an amount the Member can edit. */
export const hasAmount = (action: VoiceReviewAction) => {
  if (action.status === 'needsBatch') return false;
  if (action.target === 'shopping') {
    return (
      action.op === 'add' ||
      action.op === 'check' ||
      action.op === 'setQuantity'
    );
  }
  return action.op === 'add';
};

/** The Voice Actions Apply would send: understood, and (for a removal that needed one) with a Batch picked. */
export const isActionable = (action: VoiceReviewAction) =>
  action.status === 'ready' ||
  (action.status === 'needsBatch' && !!action.batchId);

/** An add or remove still waiting for the Member to pick the Shopping List or the Pantry. */
export const needsList = (action: VoiceReviewAction) =>
  action.status === 'needsList';

export const isChange = (action: VoiceReviewAction) =>
  action.status === 'ready' || action.status === 'needsBatch';

/** What holds Apply back for this action, if anything. */
export function blockOf(
  action: VoiceReviewAction,
): 'list' | 'batch' | 'place' | null {
  if (action.status === 'needsList') return 'list';
  if (action.status === 'needsBatch' && !action.batchId) return 'batch';
  if (
    action.status === 'ready' &&
    action.target === 'pantry' &&
    action.op === 'add' &&
    effectiveLocation(action) === null
  ) {
    return 'place';
  }
  return null;
}

export type ReviewGroup = {
  list: VoiceList;
  /** The list the Member named in the sentence rather than the page they were on. */
  named: boolean;
  actions: VoiceReviewAction[];
};

/** The list that leads a Review and its toast: the page's own, or the Shopping List off the lists (`none`). */
export const leadingList = (defaultTarget: VoiceDefaultTarget): VoiceList =>
  defaultTarget === 'none' ? 'shopping' : defaultTarget;

/**
 * One group per list that has changes: the page's own list first, then the other. Off the lists (`none`) the
 * Shopping List comes first and nothing counts as named, since the page had no list to differ from.
 */
export function groupsOf(
  actions: VoiceReviewAction[],
  defaultTarget: VoiceDefaultTarget,
): ReviewGroup[] {
  const order: VoiceList[] =
    leadingList(defaultTarget) === 'pantry'
      ? ['pantry', 'shopping']
      : ['shopping', 'pantry'];
  return order.flatMap((list) => {
    const rows = actions.filter((a) => isChange(a) && a.target === list);
    return rows.length === 0
      ? []
      : [
          {
            list,
            named: defaultTarget !== 'none' && list !== defaultTarget,
            actions: rows,
          },
        ];
  });
}
