import { localName, type AdminCatalog } from './admin';
import type {
  AdminRecipe,
  RecipeDocument,
  SuggestCatalogGuidanceRequest,
} from './adminRecipes';
import type { SuggestFamilyGuidanceRequest } from './familyRecipes';
import type { Difficulty } from './recipeVocabulary';
import type { Unit } from './catalog';

export type LineDraft = {
  /** Stable React key; not sent. */
  key: number;
  /** Present on a saved line, so saving keeps it (and its translated note). */
  id?: string;
  ingredientId: string;
  /** Whose Ingredient the line uses (for the Family pill); unknown on a line from a stored or read draft. */
  ingredientOwner?: 'catalog' | 'family' | null;
  name: string;
  quantity: string;
  unit: Unit;
  optional: boolean;
  note: string;
};
/** A step Tip copied into an unsaved draft; saved Recipes manage Tips through the Tips editor. */
export type StepTipDraft = { key: number; text: string };
export type StepDraft = {
  key: number;
  id?: string;
  /** Only on a new Variant draft: the copied Tips of this step, sent on create. */
  tips?: StepTipDraft[];
  text: string;
  /** Minutes, decimals allowed; blank for no timer. */
  timer: string;
};
export type RecipeDraft = {
  title: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  difficulty: Difficulty | '';
  /** The ids of the picked Tags (at most 10 on save). */
  tagIds: string[];
  lines: LineDraft[];
  steps: StepDraft[];
  /** Only on a draft that brings Tips of the whole Recipe (a Plate Scan): sent on create. */
  tips?: StepTipDraft[];
};

export type DraftProblems = {
  title: boolean;
  servings: boolean;
  prepMinutes: boolean;
  cookMinutes: boolean;
  lines: Record<number, boolean>;
  steps: Record<number, 'text' | 'timer'>;
};

let nextKey = 1;
/** A fresh React key for a draft row (shared by every Recipe draft). */
export const newKey = () => nextKey++;

export const minutesText = (value: number | null) =>
  value === null ? '' : String(value);

export const timerText = (seconds: number | null) =>
  seconds === null ? '' : String(Math.round((seconds / 60) * 100) / 100);

export function emptyDraft(): RecipeDraft {
  return {
    title: '',
    servings: '4',
    prepMinutes: '',
    cookMinutes: '',
    difficulty: '',
    tagIds: [],
    lines: [],
    steps: [],
  };
}

export function draftOf(
  recipe: AdminRecipe,
  catalog: AdminCatalog,
  locale: string,
): RecipeDraft {
  return {
    title: recipe.title,
    servings: String(recipe.servings),
    prepMinutes: minutesText(recipe.prepMinutes),
    cookMinutes: minutesText(recipe.cookMinutes),
    difficulty: recipe.difficulty ?? '',
    tagIds: recipe.tagIds,
    lines: recipe.lines.map((line) => {
      const ingredient = catalog.ingredients.find(
        (item) => item.id === line.ingredientId,
      );
      return {
        key: newKey(),
        id: line.id,
        ingredientId: line.ingredientId ?? '',
        name: ingredient ? localName(ingredient, locale) : '',
        quantity: line.quantity === null ? '' : String(line.quantity),
        unit: line.unit ?? ingredient?.defaultUnit ?? 'g',
        optional: line.optional,
        note: line.note ?? '',
      };
    }),
    steps: recipe.steps.map((step) => ({
      key: newKey(),
      id: step.id,
      text: step.text,
      timer:
        step.timerSeconds === null
          ? ''
          : String(Math.round((step.timerSeconds / 60) * 100) / 100),
    })),
  };
}

export const decimal = (text: string) => Number(text.trim().replace(',', '.'));
// Bounds mirror the API's recipe schema (MAX_QUANTITY, minutes, timer seconds).
const MAX_MINUTES = 100_000;
const MAX_QUANTITY = 1_000_000;
const MAX_TIMER_SECONDS = 1_000_000;
const isMinutes = (text: string) =>
  text.trim() === '' ||
  (/^\d{1,6}$/.test(text.trim()) && Number(text.trim()) <= MAX_MINUTES);
