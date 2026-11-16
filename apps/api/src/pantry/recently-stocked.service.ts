import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, max, sql } from 'drizzle-orm';
import { catalogScope } from '../catalog/catalog-scope';
import { CatalogSearchService } from '../catalog/catalog-search.service';
import type { CatalogLocale } from '../catalog/catalog.schemas';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.types';
import { batches, ingredientStockHistory } from '../database/schema';
import { SettingsService } from '../settings/settings.service';
import type { RecentlyStockedView } from './pantry.schemas';

/** Recently Stocked: the Family's stock history by `last_stocked_at`, newest first (ADR 0005). */
@Injectable()
export class RecentlyStockedService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly settings: SettingsService,
    private readonly search: CatalogSearchService,
  ) {}

  async list(
    memberId: string,
    locale: CatalogLocale,
    limit: number,
  ): Promise<RecentlyStockedView[]> {
    const familyId = await this.settings.familyIdOf(memberId);
    const scope = catalogScope(familyId);
    const history = ingredientStockHistory;
    const ingredients = scope.ingredients(this.database);
    // Inner join on the scoped Ingredients: history of an Ingredient the Family can't see is dropped.
    const rows = await this.database
      .select({
        ingredientId: history.ingredientId,
        lastStockedAt: history.lastStockedAt,
        inPantry: sql<boolean>`EXISTS (SELECT 1 FROM ${batches} WHERE ${batches.familyId} = ${familyId} AND ${batches.ingredientId} = ${history.ingredientId})`,
      })
      .from(history)
      .innerJoin(ingredients, eq(ingredients.id, history.ingredientId))
      .where(eq(history.familyId, familyId))
      .orderBy(desc(history.lastStockedAt), history.ingredientId)
      .limit(limit);
    const overrides = await this.settings.expiryOverridesOf(familyId);
    const found = await this.search.mapByIds(
      scope,
      rows.map((row) => row.ingredientId),
      locale,
      overrides,
    );
    return rows.flatMap((row) => {
      const result = found.get(row.ingredientId);
      return result
        ? [
            {
              ...result,
              lastStockedAt: row.lastStockedAt.toISOString(),
              inPantry: row.inPantry,
            },
          ]
        : [];
    });
  }

  /**
   * When the Family last put something in the Pantry, for the Pantry Health lights: the later of the newest
   * Stock history entry (catches Batches already used up) and the newest Batch's `createdAt` (catches Unmatched
   * Batches, which Stock history does not track). null when neither exists.
   */
  async lastStockedAt(memberId: string): Promise<string | null> {
    const familyId = await this.settings.familyIdOf(memberId);
    const [fromHistory] = await this.database
      .select({ at: max(ingredientStockHistory.lastStockedAt) })
      .from(ingredientStockHistory)
      .where(eq(ingredientStockHistory.familyId, familyId));
    const [fromBatches] = await this.database
      .select({ at: max(batches.createdAt) })
      .from(batches)
      .where(eq(batches.familyId, familyId));
    const times = [fromHistory?.at, fromBatches?.at].filter(
      (at): at is Date => at instanceof Date,
    );
    if (times.length === 0) return null;
    return new Date(Math.max(...times.map((at) => at.getTime()))).toISOString();
  }
}
