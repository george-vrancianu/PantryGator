import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { catalogScope, type CatalogScope } from '../catalog/catalog-scope';
import type { CatalogLocale } from '../catalog/catalog.schemas';
import { loadDisplayNames } from '../catalog/display-names';
import { normalizeName } from '../catalog/normalize';
import { ApiException } from '../common/api-exception';
import { exceedsMaxQuantity } from '../common/quantity';
import {
  quantityInUnit,
  roundQuantity,
  unitsMerge,
} from '../recipes/matching/units';
import { DATABASE } from '../database/database.constants';
import type { Database, Executor, Tx } from '../database/database.types';
import {
  aisles,
  leafCategories,
  parentCategories,
  shoppingItems,
  shoppingItemSourceRecipes,
  shoppingLists,
  user,
} from '../database/schema';
import {
  recordUnmatched,
  type UnmatchedSource,
} from '../unmatched/unmatched-entries';
import type {
  AddShoppingItemBody,
  SetAmountBody,
  ShoppingGroupView,
  ShoppingItemView,
  ShoppingListView,
  AddedShoppingItemsView,
} from './shopping.schemas';

/**
 * Merge rule: lines for the same Ingredient (or the same Unmatched name) with
 * the same unit, or units of one dimension (g/kg, ml/l), collapse into one and
 * their quantities add up; the added amount is converted to the existing
 * line's unit first. Units of different dimensions (pcs, g, ml) and a missing
 * unit stay on separate lines. A missing quantity adds nothing. Callers
 * enforce the quantity cap on the result.
 */
export function sumQuantities(
  existing: number | null,
  added: number | null,
): number | null {
  if (existing === null) return added;
  if (added === null) return existing;
  return roundQuantity(existing + added);
}

/** An item to merge; the server may claim any Unmatched source, a client only `SHOPPING_ITEM_SOURCES`. */
export type MergeItemInput = Omit<AddShoppingItemBody, 'source'> & {
  source?: UnmatchedSource;
};

/** An item to add together with the Recipes it is needed for. */
export type ItemWithSourceRecipes = {
  item: MergeItemInput;
  recipeIds: string[];
};

/**
 * How an add treats the amount of a line it merges into: `sum` adds to it (the
 * usual rule); `set` makes the spoken quantity the amount and leaves a bare add
 * of a line that is still wanted alone (an Assistant Request, ADR 0017).
 */
export type AddAmountMode = 'sum' | 'set';

type MergeResult = { id: string; inserted: boolean; unchanged: boolean };

const itemNotFound = () => new ApiException(404, 'shopping.item_not_found');

