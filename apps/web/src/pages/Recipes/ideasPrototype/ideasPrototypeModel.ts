/**
 * PROTOTYPE (throwaway, ticket "Recipe Ideas page: options, layout and pre-selection").
 * The shared, in-memory model behind the three layout variants: real Pantry and Recipe reads,
 * fake Idea rounds and fake write-ups. Nothing is sent to the API and no Credits are spent.
 */
import { useMemo, useState } from 'react';
import {
  daysUntil,
  isExpiringSoon,
  rollUp,
  useBatches,
} from '../../../lib/pantry';
import { useRecipes, type RecipeListItem } from '../../../lib/recipes';
import { useStaleThresholdDays } from '../../../lib/settings';

export const WISH_MAX = 200;
export const ROUND_PRICE = 1;
export const WRITE_PRICE = 1;

/** Where the Member came in from: decides what the page pre-selects. */
export type EntryPoint = 'pantry' | 'pantry-expiring' | 'recipes' | 'recipe';
export const ENTRY_POINTS: Array<{ key: EntryPoint; label: string }> = [
  { key: 'pantry', label: 'Pantry' },
  { key: 'pantry-expiring', label: 'Pantry (Expiring pre-picked)' },
  { key: 'recipes', label: 'Recipes Gator card' },
  { key: 'recipe', label: 'Recipe page (Enhance)' },
];

export type PantryIngredient = {
  key: string;
  name: string;
  ingredientId: string | null;
  aisleId: string | null;
  aisleName: string;
  aisleOrder: number;
  expiringSoon: boolean;
  /** Days to the soonest unexpired expiry, null when none of its Batches has a date. */
  daysLeft: number | null;
};

export type IdeaStatus = 'new' | 'writing' | 'drafted';
export type Idea = {
  id: string;
  title: string;
  pitch: string;
  needs: string[];
  usesUp: string[];
  allergy: boolean;
  status: IdeaStatus;
};

/** The unexpired Pantry, one row per Ingredient: Expired Batches never count. */
function usePantryIngredients(): {
  items: PantryIngredient[];
  loading: boolean;
} {
  const batches = useBatches();
  const threshold = useStaleThresholdDays();
  const items = useMemo(() => {
    // oxlint-disable-next-line react/purity -- prototype
    const today = new Date();
    const live = (batches.data ?? []).filter(
      (batch) =>
        batch.expiryDate === null || daysUntil(batch.expiryDate, today) >= 0,
    );
    return rollUp(live).map((row): PantryIngredient => {
      const aisle = row.batches[0].aisle;
      const daysLeft = row.soonestExpiry
        ? daysUntil(row.soonestExpiry, today)
        : null;
      return {
        key: row.key,
        name: row.name,
        ingredientId: row.ingredientId,
        aisleId: row.aisleId,
        aisleName: aisle?.name ?? 'Other',
        aisleOrder: aisle?.sortOrder ?? 999,
        daysLeft,
        expiringSoon: daysLeft !== null && isExpiringSoon(daysLeft, threshold),
      };
    });
  }, [batches.data, threshold]);
  return { items, loading: batches.isPending };
}

/** Starting points: exactly where Make Variant shows, so no Family-own Base Recipes. */
function useStartingPoints(): RecipeListItem[] {
  const recipes = useRecipes(
    { search: '', tagIds: [] },
    { includeVariants: true },
  );
  return useMemo(
    () =>
      (recipes.data?.recipes ?? []).filter(
        (recipe) =>
          !(
            recipe.owner === 'family' &&
            recipe.parentId === null &&
            recipe.copiedFromId === null
          ),
      ),
    [recipes.data],
  );
}

