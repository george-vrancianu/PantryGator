import type {
  FamilyRecipeDocument,
  FamilyRecipeDraft,
  FamilyRecipeEdit,
  SuggestFamilyGuidanceRequest,
} from '@/lib/familyRecipes';
import {
  decimal,
  minutesText,
  newKey,
  timerText,
  type LineDraft,
  type RecipeDraft,
  type StepDraft,
} from '@/lib/recipeDraft';

/**
 * The form state is the Admin's `RecipeDraft`. A line with an `ingredientId` is
 * a Catalog Ingredient; one without is a free-text name kept in `name`.
 */
export type FamilyDraft = RecipeDraft;

type Source = Pick<
  FamilyRecipeDraft,
  'title' | 'prepMinutes' | 'cookMinutes' | 'difficulty' | 'tagIds'
>;

const metaOf = (source: Source & { servings: number | null }) => ({
  title: source.title,
  servings: source.servings === null ? '' : String(source.servings),
  prepMinutes: minutesText(source.prepMinutes),
  cookMinutes: minutesText(source.cookMinutes),
  difficulty: source.difficulty ?? ('' as const),
  tagIds: source.tagIds,
});

type LineSource = {
  id?: string;
  ingredientId: string | null;
  rawName: string | null;
  ingredientName: string;
  quantity: number | null;
  unit: LineDraft['unit'] | null;
  optional: boolean;
  note: string | null;
};

const lineOf = (line: LineSource): LineDraft => ({
  key: newKey(),
  ...(line.id ? { id: line.id } : {}),
  ingredientId: line.ingredientId ?? '',
  name: line.ingredientName || line.rawName || '',
  quantity: line.quantity === null ? '' : String(line.quantity),
  unit: line.unit ?? 'g',
  optional: line.optional,
  note: line.note ?? '',
});

/** A draft with no ids yet, as the New Recipe page takes it: "Make a variant", or one read from a source (Servings may be unknown). */
export type NewRecipeDraft = Omit<
  FamilyRecipeDraft,
  'parentId' | 'servings'
> & {
  servings: number | null;
};

/** A "Make a variant" or sourced draft: lines and Steps have no ids yet. The API's `draftContentOfLink` (apps/api/src/recipes/link-draft-content.ts) repeats this conversion for link reads: change both together. */
export function draftOfVariantDraft(draft: NewRecipeDraft): FamilyDraft {
  return {
    ...metaOf(draft),
    lines: draft.lines.map(lineOf),
    steps: draft.steps.map((step, index): StepDraft => ({
      key: newKey(),
      text: step.text,
      timer: timerText(step.timerSeconds),
      tips: draft.tips
        .filter((tip) => tip.stepIndex === index)
        .map((tip) => ({ key: newKey(), text: tip.text })),
    })),
  };
}

/** A saved Family Recipe: lines and Steps keep their ids so Tips stay put. */
export function draftOfEdit(recipe: FamilyRecipeEdit): FamilyDraft {
  return {
    ...metaOf(recipe),
    lines: recipe.lines.map(lineOf),
    steps: recipe.steps.map((step): StepDraft => ({
      key: newKey(),
      id: step.id,
      text: step.text,
      timer: timerText(step.timerSeconds),
    })),
  };
}

/** The keys of the lines and Steps of a draft, in order: what a Save sent, so its answer can be matched back. */
export const keysOf = (draft: FamilyDraft) => ({
  lines: draft.lines.map((line) => line.key),
  steps: draft.steps.map((step) => step.key),
});

/**
 * The live `draft` moved onto the Recipe the server now stores, keeping every edit.
 * `sent` holds the keys the Save sent, in order; the stored Recipe lists the same rows
 * in the same order, so a row sent without an id takes the id the server gave it, and
 * one sent with an id keeps it. A row whose key was not sent (added during the Save)
 * keeps its id only if the server still has it: otherwise (Undo of a removed row) it
 * goes in as new.
 */
