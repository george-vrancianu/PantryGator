import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { catalogScope } from '../catalog/catalog-scope';
import { loadDisplayNames } from '../catalog/display-names';
import type { CatalogLocale } from '../catalog/catalog.schemas';
import { normalizeName } from '../catalog/normalize';
import { ApiException } from '../common/api-exception';
import { DATABASE } from '../database/database.constants';
import type { Database, Executor, Tx } from '../database/database.types';
import {
  recipeIngredientLines,
  recipes,
  recipeSteps,
  recipeTips,
  recipeTranslations,
  unmatchedEntries,
} from '../database/schema';
import { consumeRecipeDraft } from '../recipe-drafts/recipe-drafts.service';
import { SettingsService } from '../settings/settings.service';
import { recordUnmatched } from '../unmatched/unmatched-entries';
import { replaceRecipeTags, resolveRecipeTags } from '../tags/recipe-tags';
import {
  itemNotFound,
  recipeNotFound,
  sourceLinkLocked,
} from './recipe-errors';
import {
  assertLiveCatalogBase,
  recipeColumns,
  validateRecipeDocument,
} from './recipe-document-rules';
import { lockFamilyRow, lockRecipeForWrite } from './recipe-locks';
import type { GuidanceBody } from './recipe-guidance.schemas';
import { writeGuidanceChecked } from './recipe-guidance-write';
import { loadResolvedGuidance } from './recipe-guidance';
import { RecipesService } from './recipes.service';
import { RecipeTipsService } from './recipe-tips.service';
import {
  findVisibleRecipe,
  loadAdminDetail,
  resolveRecipe,
} from './recipe-view';
import type {
  FamilyRecipeDocument,
  FamilyRecipeDraft,
  FamilyRecipeEdit,
  FamilyRecipeUpdate,
  HiddenTipsBody,
  TipCreate,
  TipOrder,
  TipUpdate,
} from './recipes.schemas';

type LineDocument = FamilyRecipeDocument['lines'][number];

/**
 * A Family's own Recipes: Variants under a Catalog Base Recipe, or standalone
 * Base Recipes (which have no Variants). Every rule about writing one lives here, so the
 * Member editor and the Plate Scan save (`createIn`) behave the same. Every
 * write locks the Family row, then the Recipe row (the order the Unmatched
 * queue uses). Family Recipes are never translated and the Admin paths never
 * reach them.
 */