export function groupByAisle(items: PantryIngredient[]) {
  const groups = new Map<
    string,
    { name: string; order: number; items: PantryIngredient[] }
  >();
  for (const item of items) {
    const group = groups.get(item.aisleName) ?? {
      name: item.aisleName,
      order: item.aisleOrder,
      items: [],
    };
    group.items.push(item);
    groups.set(item.aisleName, group);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

const EXTRAS = [
  'lemon',
  'parsley',
  'garlic',
  'chili',
  'feta',
  'basil',
  'ginger',
  'lime',
];
const DISHES = [
  'frittata',
  'traybake',
  'stir-fry',
  'soup',
  'pasta bake',
  'salad',
  'fritters',
  'curry',
  'risotto',
  'wraps',
  'gratin',
  'hash',
];
const TWISTS = [
  'smoky',
  'crispy',
  'lemony',
  'spicy',
  'herby',
  'creamy',
  'garlicky',
  'one-pan',
];

let ideaSeq = 0;

/** A fake round: 6–8 Ideas (or none when the Wish says "nothing"), avoiding titles already shown. */
function fakeRound(input: {
  pool: PantryIngredient[];
  mustUse: PantryIngredient[];
  base: RecipeListItem | null;
  wish: string;
  shownTitles: Set<string>;
}): Idea[] {
  if (/nothing/i.test(input.wish) || input.pool.length === 0) return [];
  const count = 6 + Math.floor(Math.random() * 3);
  const ideas: Idea[] = [];
  const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  for (let tries = 0; ideas.length < count && tries < 60; tries++) {
    const main =
      input.mustUse.length > 0
        ? input.mustUse
        : [pick(input.pool), pick(input.pool)];
    const names = [...new Set(main.map((i) => i.name))];
    const twist = pick(TWISTS);
    const title = input.base
      ? `${twist[0].toUpperCase()}${twist.slice(1)} ${input.base.title} with ${names[0].toLowerCase()}`
      : `${twist[0].toUpperCase()}${twist.slice(1)} ${names.slice(0, 2).join(' & ').toLowerCase()} ${pick(DISHES)}`;
    if (input.shownTitles.has(title) || ideas.some((i) => i.title === title))
      continue;
    const needs =
      Math.random() < 0.5
        ? []
        : [...new Set([pick(EXTRAS), pick(EXTRAS)])].slice(
            0,
            1 + Math.floor(Math.random() * 2),
          );
    const usedNames = new Set(names);
    const usesUp = input.pool
      .filter(
        (i) => i.expiringSoon && (usedNames.has(i.name) || Math.random() < 0.3),
      )
      .map((i) => i.name)
      .slice(0, 2);
    ideas.push({
      id: `idea-${++ideaSeq}`,
      title,
      pitch: input.base
        ? `Swaps in ${names.join(', ').toLowerCase()} and goes ${twist}.`
        : `A ${twist} weeknight dish built on ${names.join(', ').toLowerCase()}.`,
      needs,
      usesUp,
      allergy: Math.random() < 0.12,
      status: 'new',
    });
  }
  // Ideas that use Expiring Soon Ingredients come first.
  return ideas.sort((a, b) => b.usesUp.length - a.usesUp.length);
}

export type RoundState = 'idle' | 'thinking' | 'done';

/** Everything a variant needs: the inputs, the pre-selection for the entry point, and the fake rounds. */
export function useIdeasPrototype(entry: EntryPoint, baseParam: string | null) {
  const { items, loading } = usePantryIngredients();
  const startingPoints = useStartingPoints();

  const [wish, setWishRaw] = useState('');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [baseId, setBaseId] = useState<string | null | undefined>(undefined);
  const [skipOwn, setSkipOwn] = useState(true);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [round, setRound] = useState<RoundState>('idle');
  const [moreExhausted, setMoreExhausted] = useState(false);
  const [emptyRound, setEmptyRound] = useState(false);
  const [askedWith, setAskedWith] = useState<string | null>(null);
  const [spent, setSpent] = useState(0);
  const [rounds, setRounds] = useState(0);

  // Pre-selection, applied until the Member changes it.
  const preSelected = useMemo(
    () =>
      entry === 'pantry-expiring'
        ? new Set(items.filter((i) => i.expiringSoon).map((i) => i.key))
        : new Set<string>(),
    [entry, items],
  );
  const effectiveSelected = selected ?? preSelected;
  const preBase =
    entry === 'recipe'
      ? (startingPoints.find((r) => r.id === baseParam) ??
        startingPoints[0] ??
        null)
      : null;
  const base =
    baseId === undefined
      ? preBase
      : (startingPoints.find((r) => r.id === baseId) ?? null);

  const inputsKey = JSON.stringify([
    wish.trim(),
    [...effectiveSelected].sort(),
    base?.id ?? null,
  ]);
  const changedSinceAsk = askedWith !== null && askedWith !== inputsKey;

  const run = (mode: 'replace' | 'more') => {
    setRound('thinking');
    setEmptyRound(false);
    const shownTitles = new Set(
      mode === 'more' ? ideas.map((i) => i.title) : [],
    );
    window.setTimeout(() => {
      const next = fakeRound({
        pool: items,
        mustUse: items.filter((i) => effectiveSelected.has(i.key)),
        base,
        wish,
        shownTitles,
      });
      if (next.length > 0) {
        setSpent((s) => s + ROUND_PRICE);
        setRounds((r) => r + 1);
      }
      setIdeas((prev) => (mode === 'more' ? [...prev, ...next] : next));
      setEmptyRound(next.length === 0);
      setMoreExhausted(mode === 'more' && next.length === 0);
      setAskedWith(inputsKey);
      setRound('done');
    }, 1400);
  };

  const write = (id: string) => {
    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'writing' } : i)),
    );
    setSpent((s) => s + WRITE_PRICE);
    window.setTimeout(
      () =>
        setIdeas((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: 'drafted' } : i)),
        ),
      2500,
    );
  };

  const toggle = (key: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  return {
    loading,
    items,
    startingPoints,
    wish,
    setWish: (value: string) => setWishRaw(value.slice(0, WISH_MAX)),
    selected: effectiveSelected,
    toggle,
    selectAll: (keys: string[]) =>
      setSelected(new Set([...effectiveSelected, ...keys])),
    clearSelection: () => setSelected(new Set()),
    base,
    setBaseId: (id: string | null) => setBaseId(id),
    skipOwn,
    setSkipOwn,
    ideas,
    round,
    emptyRound,
    moreExhausted,
    changedSinceAsk,
    /** Ask (first time, or after changing the Wish / selection / start: replaces the list). */
    ask: () => run('replace'),
    more: () => run('more'),
    startOver: () => {
      setIdeas([]);
      setRound('idle');
      setAskedWith(null);
      setEmptyRound(false);
      setMoreExhausted(false);
    },
    write,
    debug: {
      entry,
      selectedCount: effectiveSelected.size,
      base: base?.title ?? '—',
      skipOwn,
      wishLength: wish.length,
      ideas: ideas.length,
      rounds,
      spent,
    },
  };
}

export type IdeasPrototype = ReturnType<typeof useIdeasPrototype>;
