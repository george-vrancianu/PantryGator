import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CatalogLocale } from '../catalog/catalog.schemas';
import { DATABASE } from '../database/database.constants';
import type { Database, Executor, Tx } from '../database/database.types';
import { recipeDrafts, recipes, user } from '../database/schema';
import { ApiException } from '../common/api-exception';
import { catalogScope } from '../catalog/catalog-scope';
import { recipeTitles } from '../recipes/recipe-view';
import { recipeDraftExpired } from './recipe-draft-expiry';
import {
  recipeDraftLimitReached,
  recipeDraftNotFound,
  recipeDraftVersionConflict,
} from './recipe-drafts-errors';
import {
  MAX_RECIPE_DRAFTS,
  RECIPE_DRAFT_TTL_DAYS,
  type RecipeDraftContent,
  type RecipeDraftReadContent,
  type RecipeDraftCreate,
  type RecipeDraftOrigin,
  type RecipeDraftSummary,
  type RecipeDraftUpdate,
  type RecipeDraftView,
} from './recipe-drafts.schemas';

type RecipeRow = typeof recipes.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

const expiresAtOf = (updatedAt: Date) =>
  new Date(updatedAt.getTime() + RECIPE_DRAFT_TTL_DAYS * DAY_MS);

/**
 * A line whose Ingredient was deleted since it was typed comes back with no
 * Ingredient (an Unmatched name); its typed name stays. A line that keeps its Ingredient
 * gets `ingredientOwner` (read-only, never stored) for the Family pill.
 */
async function withoutMissingIngredients(
  executor: Executor,
  familyId: string,
  content: RecipeDraftContent,
): Promise<RecipeDraftReadContent> {
  const ids = [
    ...new Set(
      content.lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : [])),
    ),
  ].filter((id) => z.uuid().safeParse(id).success);
  const found = new Map<string, 'catalog' | 'family'>();
  if (ids.length > 0) {
    const table = catalogScope(familyId).ingredients(executor);
    const rows = await executor
      .select({ id: table.id, ownerFamilyId: table.ownerFamilyId })
      .from(table)
      .where(inArray(table.id, ids));
    for (const row of rows) {
      found.set(row.id, row.ownerFamilyId === null ? 'catalog' : 'family');
    }
  }
  return {
    ...content,
    lines: content.lines.map((line) => {
      if (!line.ingredientId) return line;
      const ingredientOwner = found.get(line.ingredientId);
      return ingredientOwner
        ? { ...line, ingredientOwner }
        : { ...line, ingredientId: '' };
    }),
  };
}

/**
 * Deletes the Member's Recipe Drafts not edited for 30 days. Expiry is lazy
 * (no scheduler): every list, count, update and read of one calls this first.
 */
export async function deleteExpiredRecipeDrafts(
  executor: Executor,
  memberId: string,
): Promise<void> {
  await executor
    .delete(recipeDrafts)
    .where(and(eq(recipeDrafts.memberId, memberId), recipeDraftExpired));
}

function originOf(content: RecipeDraftContent): RecipeDraftOrigin {
  if (content.sourceLink) {
    try {
      const { hostname } = new URL(content.sourceLink);
      // "www." is the same site, and noise in a row.
      return { type: 'link', domain: hostname.replace(/^www\./, '') };
    } catch {
      // A half-typed link has no domain yet: fall through.
    }
  }
  return content.plateScan ? { type: 'plate_scan' } : null;
}