@Injectable()
export class FamilyRecipesService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly settings: SettingsService,
    private readonly recipes: RecipesService,
    private readonly tips: RecipeTipsService,
  ) {}

  /**
   * The unsaved "Make a variant" draft from a Recipe the Family can see. The
   * parent is the source's Catalog base: the source itself, the base of a
   * Variant (Catalog, the Family's own, or a copy of a Catalog Variant), or
   * the Catalog Base a Family copy was Copied From (ADR 0029); content is
   * prefilled from the source. A Family Base that is not a copy has no
   * Catalog base, so it is refused (404 `recipes.parent_not_found`); a base
   * that is archived is refused too (409 `recipes.parent_archived`).
   */
  async variantDraft(
    memberId: string,
    id: string,
    locale: CatalogLocale,
  ): Promise<FamilyRecipeDraft> {
    const familyId = await this.settings.familyIdOf(memberId);
    const row = await findVisibleRecipe(this.database, id, familyId);
    if (!row) throw recipeNotFound();
    // A copy of a Catalog Base branches from the Base it was Copied From.
    const isFamilyBase = row.familyId !== null && row.parentId === null;
    const parentId = isFamilyBase ? row.copiedFromId : (row.parentId ?? row.id);
    if (!parentId) throw new ApiException(404, 'recipes.parent_not_found');
    const [base] = await this.database
      .select({ archivedAt: recipes.archivedAt })
      .from(recipes)
      .where(eq(recipes.id, parentId));
    if (base?.archivedAt) {
      throw new ApiException(409, 'recipes.parent_archived');
    }
    const source = await resolveRecipe(
      this.database,
      catalogScope(familyId),
      row,
      locale,
    );
    const guidance = await loadResolvedGuidance(
      this.database,
      catalogScope(familyId),
      row.id,
      locale,
    );
    return {
      parentId,
      title: source.title,
      servings: source.servings,
      prepMinutes: source.prepMinutes,
      cookMinutes: source.cookMinutes,
      difficulty: source.difficulty,
      tagIds: source.tags.map((tag) => tag.id),
      lines: source.lines.map((line) => ({
        ingredientId: line.ingredientId,
        rawName: line.ingredientId ? null : line.ingredientName,
        ingredientName: line.ingredientName,
        quantity: line.quantity,
        unit: line.unit,
        optional: line.optional,
        note: line.note,
      })),
      steps: source.steps.map((step) => ({
        text: step.text,
        timerSeconds: step.timerSeconds,
      })),
      // Step Tips are never inherited, so the resolved Tips on a step are the
      // source's own: the same ones `copyContent` copies for the Admin.
      tips: source.tips.flatMap((tip) => {
        const stepIndex = source.steps.findIndex((s) => s.id === tip.stepId);
        return stepIndex < 0 ? [] : [{ stepIndex, text: tip.text }];
      }),
      guidance: {
        nutritionNote: guidance.nutritionNote,
        // Intended: the draft drops Pairing links to archived Recipes (the view hides them), unlike Admin `copyGuidance`.
        pairings: guidance.pairings.map((p) => ({
          kind: p.kind,
          label: p.label,
          reason: p.reason,
          principle: p.principle,
          linkedIngredientId: p.link?.type === 'ingredient' ? p.link.id : null,
          linkedRecipeId: p.link?.type === 'recipe' ? p.link.id : null,
        })),
        eatingMoments: guidance.eatingMoments.map((m) => ({
          eatingMomentId: m.eatingMomentId,
          polarity: m.polarity,
          reason: m.reason,
        })),
      },
    };
  }

  async create(
    memberId: string,
    document: FamilyRecipeDocument,
    locale: CatalogLocale,
  ): Promise<FamilyRecipeEdit> {
    const familyId = await this.settings.familyIdOf(memberId);
    const id = await this.database.transaction(async (tx) => {
      const created = await this.createIn(tx, familyId, document, locale);
      // Saving ends the Recipe Draft (ADR 0028): both or neither.
      if (document.recipeDraftId) {
        await consumeRecipeDraft(tx, memberId, document.recipeDraftId);
      }
      return created;
    });
    return this.edit(familyId, id, locale);
  }

  /**
   * Creates a Family Recipe inside the caller's transaction and returns its
   * id. Unmatched line names are queued in the same transaction.
   */
  async createIn(
    tx: Tx,
    familyId: string,
    document: FamilyRecipeDocument,
    locale: string,
  ): Promise<string> {
    await lockFamilyRow(tx, familyId);
    await this.validate(tx, familyId, document);
    const tips = document.tips ?? [];
    if (
      tips.some(
        (tip) =>
          tip.stepIndex !== null && tip.stepIndex >= document.steps.length,
      )
    ) {
      throw new ApiException(400, 'recipes.bad_step_anchor');
    }
    if (document.parentId)
      await this.assertParent(tx, familyId, document.parentId);
    // After the parent, so another Family's parent reads as missing before any Tag is judged.
    const tagIds = await resolveRecipeTags(tx, familyId, document.tagIds);
    const id = randomUUID();
    await tx.insert(recipes).values({
      id,
      familyId,
      parentId: document.parentId,
      ...recipeColumns(document),
      // Set at creation only; updates never touch it, and a Variant draft does not copy it (ADR 0006).
      sourceLink: document.sourceLink ?? null,
      sourceLanguage: document.sourceLanguage ?? null,
    });
    await replaceRecipeTags(tx, id, tagIds);
    await this.writeLines(tx, id, document, new Map(), locale);
    const stepIds = await this.recipes.writeSteps(tx, id, document, new Set());
    if (tips.length > 0) {
      await tx.insert(recipeTips).values(
        tips.map((tip, position) => ({
          id: randomUUID(),
          recipeId: id,
          stepId: tip.stepIndex === null ? null : stepIds[tip.stepIndex],
          text: tip.text,
          position,
        })),
      );
    }
    if (document.guidance) {
      await writeGuidanceChecked(tx, { id, familyId }, document.guidance);
    }
    return id;
  }

  /** The editable view of one of the Family's own Recipes; 404 for any other. */
  async editFor(
    memberId: string,
    id: string,
    locale: CatalogLocale,
  ): Promise<FamilyRecipeEdit> {
    return this.edit(await this.settings.familyIdOf(memberId), id, locale);
  }

  /**
   * Replaces the document in place; lines and Steps with an `id` keep it (and
   * their Tips). The base is never changed.
   */
  async update(
    memberId: string,
    id: string,
    document: FamilyRecipeUpdate,
  ): Promise<FamilyRecipeEdit> {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.database.transaction(async (tx) => {
      await lockRecipeForWrite(tx, id, familyId);
      // Set at creation only: an update may clear them, never set or change them.
      if (
        (document.sourceLink !== undefined && document.sourceLink !== null) ||
        (document.sourceLanguage !== undefined &&
          document.sourceLanguage !== null)
      ) {
        throw sourceLinkLocked();
      }
      await this.validate(tx, familyId, document);
      const tagIds = await resolveRecipeTags(tx, familyId, document.tagIds);
      const existingLines = await tx
        .select()
        .from(recipeIngredientLines)
        .where(eq(recipeIngredientLines.recipeId, id));
      const existingSteps = await tx
        .select({ id: recipeSteps.id })
        .from(recipeSteps)
        .where(eq(recipeSteps.recipeId, id));
      await tx
        .update(recipes)
        .set({
          ...recipeColumns(document),
          // `null` clears; the link goes with its language, absent leaves both.
          ...(document.sourceLink === null
            ? { sourceLink: null, sourceLanguage: null }
            : document.sourceLanguage === null
              ? { sourceLanguage: null }
              : {}),
        })
        .where(eq(recipes.id, id));
      await replaceRecipeTags(tx, id, tagIds);
      await this.writeLines(
        tx,
        id,
        document,
        new Map(existingLines.map((row) => [row.id, row])),
        document.locale,
      );
      await this.recipes.writeSteps(
        tx,
        id,
        document,
        new Set(existingSteps.map((row) => row.id)),
      );
    });
    return this.edit(familyId, id, document.locale);
  }

  /** "Delete" in the UI: archived, never removed; its Variants and the base are untouched. */
  async archive(
    memberId: string,
    id: string,
    locale: CatalogLocale,
  ): Promise<FamilyRecipeEdit> {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.database.transaction(async (tx) => {
      await lockRecipeForWrite(tx, id, familyId);
      // Archiving twice keeps the first time.
      await tx
        .update(recipes)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(recipes.id, id),
            eq(recipes.familyId, familyId),
            isNull(recipes.archivedAt),
          ),
        );
    });
    return this.edit(familyId, id, locale);
  }

  /**
   * Replaces the guidance (Nutrition Note, Pairings, Eating Moments) of a
   * Family Recipe, as the Admin endpoint does for Catalog Recipes. It is its
   * own endpoint, not part of `update`. Guidance is never translated. A
   * Pairing may link Catalog Recipes or the Family's own, never another
   * Family's.
   */
  async setGuidance(
    memberId: string,
    id: string,
    body: GuidanceBody,
    locale: CatalogLocale,
  ): Promise<FamilyRecipeEdit> {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.database.transaction(async (tx) => {
      const recipe = await lockRecipeForWrite(tx, id, familyId);
      await writeGuidanceChecked(tx, recipe, body);
    });
    return this.edit(familyId, id, locale);
  }

  async createTip(
    memberId: string,
    id: string,
    input: TipCreate,
    locale: CatalogLocale,
  ) {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.tips.writeCreate(id, input, familyId);
    return this.edit(familyId, id, locale);
  }

  async updateTip(
    memberId: string,
    id: string,
    tipId: string,
    input: TipUpdate,
    locale: CatalogLocale,
  ) {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.tips.writeUpdate(id, tipId, input, familyId);
    return this.edit(familyId, id, locale);
  }

  async deleteTip(memberId: string, id: string, tipId: string) {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.tips.delete(id, tipId, familyId);
  }

  async reorderTips(
    memberId: string,
    id: string,
    input: TipOrder,
    locale: CatalogLocale,
  ) {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.tips.writeReorder(id, input, familyId);
    return this.edit(familyId, id, locale);
  }

  async setHiddenTips(
    memberId: string,
    id: string,
    input: HiddenTipsBody,
    locale: CatalogLocale,
  ) {
    const familyId = await this.settings.familyIdOf(memberId);
    await this.tips.writeHidden(id, input, familyId);
    return this.edit(familyId, id, locale);
  }

  private async edit(
    familyId: string,
    id: string,
    locale: CatalogLocale,
  ): Promise<FamilyRecipeEdit> {
    // One snapshot, so the lines and their raw names always agree.
    return this.database.transaction(
      async (tx) => {
        const detail = await loadAdminDetail(tx, id, familyId);
        if (!detail) throw recipeNotFound();
        const { translations, ...rest } = detail;
        void translations; // Family Recipes are never translated
        const resolved = await loadResolvedGuidance(
          tx,
          catalogScope(familyId),
          id,
          locale,
        );
        const links = new Map(resolved.pairings.map((p) => [p.id, p.link]));
        const rows = await tx
          .select()
          .from(recipeIngredientLines)
          .where(eq(recipeIngredientLines.recipeId, id));
        const names = await this.ingredientNames(
          tx,
          familyId,
          rows.flatMap((r) => (r.ingredientId ? [r.ingredientId] : [])),
          locale,
        );
        const byId = new Map(rows.map((row) => [row.id, row]));
        return {
          ...rest,
          parentTitle: await this.parentTitle(tx, detail.parentId, locale),
          pairings: detail.pairings.map((p) => {
            const link = links.get(p.id) ?? null;
            return {
              ...p,
              linkedIngredientName:
                link?.type === 'ingredient' ? link.name : null,
              linkedRecipeTitle: link?.type === 'recipe' ? link.title : null,
            };
          }),
          lines: detail.lines.map((line) => {
            const row = byId.get(line.id);
            return {
              ...line,
              rawName: row?.rawName ?? null,
              ingredientName: row?.ingredientId
                ? (names.get(row.ingredientId) ?? '')
                : (row?.rawName ?? ''),
            };
          }),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** The Catalog base's title in `locale` (source title as fallback); null on a Base Recipe. */
  private async parentTitle(
    executor: Executor,
    parentId: string | null,
    locale: CatalogLocale,
  ): Promise<string | null> {
    if (!parentId) return null;
    const [parent] = await executor
      .select({ title: recipes.title })
      .from(recipes)
      .where(eq(recipes.id, parentId));
    if (!parent) return null;
    const [translated] = await executor
      .select({ title: recipeTranslations.title })
      .from(recipeTranslations)
      .where(
        and(
          eq(recipeTranslations.recipeId, parentId),
          eq(recipeTranslations.locale, locale),
        ),
      );
    return translated?.title ?? parent.title;
  }

  private async ingredientNames(
    executor: Executor,
    familyId: string,
    ids: string[],
    locale: CatalogLocale,
  ) {
    const result = new Map<string, string>();
    if (ids.length === 0) return result;
    const scope = catalogScope(familyId);
    const ingredients = scope.ingredients(executor);
    const canonical = await executor
      .select({ id: ingredients.id, name: ingredients.name })
      .from(ingredients)
      .where(inArray(ingredients.id, ids));
    const display = await loadDisplayNames(executor, scope, locale, ids);
    for (const row of canonical) {
      result.set(row.id, display.pick('ingredient', row.id, row.name));
    }
    return result;
  }

  /**
   * The parent must be a live Catalog Base Recipe: Variants go under Catalog
   * bases only (a Family Base Recipe has no Variants). A shared lock
   * makes an archive of the base wait for us. Existing Variants of an archived
   * base keep working; only new ones are refused.
   */
  private async assertParent(tx: Tx, familyId: string, parentId: string) {
    const [parent] = await tx
      .select()
      .from(recipes)
      .where(eq(recipes.id, parentId))
      .for('share');
    if (parent && parent.familyId !== null && parent.familyId !== familyId) {
      throw new ApiException(404, 'recipes.parent_not_found');
    }
    assertLiveCatalogBase(parent);
  }

  private validate(
    tx: Tx,
    familyId: string,
    document: Pick<FamilyRecipeDocument, 'lines' | 'steps'>,
  ) {
    return validateRecipeDocument(
      tx,
      catalogScope(familyId),
      document,
      (line, index) => {
        if (line.ingredientId !== null && line.rawName !== null) {
          throw new ApiException(400, 'recipes.line_name_conflict', {
            line: index,
          });
        }
        if (
          line.ingredientId === null &&
          (line.rawName === null || normalizeName(line.rawName) === '')
        ) {
          throw new ApiException(400, 'recipes.ingredient_required', {
            line: index,
          });
        }
      },
    );
  }

  /**
   * Writes the Ingredient Lines and keeps the Unmatched queue in step: a line
   * whose name is new or changed gets a fresh entry, a line that is now
   * matched loses its entry, and an unchanged name keeps its entry (and any
   * dismissal). A change of case or spacing only keeps the existing entry too
   * (the normalised name is what counts). Deleted lines take their entries with them (cascade).
   */
  private async writeLines(
    tx: Tx,
    recipeId: string,
    document: Pick<FamilyRecipeDocument, 'lines'>,
    prior: Map<string, typeof recipeIngredientLines.$inferSelect>,
    locale: string,
  ) {
    const kept = document.lines.flatMap((l) => (l.id ? [l.id] : []));
    if (kept.some((lineId) => !prior.has(lineId))) throw itemNotFound('line');
    await tx
      .delete(recipeIngredientLines)
      .where(
        and(
          eq(recipeIngredientLines.recipeId, recipeId),
          kept.length > 0
            ? notInArray(recipeIngredientLines.id, kept)
            : undefined,
        ),
      );
    const queue: { lineId: string; line: LineDocument }[] = [];
    const stale: string[] = [];
    for (const [position, line] of document.lines.entries()) {
      const normalizedName = line.rawName ? normalizeName(line.rawName) : null;
      const values = {
        position,
        ingredientId: line.ingredientId,
        rawName: line.rawName,
        normalizedName,
        quantity: line.quantity,
        unit: line.unit,
        optional: line.optional,
        note: line.note,
      };
      if (line.id) {
        await tx
          .update(recipeIngredientLines)
          .set(values)
          .where(eq(recipeIngredientLines.id, line.id));
        const before = prior.get(line.id)!;
        if (before.normalizedName !== normalizedName) {
          if (before.normalizedName !== null) stale.push(line.id);
          if (normalizedName !== null) queue.push({ lineId: line.id, line });
        }
      } else {
        const lineId = randomUUID();
        await tx
          .insert(recipeIngredientLines)
          .values({ id: lineId, recipeId, ...values });
        if (normalizedName !== null) queue.push({ lineId, line });
      }
    }
    if (stale.length > 0) {
      await tx
        .delete(unmatchedEntries)
        .where(inArray(unmatchedEntries.ingredientLineId, stale));
    }
    await recordUnmatched(
      tx,
      queue.map(({ lineId, line }) => ({
        rawName: line.rawName as string,
        locale,
        source: 'recipe' as const,
        ingredientLineId: lineId,
      })),
    );
  }
}