@Injectable()
export class ShoppingService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async getList(
    memberId: string,
    locale: CatalogLocale,
  ): Promise<ShoppingListView> {
    const { listId, scope } = await this.activeList(this.database, memberId);
    return this.view(this.database, listId, scope, locale);
  }

  /** The Family's active list for reading only: nothing is created, `null` when there is none yet. */
  async peekList(
    memberId: string,
    locale: CatalogLocale,
  ): Promise<ShoppingListView | null> {
    const [row] = await this.database
      .select({ listId: shoppingLists.id, familyId: user.familyId })
      .from(user)
      .innerJoin(
        shoppingLists,
        and(
          eq(shoppingLists.familyId, user.familyId),
          eq(shoppingLists.status, 'active'),
        ),
      )
      .where(eq(user.id, memberId))
      .limit(1);
    if (!row) return null;
    return this.view(
      this.database,
      row.listId,
      catalogScope(row.familyId),
      locale,
    );
  }

  async addItem(
    memberId: string,
    body: AddShoppingItemBody,
    locale: CatalogLocale,
  ): Promise<ShoppingListView> {
    const { groups, id, summary } = await this.addItems(
      memberId,
      [body],
      locale,
    );
    // Only the bulk endpoint answers with the ids.
    return { id, groups, summary };
  }

  /**
   * Adds every item with the merge rules, in one transaction: all of them or none.
   * `createdIds` are the Shopping Items created or merged into, one per body in request order.
   * `insertedIds` are only the Shopping Items this call newly inserted (not merged into), in request order;
   * Undo deletes these, never `createdIds`, which includes lines that existed before.
   */
  async addItems(
    memberId: string,
    bodies: AddShoppingItemBody[],
    locale: CatalogLocale,
  ): Promise<AddedShoppingItemsView> {
    return this.database.transaction(async (tx) => {
      // Serialises with concurrent adds (merges never duplicate a line) and with Finish.
      const { listId, scope } = await this.lockActiveList(tx, memberId);
      const createdIds: string[] = [];
      const insertedIds: string[] = [];
      for (const body of bodies) {
        const { id, inserted } = await this.mergeItem(
          tx,
          listId,
          scope,
          body,
          locale,
        );
        createdIds.push(id);
        if (inserted) insertedIds.push(id);
      }
      return {
        ...(await this.view(tx, listId, scope, locale)),
        createdIds,
        insertedIds,
      };
    });
  }

  /**
   * Adds Shopping Items for Recipes, merging as for any add, and records each
   * item's own Source Recipes on the item it ended up on, whether merged into
   * or newly inserted. All in one transaction under the list lock.
   * `insertedIds` are the Shopping Items newly inserted (not merged into), deduplicated, in request order.
   */
  async addItemsWithSourceRecipes(
    memberId: string,
    entries: ItemWithSourceRecipes[],
    locale: CatalogLocale,
  ): Promise<{ list: ShoppingListView; insertedIds: string[] }> {
    return this.database.transaction(async (tx) => {
      const { listId, scope } = await this.lockActiveList(tx, memberId);
      const insertedIds: string[] = [];
      for (const { item, recipeIds } of entries) {
        const { id, inserted } = await this.mergeItem(
          tx,
          listId,
          scope,
          item,
          locale,
        );
        if (inserted) insertedIds.push(id);
        if (recipeIds.length > 0)
          await tx
            .insert(shoppingItemSourceRecipes)
            .values(
              recipeIds.map((recipeId) => ({ shoppingItemId: id, recipeId })),
            )
            .onConflictDoNothing();
      }
      return { list: await this.view(tx, listId, scope, locale), insertedIds };
    });
  }

  /**
   * Adds one item with the merge rules inside the caller's transaction, under the
   * active-list lock. For callers (Voice Notes) that write several things atomically.
   */
  async addInTransaction(
    tx: Tx,
    memberId: string,
    body: MergeItemInput,
    locale: CatalogLocale,
    amount: AddAmountMode = 'sum',
  ): Promise<MergeResult> {
    const { listId, scope } = await this.lockActiveList(tx, memberId);
    return this.mergeItem(tx, listId, scope, body, locale, amount);
  }

  /**
   * Merges or inserts the item; answers with the Shopping Item it ended up on,
   * whether that row is new, and whether a merge left the line as it was.
   */
  private async mergeItem(
    tx: Tx,
    listId: string,
    scope: CatalogScope,
    body: MergeItemInput,
    locale: CatalogLocale,
    amount: AddAmountMode = 'sum',
  ): Promise<MergeResult> {
    const unit = body.unit ?? null;
    const quantity = body.quantity ?? null;
    let identity;
    let insertValues:
      { ingredientId: string } | { name: string; normalizedName: string };
    if (body.ingredientId !== undefined) {
      const ingredients = scope.ingredients(tx);
      const [found] = await tx
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(eq(ingredients.id, body.ingredientId));
      if (!found) {
        throw new ApiException(404, 'shopping.ingredient_not_found');
      }
      identity = eq(shoppingItems.ingredientId, found.id);
      insertValues = { ingredientId: found.id };
    } else {
      const name = (body.name ?? '').trim();
      const normalizedName = normalizeName(name);
      if (!normalizedName) throw new ApiException(400, 'validation_failed');
      identity = and(
        isNull(shoppingItems.ingredientId),
        eq(shoppingItems.normalizedName, normalizedName),
      );
      insertValues = { name, normalizedName };
    }

    const candidates = await tx
      .select({
        id: shoppingItems.id,
        quantity: shoppingItems.quantity,
        unit: shoppingItems.unit,
        checked: shoppingItems.checked,
      })
      .from(shoppingItems)
      .where(and(eq(shoppingItems.listId, listId), identity))
      // The merge target is the oldest line of this identity with a compatible unit (the same, or g/kg, ml/l); setAmount can leave several.
      .orderBy(asc(shoppingItems.createdAt), asc(shoppingItems.id));
    // 'sum' adds the amount to the oldest compatible line. 'set' with a quantity
    // replaces that line's amount instead. 'set' with no quantity names the item,
    // not an amount: a line of any unit that is still wanted is left alone, else
    // the oldest line (of any unit) is put back on the list.
    const bare = amount === 'set' && quantity === null;
    const wanted = bare ? candidates.find((row) => !row.checked) : undefined;
    if (wanted) return { id: wanted.id, inserted: false, unchanged: true };
    const existing =
      candidates.find((row) => unitsMerge(row.unit, unit)) ??
      (bare ? candidates[0] : undefined);

    if (existing) {
      // The added amount is expressed in the existing line's unit (500 g + 1 kg = 1500 g).
      const addedQuantity = quantityInUnit(quantity, unit, existing.unit);
      const merged =
        amount === 'set' && quantity !== null
          ? addedQuantity
          : sumQuantities(
              existing.quantity === null ? null : Number(existing.quantity),
              addedQuantity,
            );
      if (exceedsMaxQuantity(merged)) {
        throw new ApiException(400, 'shopping.quantity_too_large');
      }
      // Adding something already bought means it is wanted again.
      await tx
        .update(shoppingItems)
        .set({
          quantity: merged === null ? null : String(merged),
          checked: false,
        })
        .where(eq(shoppingItems.id, existing.id));
      return { id: existing.id, inserted: false, unchanged: false };
    }

    const [inserted] = await tx
      .insert(shoppingItems)
      .values({
        listId,
        ...insertValues,
        quantity: quantity === null ? null : String(quantity),
        unit,
      })
      .returning({ id: shoppingItems.id });
    // Only newly inserted Unmatched names are queued; merges add no entry.
    if ('name' in insertValues) {
      await recordUnmatched(tx, [
        {
          rawName: insertValues.name,
          locale,
          source: body.source ?? 'manual',
          shoppingItemId: inserted.id,
        },
      ]);
    }
    return { id: inserted.id, inserted: true, unchanged: false };
  }

  /** Ids of unchecked Shopping Items on the Family's active list for any of these Ingredients. */
  async uncheckedItemIdsFor(
    memberId: string,
    ingredientIds: string[],
  ): Promise<string[]> {
    if (ingredientIds.length === 0) return [];
    const { listId } = await this.activeList(this.database, memberId);
    const rows = await this.database
      .select({ id: shoppingItems.id })
      .from(shoppingItems)
      .where(
        and(
          eq(shoppingItems.listId, listId),
          eq(shoppingItems.checked, false),
          inArray(shoppingItems.ingredientId, ingredientIds),
        ),
      )
      .orderBy(asc(shoppingItems.createdAt), asc(shoppingItems.id));
    return rows.map((row) => row.id);
  }

  async setChecked(
    memberId: string,
    itemId: string,
    checked: boolean,
    locale: CatalogLocale,
  ): Promise<ShoppingListView> {
    return this.database.transaction(async (tx) => {
      const { listId, scope } = await this.lockActiveList(tx, memberId);
      await this.checkRow(tx, listId, itemId, checked);
      return this.view(tx, listId, scope, locale);
    });
  }

  /**
   * Replaces the item's quantity and unit (omitted means none); other fields are untouched.
   *
   * A line is deliberately not merged into a sibling with the same Ingredient (or Unmatched name) and the
   * new unit: that is a known exception to the merge rule above, which only applies when adding. Adding
   * afterwards merges into the oldest of the duplicates.
   */
  async setAmount(
    memberId: string,
    itemId: string,
    body: SetAmountBody,
    locale: CatalogLocale,
  ): Promise<ShoppingListView> {
    return this.database.transaction(async (tx) => {
      const { listId, scope } = await this.lockActiveList(tx, memberId);
      await this.amountRow(tx, listId, itemId, body);
      return this.view(tx, listId, scope, locale);
    });
  }

  async removeItem(
    memberId: string,
    itemId: string,
    locale: CatalogLocale,
  ): Promise<ShoppingListView> {
    return this.database.transaction(async (tx) => {
      const { listId, scope } = await this.lockActiveList(tx, memberId);
      await this.removeRow(tx, listId, itemId);
      return this.view(tx, listId, scope, locale);
    });
  }

  /**
   * Removes the given items from the Family's active list in one transaction.
   * Ids already gone, or on another Family's list, are ignored so Undo is safe to repeat.
   */
  async removeMany(
    memberId: string,
    itemIds: string[],
    locale: CatalogLocale,
  ): Promise<ShoppingListView> {
    return this.database.transaction(async (tx) => {
      const { listId, scope } = await this.lockActiveList(tx, memberId);
      await tx
        .delete(shoppingItems)
        .where(
          and(
            inArray(shoppingItems.id, itemIds),
            eq(shoppingItems.listId, listId),
          ),
        );
      return this.view(tx, listId, scope, locale);
    });
  }

  /**
   * The active list's items (oldest first) under the list lock, for callers
   * (Voice Notes) that must find the row to act on inside their own transaction.
   */
  async itemsInTransaction(tx: Tx, memberId: string) {
    const { listId } = await this.lockActiveList(tx, memberId);
    return tx
      .select({
        id: shoppingItems.id,
        ingredientId: shoppingItems.ingredientId,
        normalizedName: shoppingItems.normalizedName,
        quantity: shoppingItems.quantity,
        unit: shoppingItems.unit,
        checked: shoppingItems.checked,
      })
      .from(shoppingItems)
      .where(eq(shoppingItems.listId, listId))
      .orderBy(asc(shoppingItems.createdAt), asc(shoppingItems.id));
  }

  /** `setChecked` inside the caller's transaction; throws `shopping.item_not_found`. */
  async setCheckedInTransaction(
    tx: Tx,
    memberId: string,
    itemId: string,
    checked: boolean,
  ): Promise<void> {
    const { listId } = await this.lockActiveList(tx, memberId);
    await this.checkRow(tx, listId, itemId, checked);
  }

  /** `setAmount` inside the caller's transaction; throws `shopping.item_not_found`. */
  async setAmountInTransaction(
    tx: Tx,
    memberId: string,
    itemId: string,
    body: SetAmountBody,
  ): Promise<void> {
    const { listId } = await this.lockActiveList(tx, memberId);
    await this.amountRow(tx, listId, itemId, body);
  }

  /** `removeItem` inside the caller's transaction; throws `shopping.item_not_found`. */
  async removeInTransaction(
    tx: Tx,
    memberId: string,
    itemId: string,
  ): Promise<void> {
    const { listId } = await this.lockActiveList(tx, memberId);
    await this.removeRow(tx, listId, itemId);
  }

  private async checkRow(
    tx: Tx,
    listId: string,
    itemId: string,
    checked: boolean,
  ) {
    const updated = await tx
      .update(shoppingItems)
      .set({ checked })
      .where(
        and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId)),
      )
      .returning({ id: shoppingItems.id });
    if (updated.length === 0) throw itemNotFound();
  }

  private async amountRow(
    tx: Tx,
    listId: string,
    itemId: string,
    body: SetAmountBody,
  ) {
    const updated = await tx
      .update(shoppingItems)
      .set({
        quantity: body.quantity === undefined ? null : String(body.quantity),
        unit: body.unit ?? null,
      })
      .where(
        and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId)),
      )
      .returning({ id: shoppingItems.id });
    if (updated.length === 0) throw itemNotFound();
  }

  private async removeRow(tx: Tx, listId: string, itemId: string) {
    const removed = await tx
      .delete(shoppingItems)
      .where(
        and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId)),
      )
      .returning({ id: shoppingItems.id });
    if (removed.length === 0) throw itemNotFound();
  }

  /**
   * The Family's active list, row-locked until the transaction ends, so every
   * mutation serialises with Finish Shopping. If a Finish commits while we
   * wait, Postgres rechecks the predicate and the archived row drops out (no
   * row); a fresh statement then sees the new active list.
   */
  private async lockActiveList(
    tx: Tx,
    memberId: string,
  ): Promise<{ listId: string; scope: CatalogScope }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { listId, scope } = await this.activeList(tx, memberId);
      const locked = await tx.execute<{ id: string }>(
        sql`SELECT ${shoppingLists.id} AS id FROM ${shoppingLists} WHERE ${shoppingLists.id} = ${listId} AND ${shoppingLists.status} = 'active' FOR UPDATE`,
      );
      if (locked.rows.length > 0) return { listId, scope };
    }
    throw new ApiException(409, 'shopping.list_changed');
  }

  /** The Family's active list, created on first use. */
  private async activeList(
    executor: Executor,
    memberId: string,
  ): Promise<{ listId: string; scope: CatalogScope }> {
    const [member] = await executor
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.id, memberId))
      .limit(1);
    if (!member) throw new ApiException(401, 'auth.unauthenticated');

    await executor
      .insert(shoppingLists)
      .values({ familyId: member.familyId })
      .onConflictDoNothing();
    const [list] = await executor
      .select({ id: shoppingLists.id })
      .from(shoppingLists)
      .where(
        and(
          eq(shoppingLists.familyId, member.familyId),
          eq(shoppingLists.status, 'active'),
        ),
      );
    return { listId: list.id, scope: catalogScope(member.familyId) };
  }

  private async view(
    executor: Executor,
    listId: string,
    scope: CatalogScope,
    locale: CatalogLocale,
  ): Promise<ShoppingListView> {
    const ingredients = scope.ingredients(executor);
    const rows = await executor
      .select({
        id: shoppingItems.id,
        ingredientId: shoppingItems.ingredientId,
        typedName: shoppingItems.name,
        canonicalName: ingredients.name,
        quantity: shoppingItems.quantity,
        unit: shoppingItems.unit,
        checked: shoppingItems.checked,
        aisleId: aisles.id,
        aisleName: aisles.name,
        aisleSortOrder: aisles.sortOrder,
      })
      .from(shoppingItems)
      .leftJoin(ingredients, eq(shoppingItems.ingredientId, ingredients.id))
      .leftJoin(
        leafCategories,
        eq(ingredients.leafCategoryId, leafCategories.id),
      )
      .leftJoin(
        parentCategories,
        eq(leafCategories.parentId, parentCategories.id),
      )
      .leftJoin(aisles, eq(parentCategories.aisleId, aisles.id))
      .where(eq(shoppingItems.listId, listId))
      .orderBy(asc(shoppingItems.createdAt), asc(shoppingItems.id));

    const { pick: display } = await loadDisplayNames(
      executor,
      scope,
      locale,
      rows
        .flatMap((row) => [row.ingredientId, row.aisleId])
        .filter((id) => id !== null),
    );

    const groups = new Map<string, ShoppingGroupView>();
    const unmatchedItems: ShoppingItemView[] = [];
    for (const row of rows) {
      const item: ShoppingItemView = {
        id: row.id,
        ingredientId: row.ingredientId,
        name:
          row.ingredientId !== null
            ? display(
                'ingredient',
                row.ingredientId,
                row.canonicalName ?? row.typedName ?? '',
              )
            : (row.typedName ?? ''),
        quantity: row.quantity === null ? null : Number(row.quantity),
        unit: row.unit,
        checked: row.checked,
        unmatched: row.ingredientId === null,
      };
      if (row.aisleId === null || row.aisleName === null) {
        unmatchedItems.push(item);
        continue;
      }
      const group = groups.get(row.aisleId) ?? {
        aisle: {
          id: row.aisleId,
          name: display('aisle', row.aisleId, row.aisleName),
          sortOrder: row.aisleSortOrder ?? 0,
        },
        items: [],
      };
      group.items.push(item);
      groups.set(row.aisleId, group);
    }

    const ordered = [...groups.values()].sort(
      (a, b) => (a.aisle?.sortOrder ?? 0) - (b.aisle?.sortOrder ?? 0),
    );
    if (unmatchedItems.length > 0) {
      ordered.push({ aisle: null, items: unmatchedItems });
    }
    const checked = rows.filter((row) => row.checked).length;
    return {
      id: listId,
      groups: ordered,
      summary: { remaining: rows.length - checked, checked },
    };
  }
}
