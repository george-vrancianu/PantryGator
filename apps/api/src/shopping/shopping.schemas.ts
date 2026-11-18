import { z } from 'zod';
import { ingredientUnit } from '../database/schema';
import { SHOPPING_ITEM_SOURCES } from '../unmatched/unmatched-entries';
import { MAX_QUANTITY } from '../common/quantity';

export type ShoppingUnit = (typeof ingredientUnit.enumValues)[number];

/** `today` is the Member's local date (YYYY-MM-DD) a Batch is expired before; defaults to the server's UTC date. */
export const shoppingTodayQuery = z.object({
  today: z.iso.date().optional(),
});
export type ShoppingTodayQuery = z.infer<typeof shoppingTodayQuery>;

/** Either a Catalog Match (`ingredientId`) or a typed `name` for an Unmatched item. */
export const addShoppingItemBody = z
  .object({
    ingredientId: z.uuid().optional(),
    name: z.string().trim().min(1).max(100).optional(),
    quantity: z.number().positive().max(MAX_QUANTITY).optional(),
    unit: z.enum(ingredientUnit.enumValues).optional(),
    /** Unmatched names only: where the name came from; defaults to manual. */
    source: z.enum(SHOPPING_ITEM_SOURCES).optional(),
  })
  .refine(
    (body) => (body.ingredientId === undefined) !== (body.name === undefined),
    { message: 'Provide either ingredientId or name', path: ['ingredientId'] },
  );
export type AddShoppingItemBody = z.infer<typeof addShoppingItemBody>;

/** Several items are added in one go (applying a Shopping Template); all are added or none. */
export const MAX_BULK_SHOPPING_ITEMS = 100;
export const addShoppingItemsBody = z.object({
  items: z.array(addShoppingItemBody).min(1).max(MAX_BULK_SHOPPING_ITEMS),
});
export type AddShoppingItemsBody = z.infer<typeof addShoppingItemsBody>;

/**
 * Undo of an add removes what the add created in one call, so the cap must cover the largest
 * Add missing: a 7-day plan x 3 mealtimes x 100 Recipe lines (every line a distinct missing
 * Ingredient) is 2100 rows.
 */
export const MAX_BULK_DELETE_SHOPPING_ITEMS = 2100;
export const removeShoppingItemsBody = z.object({
  ids: z.array(z.uuid()).min(1).max(MAX_BULK_DELETE_SHOPPING_ITEMS),
});
export type RemoveShoppingItemsBody = z.infer<typeof removeShoppingItemsBody>;

export const setCheckedBody = z.object({ checked: z.boolean() });
export type SetCheckedBody = z.infer<typeof setCheckedBody>;

/** Replaces a Shopping Item's amount; validation matches adding. Omitted fields are cleared. */
export const setAmountBody = z.object({
  quantity: z.number().positive().max(MAX_QUANTITY).optional(),
  unit: z.enum(ingredientUnit.enumValues).optional(),
});
export type SetAmountBody = z.infer<typeof setAmountBody>;

export const itemIdParam = z.object({ id: z.uuid() });

export type ShoppingItemView = {
  id: string;
  /** The Catalog Ingredient, or null for an Unmatched item. */
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: ShoppingUnit | null;
  checked: boolean;
  /** True when the name never matched a Catalog Ingredient. */
  unmatched: boolean;
};

export type ShoppingGroupView = {
  /** Null for the trailing group of Unmatched Shopping Items. */
  aisle: { id: string; name: string; sortOrder: number } | null;
  items: ShoppingItemView[];
};

export type ShoppingListView = {
  id: string;
  groups: ShoppingGroupView[];
  summary: { remaining: number; checked: number };
};

/**
 * What a bulk add answers: the list, the ids of the Shopping Items created or merged into (request order),
 * and `insertedIds`, only those the add newly inserted: the ones Undo may delete.
 */
export type AddedShoppingItemsView = ShoppingListView & {
  createdIds: string[];
  insertedIds: string[];
};
