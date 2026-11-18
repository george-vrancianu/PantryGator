import { PantryService } from '../../pantry/pantry.service';
import { amountOf, hasSubject, subjectOf } from '../voice-actions';
import {
  skippingKnownErrors,
  type VoiceActionHandler,
} from '../voice-handlers';

/**
 * Pantry add: a Batch like a manual add. Resolve shows the Location and
 * expiry an unspoken value would take (Catalog default, Default Expiry), so
 * Review can show and edit them; Apply sends what Review settled on, and
 * anything still blank falls back the same way.
 */
export function pantryAddHandler(pantry: PantryService): VoiceActionHandler {
  return {
    async resolve(draft, ctx) {
      if (!hasSubject(draft)) {
        return { status: 'notFound', rows: {}, defaults: {} };
      }
      const defaults = await pantry.addDefaults(
        ctx.memberId,
        subjectOf(draft, 'rawName'),
        ctx.today,
      );
      return {
        status: 'ready',
        rows: {},
        defaults: {
          ...(defaults.location ? { location: defaults.location } : {}),
          ...(defaults.expiryDate ? { expiresOn: defaults.expiryDate } : {}),
        },
      };
    },

    apply: (draft, ctx) =>
      skippingKnownErrors(async () => {
        if (!hasSubject(draft)) {
          return { applied: false, reason: 'voice.invalid_action' };
        }
        const { quantity, unit } = amountOf(draft);
        const [batch] = await pantry.addInTransaction(
          ctx.tx,
          ctx.memberId,
          [
            {
              ...subjectOf(draft, 'rawName'),
              ...(quantity === null || unit === null ? {} : { quantity, unit }),
              ...(draft.location ? { location: draft.location } : {}),
              // null is "no expiry"; leaving it out is the Default Expiry.
              ...(draft.noExpiry
                ? { expiryDate: null }
                : draft.expiresOn
                  ? { expiryDate: draft.expiresOn }
                  : {}),
              source: 'voice',
            },
          ],
          ctx.locale,
          // The Unmatched name is written in the Catalog Language (the read
          // prompt asks for it), so that is the queue's source language too.
          ctx.locale,
          ctx.today,
        );
        return {
          applied: true,
          list: 'pantry',
          ...(batch ? { rowId: batch.id } : {}),
          alreadyDone: false,
        };
      }),
  };
}
