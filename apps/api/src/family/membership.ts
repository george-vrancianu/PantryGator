import { count, eq } from 'drizzle-orm';
import {
  batches,
  family,
  recipeDrafts,
  shoppingItems,
  shoppingLists,
  user,
} from '../database/schema';
import type { Tx } from '../database/database.types';
import { withFreshInviteCode } from './invite-code';

/**
 * Moves a Member into a brand-new Household of One as its Owner. Their Recipe
 * Drafts end with the move (ADR 0028): nothing from the old Family stays with
 * them. Runs inside
 * the caller's transaction so a Member is never without a Family. The insert
 * runs in a savepoint: a (vanishingly rare) Invite Code collision would
 * otherwise abort the whole transaction.
 */
export async function moveToNewHouseholdOfOne(
  tx: Tx,
  memberId: string,
): Promise<void> {
  const [created] = await withFreshInviteCode((code) =>
    tx.transaction((savepoint) =>
      savepoint.insert(family).values(code).returning({ id: family.id }),
    ),
  );
  await tx.delete(recipeDrafts).where(eq(recipeDrafts.memberId, memberId));
  await tx
    .update(user)
    .set({ familyId: created.id, familyRole: 'owner' })
    .where(eq(user.id, memberId));
}

export type FamilyDataCounts = {
  batches: number;
  shoppingItems: number;
  /** The Recipe Drafts of the Family's Members; they end with the Family (ADR 0028). */
  recipeDrafts: number;
};

/**
 * What a Family owns that is deleted along with it, as shown in the join
 * warning: Batches, Shopping Items across active and archived lists, and
 * Recipe Drafts.
 * Deleting the Family itself relies on every Family-owned table referencing
 * `family` with ON DELETE CASCADE (enforced by a test over information_schema).
 */
export async function countFamilyData(
  tx: Pick<Tx, 'select'>,
  familyId: string,
): Promise<FamilyDataCounts> {
  const [{ n: batchCount }] = await tx
    .select({ n: count() })
    .from(batches)
    .where(eq(batches.familyId, familyId));
  const [{ n: itemCount }] = await tx
    .select({ n: count() })
    .from(shoppingItems)
    .innerJoin(shoppingLists, eq(shoppingItems.listId, shoppingLists.id))
    .where(eq(shoppingLists.familyId, familyId));
  const [{ n: draftCount }] = await tx
    .select({ n: count() })
    .from(recipeDrafts)
    .where(eq(recipeDrafts.familyId, familyId));
  return {
    batches: batchCount,
    shoppingItems: itemCount,
    recipeDrafts: draftCount,
  };
}
