import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { rememberBarcodes } from '../barcode/known-barcodes';
import {
  type ExpiryOverride,
  resolveCatalogDefaults,
  resolveExpiryDays,
} from '../catalog/catalog-defaults';
import { catalogScope } from '../catalog/catalog-scope';
import type { CatalogLocale, ScanLanguage } from '../catalog/catalog.schemas';
import { loadIngredientPlacements } from '../catalog/ingredient-placement';
import { seedId } from '../catalog/seed/seed-catalog';
import { ApiException } from '../common/api-exception';
import { addDays } from '../common/dates';
import { DATABASE } from '../database/database.constants';
import type { Database, Executor, Tx } from '../database/database.types';
import { batches, leafCategories, parentCategories } from '../database/schema';
import { SettingsService } from '../settings/settings.service';
import {
  recordUnmatched,
  type UnmatchedSource,
} from '../unmatched/unmatched-entries';
import {
  clearRunningLowOnRestock,
  clearRunningLowWhenGone,
} from './running-low-flags';
import { recordRemoved, recordStocked } from './stock-history';
import type {
  BatchView,
  CreateBatchBody,
  UpdateBatchBody,
} from './pantry.schemas';

const TOP_LEVEL_OTHER_PARENT_ID = seedId.parent('other');

type BatchRow = typeof batches.$inferSelect;
type Leaf = typeof leafCategories.$inferSelect;
type Parent = typeof parentCategories.$inferSelect;
type Target = { ingredientId: string | null; leaf: Leaf; parent: Parent };

/** A Batch to add; the server may claim any Unmatched source, a client only `BATCH_SOURCES`. */
export type ServerBatchBody = Omit<CreateBatchBody, 'source'> & {
  source?: UnmatchedSource;
};