/** Recipe Drafts (ADR 0028): a Member's unsaved New Recipe or Variant, kept on the server. */
@Injectable()
export class RecipeDraftsService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(
    memberId: string,
    locale: CatalogLocale,
  ): Promise<RecipeDraftSummary[]> {
    return this.database.transaction(async (tx) => {
      await deleteExpiredRecipeDrafts(tx, memberId);
      const rows = await tx
        .select()
        .from(recipeDrafts)
        .where(eq(recipeDrafts.memberId, memberId))
        .orderBy(desc(recipeDrafts.updatedAt), desc(recipeDrafts.id));
      const baseIds = rows.flatMap((r) =>
        r.baseRecipeId ? [r.baseRecipeId] : [],
      );
      const bases =
        baseIds.length === 0
          ? []
          : await tx.select().from(recipes).where(inArray(recipes.id, baseIds));
      const names = await recipeTitles(tx, bases, locale);
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        baseRecipeId: row.baseRecipeId,
        baseRecipeName: row.baseRecipeId
          ? (names.get(row.baseRecipeId) ?? null)
          : null,
        title: row.content.title,
        origin: originOf(row.content),
        updatedAt: row.updatedAt.toISOString(),
        expiresAt: expiresAtOf(row.updatedAt).toISOString(),
        version: row.version,
      }));
    });
  }

  async get(
    memberId: string,
    id: string,
    locale: CatalogLocale,
  ): Promise<RecipeDraftView> {
    return this.database.transaction(async (tx) => {
      await deleteExpiredRecipeDrafts(tx, memberId);
      const [row] = await tx
        .select()
        .from(recipeDrafts)
        .where(
          and(eq(recipeDrafts.id, id), eq(recipeDrafts.memberId, memberId)),
        );
      if (!row) throw recipeDraftNotFound();
      let base: RecipeRow | undefined;
      if (row.baseRecipeId) {
        [base] = await tx
          .select()
          .from(recipes)
          .where(eq(recipes.id, row.baseRecipeId));
      }
      const baseAvailable =
        base !== undefined &&
        base.archivedAt === null &&
        (base.familyId === null || base.familyId === row.familyId);
      const names = base
        ? await recipeTitles(tx, [base], locale)
        : new Map<string, string>();
      return {
        id: row.id,
        kind: row.kind,
        baseRecipeId: row.baseRecipeId,
        baseRecipeName: base ? (names.get(base.id) ?? null) : null,
        baseAvailable,
        content: await withoutMissingIngredients(tx, row.familyId, row.content),
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        expiresAt: expiresAtOf(row.updatedAt).toISOString(),
      };
    });
  }

  /**
   * Throws the limit error when the Member already holds the most Recipe Drafts, without
   * creating one. A cheap early refusal before slow work (a link read); `create` stays the
   * one place the limit is enforced for good.
   */
  async assertRoom(memberId: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      await deleteExpiredRecipeDrafts(tx, memberId);
      if ((await heldBy(tx, memberId)) >= MAX_RECIPE_DRAFTS) {
        throw recipeDraftLimitReached(MAX_RECIPE_DRAFTS);
      }
    });
  }

  async create(
    memberId: string,
    body: RecipeDraftCreate,
  ): Promise<{ id: string; version: number }> {
    return this.database.transaction(async (tx) => {
      // The Member row serialises their creates, so the cap cannot be raced past.
      const [member] = await tx
        .select({ familyId: user.familyId })
        .from(user)
        .where(eq(user.id, memberId))
        .for('update');
      if (!member) throw new ApiException(401, 'auth.unauthenticated');
      await deleteExpiredRecipeDrafts(tx, memberId);
      if ((await heldBy(tx, memberId)) >= MAX_RECIPE_DRAFTS) {
        throw recipeDraftLimitReached(MAX_RECIPE_DRAFTS);
      }
      if (body.baseRecipeId) {
        await assertBaseVisible(tx, body.baseRecipeId, member.familyId);
      }
      const id = randomUUID();
      await tx.insert(recipeDrafts).values({
        id,
        memberId,
        familyId: member.familyId,
        kind: body.kind,
        baseRecipeId: body.baseRecipeId,
        content: body.content,
      });
      return { id, version: 1 };
    });
  }

  async update(
    memberId: string,
    id: string,
    body: RecipeDraftUpdate,
  ): Promise<{ id: string; version: number }> {
    return this.database.transaction(async (tx) => {
      await deleteExpiredRecipeDrafts(tx, memberId);
      // One statement, so two devices saving together cannot both win.
      const [updated] = await tx
        .update(recipeDrafts)
        .set({
          content: body.content,
          version: sql`${recipeDrafts.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(recipeDrafts.id, id),
            eq(recipeDrafts.memberId, memberId),
            eq(recipeDrafts.version, body.version),
          ),
        )
        .returning({ id: recipeDrafts.id, version: recipeDrafts.version });
      if (updated) return updated;
      const [existing] = await tx
        .select({ id: recipeDrafts.id })
        .from(recipeDrafts)
        .where(
          and(eq(recipeDrafts.id, id), eq(recipeDrafts.memberId, memberId)),
        );
      throw existing ? recipeDraftVersionConflict() : recipeDraftNotFound();
    });
  }

  /**
   * Unlike a read or an update, this does not run the lazy expiry first: an
   * expired Recipe Draft that is not yet purged is still deleted and answers 204
   * (the Member wanted it gone, and it is). Only an id that is already gone is 404.
   */
  async remove(memberId: string, id: string): Promise<void> {
    const deleted = await this.database
      .delete(recipeDrafts)
      .where(and(eq(recipeDrafts.id, id), eq(recipeDrafts.memberId, memberId)))
      .returning({ id: recipeDrafts.id });
    if (deleted.length === 0) throw recipeDraftNotFound();
  }
}

async function heldBy(executor: Executor, memberId: string): Promise<number> {
  const [{ held }] = await executor
    .select({ held: sql<number>`count(*)::int` })
    .from(recipeDrafts)
    .where(eq(recipeDrafts.memberId, memberId));
  return held;
}

/** A base the Member's Family can see: a Catalog Recipe or one of its own. */
async function assertBaseVisible(tx: Tx, baseId: string, familyId: string) {
  const [base] = await tx
    .select({ familyId: recipes.familyId })
    .from(recipes)
    .where(eq(recipes.id, baseId));
  if (!base || (base.familyId !== null && base.familyId !== familyId)) {
    throw new ApiException(404, 'recipes.parent_not_found');
  }
}

/**
 * Deletes one Recipe Draft of the Member inside the caller's transaction (the
 * save of a Family Recipe ends its Recipe Draft). An unknown or foreign id
 * deletes nothing.
 */
export async function consumeRecipeDraft(
  tx: Tx,
  memberId: string,
  recipeDraftId: string,
): Promise<void> {
  // A malformed id matches nothing (and must not reach Postgres as a uuid).
  if (!z.uuid().safeParse(recipeDraftId).success) return;
  await tx
    .delete(recipeDrafts)
    .where(
      and(
        eq(recipeDrafts.id, recipeDraftId),
        eq(recipeDrafts.memberId, memberId),
      ),
    );
}
