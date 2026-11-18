import { and, eq, inArray, sql } from 'drizzle-orm';
import { remapDraftIngredients } from '../recipe-drafts/remap-draft-ingredients';
import { sharedTranslation } from './catalog-scope';
import type { Tx } from '../database/database.types';
import {
  batches,
  catalogTranslations,
  ingredients,
  ingredientStockHistory,
  knownBarcodes,
  recipeIngredientLines,
  recipePairings,
  runningLow,
  shoppingItems,
  shoppingTemplateLines,
  staples,
  suggestionDismissals,
} from '../database/schema';

const uuids = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

export type MergedIngredient = {
  id: string;
  name: string;
  nameLocale: string | null;
  ownerFamilyId: string | null;
};

/**
 * Folds the `sourceIds` Ingredients into `target` and deletes them: every
 * reference (Known Barcodes and Recipe Drafts included) is re-pointed, and rows a Family would
 * then hold twice (Staples, Running low, dismissals, stock history) are
 * de-duplicated. Batches also take the target's Leaf Category.
 *
 * The caller holds the name lock and the owning Families' locks (family-locks.ts)
 * and clears or checks ownership itself. Returns the merged rows as they were,
 * so a caller can keep their names as Synonyms (ADR 0011).
 */
export async function mergeIngredients(
  tx: Tx,
  target: { id: string; leafCategoryId: string },
  sourceIds: string[],
): Promise<MergedIngredient[]> {
  if (sourceIds.length === 0) return [];
  const merged = await tx
    .select({
      id: ingredients.id,
      name: ingredients.name,
      nameLocale: ingredients.nameLocale,
      ownerFamilyId: ingredients.ownerFamilyId,
    })
    .from(ingredients)
    .where(inArray(ingredients.id, sourceIds));

  await tx
    .update(batches)
    .set({ ingredientId: target.id, leafCategoryId: target.leafCategoryId })
    .where(inArray(batches.ingredientId, sourceIds));
  await tx
    .update(shoppingItems)
    .set({ ingredientId: target.id })
    .where(inArray(shoppingItems.ingredientId, sourceIds));
  await tx
    .update(shoppingTemplateLines)
    .set({ ingredientId: target.id })
    .where(inArray(shoppingTemplateLines.ingredientId, sourceIds));
  await tx
    .update(recipeIngredientLines)
    .set({ ingredientId: target.id })
    .where(inArray(recipeIngredientLines.ingredientId, sourceIds));
  await tx
    .update(recipePairings)
    .set({ linkedIngredientId: target.id })
    .where(inArray(recipePairings.linkedIngredientId, sourceIds));
  // Recipe Drafts keep Ingredients inside their JSON content.
  await remapDraftIngredients(tx, target.id, sourceIds);

  // Known Barcodes are unique per (Family, barcode), so re-pointing never collides.
  await tx
    .update(knownBarcodes)
    .set({ ingredientId: target.id })
    .where(inArray(knownBarcodes.ingredientId, sourceIds));

  // Staples: the target's own row wins; among sources of one Family keep one.
  await tx
    .delete(staples)
    .where(
      and(
        inArray(staples.ingredientId, sourceIds),
        sql`EXISTS (SELECT 1 FROM ${staples} t WHERE t.family_id = ${staples.familyId} AND t.ingredient_id = ${target.id})`,
      ),
    );
  await tx
    .delete(staples)
    .where(
      and(
        inArray(staples.ingredientId, sourceIds),
        sql`EXISTS (SELECT 1 FROM ${staples} t WHERE t.family_id = ${staples.familyId} AND t.ingredient_id IN (${uuids(sourceIds)}) AND t.id < ${staples.id})`,
      ),
    );
  await tx
    .update(staples)
    .set({ ingredientId: target.id })
    .where(inArray(staples.ingredientId, sourceIds));

  // Flags keyed by (Family, Ingredient): one row per Family on the target.
  for (const table of [runningLow, suggestionDismissals]) {
    await tx.execute(sql`
      INSERT INTO ${table} (family_id, ingredient_id)
      SELECT DISTINCT family_id, ${target.id}::uuid FROM ${table}
      WHERE ingredient_id IN (${uuids(sourceIds)})
      ON CONFLICT DO NOTHING`);
    await tx.delete(table).where(inArray(table.ingredientId, sourceIds));
  }

  // Stock history: the most recent stocking wins, with its used-up state.
  await tx.execute(sql`
    INSERT INTO ${ingredientStockHistory} (family_id, ingredient_id, last_stocked_at, used_up_at)
    SELECT DISTINCT ON (family_id) family_id, ${target.id}::uuid, last_stocked_at, used_up_at
    FROM ${ingredientStockHistory}
    WHERE ingredient_id IN (${uuids([target.id, ...sourceIds])})
    ORDER BY family_id, last_stocked_at DESC
    ON CONFLICT (family_id, ingredient_id) DO UPDATE
      SET last_stocked_at = EXCLUDED.last_stocked_at, used_up_at = EXCLUDED.used_up_at`);
  await tx
    .delete(ingredientStockHistory)
    .where(inArray(ingredientStockHistory.ingredientId, sourceIds));

  // Shared translations go with the sources. A Family's Synonyms on a source
  // move to the target (the Family's choice survives a promote), once per
  // Family and name.
  await tx
    .delete(catalogTranslations)
    .where(
      and(
        eq(catalogTranslations.entityType, 'ingredient'),
        inArray(catalogTranslations.entityId, sourceIds),
        sharedTranslation,
      ),
    );
  await tx.execute(sql`
    DELETE FROM ${catalogTranslations} s
    WHERE s.entity_type = 'ingredient' AND s.entity_id IN (${uuids(sourceIds)})
      AND s.owner_family_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM ${catalogTranslations} t
        WHERE t.entity_type = 'ingredient' AND t.kind = 'synonym'
          AND t.owner_family_id = s.owner_family_id
          AND t.normalized_value = s.normalized_value
          AND (t.entity_id = ${target.id}::uuid
            OR (t.entity_id IN (${uuids(sourceIds)}) AND t.id < s.id)))`);
  await tx
    .update(catalogTranslations)
    .set({ entityId: target.id })
    .where(
      and(
        eq(catalogTranslations.entityType, 'ingredient'),
        inArray(catalogTranslations.entityId, sourceIds),
      ),
    );
  await tx.delete(ingredients).where(inArray(ingredients.id, sourceIds));
  return merged;
}
