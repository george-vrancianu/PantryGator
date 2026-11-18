import { unitsMerge } from '../../recipes/matching/units';
import { ShoppingService } from '../../shopping/shopping.service';
import { amountOf, hasSubject, sameSubject, subjectOf } from '../voice-actions';
import {
  skippingKnownErrors,
  type VoiceActionHandler,
} from '../voice-handlers';

/**
 * Shopping add: merges by the Shopping List's usual add rules (same Ingredient
 * or Unmatched name, same or convertible unit (g/kg, ml/l), quantities summed). With `addSetsQuantity`
 * (Assistant Requests) the spoken quantity is set instead of summed and the line
 * unchecked; a bare add of a wanted line is left alone. An Unmatched name is added
 * and queued for curation by the Shopping List service.
 */
export function shoppingAddHandler(
  shopping: ShoppingService,
): VoiceActionHandler {
  return {
    async resolve(draft, ctx) {
      const same = sameSubject(draft);
      // The list reads oldest first within an Aisle (created, then id), and one
      // subject sits in one Aisle, so the first compatible line is the oldest,
      // the one mergeItem will merge into.
      const target = (await ctx.lists.shoppingItems()).find(
        (item) => same(item) && unitsMerge(item.unit, amountOf(draft).unit),
      );
      return {
        status: 'ready',
        rows: { shoppingItem: target ?? null },
        defaults: {},
      };
    },

    apply: (draft, ctx) =>
      skippingKnownErrors(async () => {
        if (!hasSubject(draft)) {
          return { applied: false, reason: 'voice.invalid_action' };
        }
        const { quantity, unit } = amountOf(draft);
        const setMode = ctx.addSetsQuantity === true;
        const { id, inserted, unchanged } = await shopping.addInTransaction(
          ctx.tx,
          ctx.memberId,
          {
            ...subjectOf(draft, 'name'),
            ...(quantity === null || unit === null ? {} : { quantity, unit }),
            // Queued for curation like any typed name.
            source: 'voice',
          },
          // The Unmatched name is written in the Catalog Language (the read
          // prompt asks for it), so that is the queue's source language.
          ctx.locale,
          setMode ? 'set' : 'sum',
        );
        return {
          applied: true,
          list: 'shopping',
          rowId: id,
          alreadyDone: unchanged,
          // Only reported in set mode, so Review's response is unchanged.
          ...(setMode && !inserted ? { merged: true } : {}),
        };
      }),
  };
}
