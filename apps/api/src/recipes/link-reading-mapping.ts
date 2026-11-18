import { MAX_QUANTITY } from '../common/quantity';
import { confidentMatch } from '../scan/catalog-matching';
import type { LinkReading } from './link-reading.schemas';
import { MAX_LINES, MAX_STEPS, type LinkRecipeDraft } from './recipes.schemas';

/** What the mapping checks the model's ids against: the Family's Catalog scope. */
export type ReadingContext = {
  /** Ingredient id to its name in the Catalog Language, for the Family's scope. */
  ingredientNames: ReadonlyMap<string, string>;
  /** A Match below this confidence leaves the line Unmatched. */
  matchThreshold: number;
  /** Ingredient id to whose it is, for the Family pill; an id not in it reads as Catalog. */
  ingredientOwners?: ReadonlyMap<string, 'catalog' | 'family'>;
};

const NOTE_MAX = 200;
const NAME_MAX = 100;
const STEP_MAX = 2000;
const TITLE_MAX = 200;

const wholeNumber = (value: number | null, min: number, max: number) =>
  value !== null && Number.isFinite(value)
    ? (() => {
        const rounded = Math.round(value);
        return rounded >= min && rounded <= max ? rounded : null;
      })()
    : null;

const clean = (text: string | null) => (text ?? '').trim();

/** Quantity and unit are both set or both null; zero, negative or absurd quantities are dropped. */
function amountOf(line: LinkReading['ingredients'][number]) {
  if (line.quantity === null || line.unit === null) {
    return { quantity: null, unit: null };
  }
  const quantity = Math.round(line.quantity * 1000) / 1000;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    return { quantity: null, unit: null };
  }
  return { quantity, unit: line.unit };
}

/**
 * Turns a reading into the draft (ADR 0024). The model's judgment is checked
 * here, in our code: ids it invented or that fall outside the Family's Catalog
 * scope, and Matches it was unsure of, leave a line Unmatched; the original
 * amount joins the preparation note; guidance is never filled in.
 */
export function draftOfReading(
  reading: LinkReading,
  context: ReadingContext,
): LinkRecipeDraft {
  const lines: LinkRecipeDraft['lines'] = [];
  for (const line of reading.ingredients.slice(0, MAX_LINES)) {
    const name = clean(line.nameAsWritten).slice(0, NAME_MAX);
    const catalogName =
      confidentMatch(
        line.ingredientId === null
          ? null
          : (context.ingredientNames.get(line.ingredientId) ?? null),
        Math.min(1, Math.max(0, line.matchConfidence)),
        context.matchThreshold,
      ) ?? undefined;
    if (catalogName === undefined && name === '') continue;
    const note = [clean(line.originalAmount), clean(line.preparation)]
      .filter((part) => part !== '')
      .join(', ')
      .slice(0, NOTE_MAX);
    lines.push({
      ingredientId: catalogName === undefined ? null : line.ingredientId,
      rawName: catalogName === undefined ? name : null,
      ingredientName: catalogName ?? name,
      ingredientOwner:
        catalogName === undefined || line.ingredientId === null
          ? null
          : (context.ingredientOwners?.get(line.ingredientId) ?? 'catalog'),
      ...amountOf(line),
      optional: line.optional,
      note: note === '' ? null : note,
    });
  }

  const steps: LinkRecipeDraft['steps'] = [];
  for (const step of reading.steps) {
    const text = clean(step.text).slice(0, STEP_MAX);
    if (text === '' || steps.length >= MAX_STEPS) continue;
    const minutes = step.timerMinutes === null ? null : step.timerMinutes * 60;
    steps.push({ text, timerSeconds: wholeNumber(minutes, 1, 1_000_000) });
  }

  return {
    title: clean(reading.title).slice(0, TITLE_MAX),
    servings: wholeNumber(reading.servings, 1, 1000),
    prepMinutes: wholeNumber(reading.prepMinutes, 0, 100_000),
    cookMinutes: wholeNumber(reading.cookMinutes, 0, 100_000),
    difficulty: null,
    // Already ids of allowed Tags, deduped and capped (`tagIdsAt`); a read never makes a Tag.
    tagIds: reading.tagIds,
    lines,
    steps,
    tips: [],
    guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
  };
}