export function rebasedOnStored(
  draft: FamilyDraft,
  sent: ReturnType<typeof keysOf>,
  stored: FamilyDraft,
): FamilyDraft {
  const rebase = <T extends { key: number; id?: string }>(
    rows: T[],
    sentKeys: number[],
    storedRows: T[],
  ): T[] => {
    const idOfKey = new Map(
      sentKeys.map((key, index) => [key, storedRows[index]?.id]),
    );
    const known = new Set(storedRows.map((row) => row.id));
    return rows.map(({ id, ...row }) => {
      const next = idOfKey.has(row.key)
        ? idOfKey.get(row.key)
        : id && known.has(id)
          ? id
          : undefined;
      return (next ? { ...row, id: next } : row) as T;
    });
  };
  return {
    ...draft,
    lines: rebase(draft.lines, sent.lines, stored.lines),
    steps: rebase(draft.steps, sent.steps, stored.steps),
  };
}

/** The document to send; call only when `problemsOf` found nothing. */
export function documentOf(draft: FamilyDraft): FamilyRecipeDocument {
  const minutes = (text: string) =>
    text.trim() === '' ? null : Number(text.trim());
  // A Tip's step index is its step's place in the final order.
  const tips = [
    ...(draft.tips ?? []).map((tip) => ({ stepIndex: null, text: tip.text })),
    ...draft.steps.flatMap((step, stepIndex) =>
      (step.tips ?? []).map((tip) => ({ stepIndex, text: tip.text })),
    ),
  ];
  return {
    title: draft.title.trim(),
    servings: Number(draft.servings.trim()),
    prepMinutes: minutes(draft.prepMinutes),
    cookMinutes: minutes(draft.cookMinutes),
    difficulty: draft.difficulty === '' ? null : draft.difficulty,
    tagIds: draft.tagIds,
    lines: draft.lines.map((line) => {
      const hasQuantity = line.quantity.trim() !== '';
      return {
        ...(line.id ? { id: line.id } : {}),
        ingredientId: line.ingredientId || null,
        rawName: line.ingredientId ? null : line.name.trim(),
        quantity: hasQuantity ? decimal(line.quantity) : null,
        unit: hasQuantity ? line.unit : null,
        optional: line.optional,
        note: line.note.trim() === '' ? null : line.note.trim(),
      };
    }),
    steps: draft.steps.map((step) => ({
      ...(step.id ? { id: step.id } : {}),
      text: step.text.trim(),
      timerSeconds:
        step.timer.trim() === '' ? null : Math.round(decimal(step.timer) * 60),
    })),
    ...(tips.length > 0 ? { tips } : {}),
  };
}

/**
 * The page's Recipe as Suggest Guidance reads it. The form may be half done, so unlike
 * `documentOf` this never needs `problemsOf` to be clear: lines and Steps with nothing in them
 * are left out and a missing Title or Servings is left out too (the API takes both as optional).
 */
export function suggestionRecipeOf(
  draft: FamilyDraft,
): SuggestFamilyGuidanceRequest['recipe'] {
  const servings = Math.round(decimal(draft.servings));
  const quantityOf = (text: string) => {
    const value = decimal(text);
    return text.trim() !== '' && value >= 0.001 && value <= 1_000_000
      ? Math.round(value * 1000) / 1000
      : null;
  };
  return {
    ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    ...(servings >= 1 && servings <= 1000 ? { servings } : {}),
    prepMinutes: null,
    cookMinutes: null,
    tagIds: draft.tagIds,
    lines: draft.lines.flatMap((line) => {
      const rawName = line.name.trim().slice(0, 100);
      if (!line.ingredientId && rawName === '') return [];
      const quantity = quantityOf(line.quantity);
      return [
        {
          ingredientId: line.ingredientId || null,
          rawName: line.ingredientId ? null : rawName,
          quantity,
          unit: quantity === null ? null : line.unit,
          optional: line.optional,
          note: null,
        },
      ];
    }),
    steps: draft.steps.flatMap((step) =>
      step.text.trim() === ''
        ? []
        : [{ text: step.text.trim().slice(0, 2000), timerSeconds: null }],
    ),
  };
}