/** A quantity within bounds, or null when the text is not one. */
const validQuantity = (text: string): number | null => {
  const value = decimal(text);
  return Number.isFinite(value) && value >= 0.001 && value <= MAX_QUANTITY
    ? value
    : null;
};
const isQuantity = (text: string) => {
  if (text.trim() === '') return true;
  const value = validQuantity(text);
  return (
    value !== null && Math.abs(Math.round(value * 1000) - value * 1000) < 1e-6
  );
};
/** Whole Servings from 1 to 1000, or null when the text is not that. */
const validServings = (text: string): number | null => {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : null;
};
const isTimer = (text: string) => {
  if (text.trim() === '') return true;
  const value = decimal(text);
  const seconds = Math.round(value * 60);
  return Number.isFinite(value) && seconds >= 1 && seconds <= MAX_TIMER_SECONDS;
};

export function problemsOf(draft: RecipeDraft): DraftProblems {
  const lines: Record<number, boolean> = {};
  for (const line of draft.lines) {
    if (!isQuantity(line.quantity)) lines[line.key] = true;
  }
  const steps: Record<number, 'text' | 'timer'> = {};
  for (const step of draft.steps) {
    if (step.text.trim() === '') steps[step.key] = 'text';
    else if (!isTimer(step.timer)) steps[step.key] = 'timer';
  }
  return {
    title: draft.title.trim() === '',
    servings: validServings(draft.servings) === null,
    prepMinutes: !isMinutes(draft.prepMinutes),
    cookMinutes: !isMinutes(draft.cookMinutes),
    lines,
    steps,
  };
}

export function hasProblems(problems: DraftProblems): boolean {
  return (
    problems.title ||
    problems.servings ||
    problems.prepMinutes ||
    problems.cookMinutes ||
    Object.keys(problems.lines).length > 0 ||
    Object.keys(problems.steps).length > 0
  );
}

/** The document to send; call only when `problemsOf` found nothing. */
export function documentOf(draft: RecipeDraft): RecipeDocument {
  const minutes = (text: string) =>
    text.trim() === '' ? null : Number(text.trim());
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
        ingredientId: line.ingredientId,
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
  };
}

/** A copy of `items` with the entry at `from` moved to `to`, keeping every item (and so its key). Out-of-range indexes change nothing. */
export function reordered<T>(items: T[], from: number, to: number): T[] {
  const inRange = (index: number) => index >= 0 && index < items.length;
  if (!inRange(from) || !inRange(to) || from === to) return items;
  const copy = [...items];
  copy.splice(to, 0, ...copy.splice(from, 1));
  return copy;
}

/** `items` with the entry at `index` moved one place by `offset`. */
export const moved = <T>(items: T[], index: number, offset: -1 | 1): T[] =>
  reordered(items, index, index + offset);

/**
 * The editor's Recipe as Suggest Guidance reads it, for both the Admin's Catalog editor and the
 * Family page. The form may be half done, so unlike `documentOf` this never needs `problemsOf`
 * to be clear: lines with neither an Ingredient nor a name and Steps with no text are left out,
 * and a missing Title or Servings is left out too (the API takes both as optional). A line
 * without an Ingredient goes as its typed `rawName`. The Admin request also carries a
 * `difficulty` of null; the Family request has none.
 */
export function suggestionRecipeOf(
  draft: RecipeDraft,
  mode: 'admin',
): SuggestCatalogGuidanceRequest['recipe'];
export function suggestionRecipeOf(
  draft: RecipeDraft,
  mode: 'family',
): SuggestFamilyGuidanceRequest['recipe'];
export function suggestionRecipeOf(
  draft: RecipeDraft,
  mode: 'admin' | 'family',
): SuggestCatalogGuidanceRequest['recipe'] {
  const servings = validServings(draft.servings);
  const quantityOf = (text: string) => {
    const value = validQuantity(text);
    return text.trim() !== '' && value !== null
      ? Math.round(value * 1000) / 1000
      : null;
  };
  return {
    ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    ...(servings === null ? {} : { servings }),
    prepMinutes: null,
    cookMinutes: null,
    ...(mode === 'admin' ? { difficulty: null } : {}),
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
  } as SuggestCatalogGuidanceRequest['recipe'];
}