@Injectable()
export class PantryService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly settings: SettingsService,
  ) {}

  /** The Family's Batches, soonest expiry first; Batches without an expiry come last. */
  async list(memberId: string, locale: CatalogLocale): Promise<BatchView[]> {
    const familyId = await this.settings.familyIdOf(memberId);
    const rows = await this.database
      .select()
      .from(batches)
      .where(eq(batches.familyId, familyId))
      .orderBy(
        sql`${batches.expiryDate} ASC NULLS LAST`,
        asc(batches.createdAt),
        asc(batches.id),
      );
    return this.toViews(familyId, rows, locale);
  }

  async create(
    memberId: string,
    body: CreateBatchBody,
    locale: CatalogLocale,
    scanLanguage: ScanLanguage = locale,
  ): Promise<BatchView> {
    return (await this.createMany(memberId, [body], locale, scanLanguage))[0];
  }

  /** Adds all Batches in one statement, so a bad line saves nothing. Used by the Review screen. */
  async createMany(
    memberId: string,
    bodies: CreateBatchBody[],
    locale: CatalogLocale,
    scanLanguage: ScanLanguage = locale,
  ): Promise<BatchView[]> {
    const familyId = await this.settings.familyIdOf(memberId);
    const rows = await this.database.transaction((tx) =>
      this.insertFromBodies(
        tx,
        familyId,
        bodies,
        locale,
        scanLanguage,
        new Date().toISOString().slice(0, 10),
      ),
    );
    return this.toViews(familyId, rows, locale);
  }

  /**
   * Adds Batches in the caller's transaction, exactly as a manual add does
   * (defaults, Unmatched queue, Known Barcodes, stock history, Running low).
   * `today` is the date Default Expiry counts from.
   */
  async addInTransaction(
    tx: Tx,
    memberId: string,
    bodies: ServerBatchBody[],
    locale: CatalogLocale,
    scanLanguage: ScanLanguage = locale,
    today: string = new Date().toISOString().slice(0, 10),
  ): Promise<BatchRow[]> {
    const familyId = await this.settings.familyIdOf(memberId);
    return this.insertFromBodies(
      tx,
      familyId,
      bodies,
      locale,
      scanLanguage,
      today,
    );
  }

  private async insertFromBodies(
    tx: Tx,
    familyId: string,
    bodies: ServerBatchBody[],
    locale: CatalogLocale,
    scanLanguage: ScanLanguage,
    today: string,
  ): Promise<BatchRow[]> {
    const overrides = await this.settings.expiryOverridesOf(familyId);
    const targets = await this.targetsFor(familyId, bodies);
    const values = bodies.map((body, index) => ({
      id: randomUUID(),
      ...this.toRow(familyId, body, targets[index], overrides, today),
    }));
    const inserted = await this.insertBatches(tx, familyId, values);
    // The ids were generated above, so each entry is built from its own line.
    await recordUnmatched(
      tx,
      values.flatMap((value, index) =>
        value.unmatched
          ? [
              {
                rawName: value.rawName ?? '',
                // The raw name is in the Catalog Language; the printed text is in the Scan Language.
                locale,
                sourceText: bodies[index].sourceText,
                sourceLanguage: scanLanguage,
                source: bodies[index].source ?? 'manual',
                batchId: value.id,
              },
            ]
          : [],
      ),
    );
    await rememberBarcodes(
      tx,
      familyId,
      values.flatMap((value, index) => {
        const barcode = bodies[index].barcode;
        return barcode
          ? [
              {
                barcode,
                ingredientId: value.ingredientId ?? null,
                rawName: value.rawName ?? null,
                productDescription: value.productDescription ?? null,
              },
            ]
          : [];
      }),
    );
    return inserted;
  }

  private toRow(
    familyId: string,
    body: ServerBatchBody,
    target: Target,
    overrides: ExpiryOverride[],
    today: string,
  ): typeof batches.$inferInsert {
    const defaults = resolveCatalogDefaults(target.leaf, target.parent);
    const expiryDays = resolveExpiryDays(target.leaf, target.parent, overrides);
    const location = body.location ?? defaults.location;
    if (!location) throw new ApiException(400, 'pantry.location_required');
    const expiryDate =
      body.expiryDate !== undefined
        ? body.expiryDate
        : expiryDays === null
          ? null
          : addDays(today, expiryDays);

    return {
      familyId,
      ingredientId: target.ingredientId,
      leafCategoryId: target.leaf.id,
      unmatched: body.rawName !== undefined,
      rawName: body.rawName ?? null,
      quantity: body.quantity ?? null,
      unit: body.unit ?? null,
      location,
      expiryDate,
      productDescription: body.productDescription || null,
    };
  }

  async update(
    memberId: string,
    batchId: string,
    body: UpdateBatchBody,
    locale: CatalogLocale,
  ): Promise<BatchView> {
    const familyId = await this.settings.familyIdOf(memberId);
    const row = await this.updateRow(this.database, familyId, batchId, body);
    return (await this.toViews(familyId, [row], locale))[0];
  }

  /** The same update in the caller's transaction (404 `pantry.batch_not_found` when gone). */
  async updateInTransaction(
    tx: Executor,
    memberId: string,
    batchId: string,
    body: UpdateBatchBody,
  ): Promise<void> {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.updateRow(tx, familyId, batchId, body);
  }

  /** Deletes through the same path as a manual remove (Used Up, Running low), in the caller's transaction. Returns the deleted rows. */
  async removeInTransaction(
    tx: Executor,
    memberId: string,
    batchIds: string[],
  ): Promise<BatchRow[]> {
    const familyId = await this.settings.familyIdOf(memberId);
    return this.deleteBatches(tx, familyId, [...new Set(batchIds)]);
  }

  /**
   * The Location and expiry date a manual add would give a Batch of this
   * Ingredient (or an Unmatched one) when none is typed; Review shows them.
   */
  async addDefaults(
    memberId: string,
    target: { ingredientId: string } | { rawName: string },
    today: string,
  ): Promise<{
    location: BatchView['location'] | null;
    expiryDate: string | null;
  }> {
    const familyId = await this.settings.familyIdOf(memberId);
    const body: CreateBatchBody =
      'ingredientId' in target
        ? { ingredientId: target.ingredientId }
        : { rawName: target.rawName };
    const [resolved] = await this.targetsFor(familyId, [body]);
    const overrides = await this.settings.expiryOverridesOf(familyId);
    const defaults = resolveCatalogDefaults(resolved.leaf, resolved.parent);
    const expiryDays = resolveExpiryDays(
      resolved.leaf,
      resolved.parent,
      overrides,
    );
    return {
      location: defaults.location ?? null,
      expiryDate: expiryDays === null ? null : addDays(today, expiryDays),
    };
  }

  /**
   * The Family's Batch rows among `ids`, or of one Ingredient when `ingredientId`
   * is given, soonest expiry first (undated last), locked for the transaction.
   */
  async findBatchRows(
    tx: Tx,
    memberId: string,
    filter: { ids: string[] } | { ingredientId: string } | { unmatched: true },
  ): Promise<BatchRow[]> {
    const familyId = await this.settings.familyIdOf(memberId);
    const scope =
      'ids' in filter
        ? inArray(batches.id, filter.ids)
        : 'ingredientId' in filter
          ? eq(batches.ingredientId, filter.ingredientId)
          : isNull(batches.ingredientId);
    return tx
      .select()
      .from(batches)
      .where(and(eq(batches.familyId, familyId), scope))
      .orderBy(
        sql`${batches.expiryDate} ASC NULLS LAST`,
        asc(batches.createdAt),
        asc(batches.id),
      )
      .for('update');
  }

  private async updateRow(
    executor: Executor,
    familyId: string,
    batchId: string,
    body: UpdateBatchBody,
  ): Promise<BatchRow> {
    const [current] = await executor
      .select()
      .from(batches)
      .where(and(eq(batches.id, batchId), eq(batches.familyId, familyId)))
      .limit(1);
    if (!current) throw new ApiException(404, 'pantry.batch_not_found');

    const quantity =
      body.quantity !== undefined ? body.quantity : current.quantity;
    const unit = body.unit !== undefined ? body.unit : current.unit;
    if (quantity !== null && unit === null) {
      throw new ApiException(400, 'pantry.unit_required');
    }

    const [row] = await executor
      .update(batches)
      .set({
        quantity,
        unit: quantity === null ? null : unit,
        location: body.location ?? current.location,
        expiryDate:
          body.expiryDate !== undefined ? body.expiryDate : current.expiryDate,
        productDescription:
          body.productDescription !== undefined
            ? body.productDescription || null
            : current.productDescription,
      })
      .where(and(eq(batches.id, batchId), eq(batches.familyId, familyId)))
      .returning();
    // Deleted by another Member between the read and the update.
    if (!row) throw new ApiException(404, 'pantry.batch_not_found');
    return row;
  }

  /** Another Family's Batch is indistinguishable from a missing one. */
  async remove(memberId: string, batchId: string): Promise<void> {
    const familyId = await this.settings.familyIdOf(memberId);
    const deleted = await this.database.transaction((tx) =>
      this.deleteBatches(tx, familyId, [batchId]),
    );
    if (deleted.length === 0) {
      throw new ApiException(404, 'pantry.batch_not_found');
    }
  }

  /** Deletes the Family's Batches among `batchIds`; ids of another Family or already gone are ignored. */
  async removeMany(memberId: string, batchIds: string[]): Promise<void> {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.database.transaction((tx) =>
      this.deleteBatches(tx, familyId, [...new Set(batchIds)]),
    );
  }

  /**
   * The one way to create Batches, so the stock history stays right (ADR 0005):
   * every caller (manual add, Scan save, Finish Shopping) goes through it, and a
   * future flow that adds Batches should too. Runs in the caller's transaction.
   */
  async insertBatches(
    executor: Executor,
    familyId: string,
    values: Array<typeof batches.$inferInsert>,
  ): Promise<BatchRow[]> {
    // One clock reading for the Batch and its history, so the 10-minute rule
    // never compares the app clock with the database's.
    const now = new Date(Date.now());
    const inserted = await executor
      .insert(batches)
      .values(values.map((value) => ({ ...value, createdAt: now })))
      .returning();
    const ingredientIds = inserted.map((row) => row.ingredientId);
    await recordStocked(executor, familyId, ingredientIds, now);
    await clearRunningLowOnRestock(executor, familyId, ingredientIds);
    return inserted;
  }

  /**
   * The one way to delete Batches of a Family: an Ingredient left with none becomes
   * Used Up, and loses its "Running low" flag. A future cook-deduction flow must
   * delete through it. Returns the deleted Batches; ids of another Family are ignored.
   */
  async deleteBatches(
    executor: Executor,
    familyId: string,
    batchIds: string[],
  ): Promise<BatchRow[]> {
    const deleted = await executor
      .delete(batches)
      .where(and(inArray(batches.id, batchIds), eq(batches.familyId, familyId)))
      .returning();
    await clearRunningLowWhenGone(
      executor,
      familyId,
      deleted.map((row) => row.ingredientId),
    );
    await recordRemoved(executor, familyId, deleted);
    return deleted;
  }

  /**
   * The Leaf and Parent Category each body lands under, in body order, in at
   * most two queries however many bodies there are: matched bodies by their
   * Ingredient, Unmatched ones under their Parent's `is_other` Leaf. With no
   * Parent given an Unmatched body uses the top-level "Other" Parent,
   * identified by its fixed seed id (slugs and ids never change once shipped),
   * never by name.
   */
  private async targetsFor(
    familyId: string,
    bodies: ServerBatchBody[],
  ): Promise<Target[]> {
    const parentIdOf = (body: ServerBatchBody) =>
      body.parentCategoryId ?? TOP_LEVEL_OTHER_PARENT_ID;
    const ingredientIds = [
      ...new Set(
        bodies.flatMap((b) => (b.rawName ? [] : [b.ingredientId as string])),
      ),
    ];
    const parentIds = [
      ...new Set(bodies.flatMap((b) => (b.rawName ? [parentIdOf(b)] : []))),
    ];

    const matched = new Map<string, { leaf: Leaf; parent: Parent }>();
    if (ingredientIds.length > 0) {
      const ingredients = catalogScope(familyId).ingredients(this.database);
      const rows = await this.database
        .select({
          id: ingredients.id,
          leaf: leafCategories,
          parent: parentCategories,
        })
        .from(ingredients)
        .innerJoin(
          leafCategories,
          eq(ingredients.leafCategoryId, leafCategories.id),
        )
        .innerJoin(
          parentCategories,
          eq(leafCategories.parentId, parentCategories.id),
        )
        .where(inArray(ingredients.id, ingredientIds));
      for (const row of rows) matched.set(row.id, row);
    }

    const parents = new Map<string, Parent>();
    const otherLeaves = new Map<string, Leaf>();
    if (parentIds.length > 0) {
      const rows = await this.database
        .select({ parent: parentCategories, leaf: leafCategories })
        .from(parentCategories)
        .leftJoin(
          leafCategories,
          and(
            eq(leafCategories.parentId, parentCategories.id),
            eq(leafCategories.isOther, true),
          ),
        )
        .where(inArray(parentCategories.id, parentIds));
      for (const { parent, leaf } of rows) {
        parents.set(parent.id, parent);
        if (leaf) otherLeaves.set(parent.id, leaf);
      }
    }

    return bodies.map((body) => {
      if (!body.rawName) {
        const row = matched.get(body.ingredientId as string);
        if (!row) throw new ApiException(404, 'pantry.ingredient_not_found');
        return { ingredientId: body.ingredientId as string, ...row };
      }
      const parent = parents.get(parentIdOf(body));
      if (!parent) throw new ApiException(404, 'pantry.category_not_found');
      const leaf = otherLeaves.get(parent.id);
      if (!leaf) throw new ApiException(422, 'pantry.other_leaf_missing');
      return { ingredientId: null, leaf, parent };
    });
  }

  private async toViews(
    familyId: string,
    rows: BatchRow[],
    locale: CatalogLocale,
  ): Promise<BatchView[]> {
    const [placements, expiryDays] = await Promise.all([
      loadIngredientPlacements(
        this.database,
        catalogScope(familyId),
        locale,
        rows.flatMap((r) => (r.ingredientId ? [r.ingredientId] : [])),
      ),
      this.expiryDaysByLeaf(familyId, rows),
    ]);

    return rows.map((row) => ({
      id: row.id,
      name: row.ingredientId
        ? (placements.get(row.ingredientId)?.name ?? row.rawName ?? '')
        : (row.rawName ?? ''),
      ingredientId: row.ingredientId,
      unmatched: row.unmatched,
      aisle: row.ingredientId
        ? (placements.get(row.ingredientId)?.aisle ?? null)
        : null,
      amountScale: row.ingredientId
        ? (placements.get(row.ingredientId)?.amountScale ?? null)
        : null,
      // The Ingredient's own unit, for a Batch with no stored unit (null when Unmatched).
      defaultUnit: row.ingredientId
        ? (placements.get(row.ingredientId)?.defaultUnit ?? null)
        : null,
      quantity: row.quantity,
      unit: row.unit,
      location: row.location,
      expiryDate: row.expiryDate,
      defaultExpiryDays: expiryDays.get(row.leafCategoryId) ?? null,
      productDescription: row.productDescription,
      createdAt: row.createdAt,
    }));
  }

  /** The Default Expiry in days of each Batch's Leaf Category, with the Family's current overrides. */
  private async expiryDaysByLeaf(
    familyId: string,
    rows: BatchRow[],
  ): Promise<Map<string, number | null>> {
    const leafIds = [...new Set(rows.map((row) => row.leafCategoryId))];
    if (leafIds.length === 0) return new Map();
    const [overrides, categories] = await Promise.all([
      this.settings.expiryOverridesOf(familyId),
      this.database
        .select({ leaf: leafCategories, parent: parentCategories })
        .from(leafCategories)
        .innerJoin(
          parentCategories,
          eq(leafCategories.parentId, parentCategories.id),
        )
        .where(inArray(leafCategories.id, leafIds)),
    ]);
    return new Map(
      categories.map(({ leaf, parent }) => [
        leaf.id,
        resolveExpiryDays(leaf, parent, overrides),
      ]),
    );
  }
}
