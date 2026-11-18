import { normalizeName } from '@/lib/normalizeName';
import type { CategoryOption, CategoryOptions } from '@/lib/settings';

/** Used when neither an override nor a Catalog default exists. */
export const DEFAULT_START_DAYS = 7;
export const MIN_DAYS = 1;
/** The API limit for an override. */
export const MAX_DAYS = 3650;
/** The five quick picks: 3 d, 5 d, 1 wk, 2 wk, 1 mo. */
export const QUICK_PICK_DAYS = [3, 5, 7, 14, 30] as const;

/** Existing override, else the Catalog default, else seven days. */
export function startingDays(
  override: number | null | undefined,
  catalogDays: number | null | undefined,
): number {
  return override ?? catalogDays ?? DEFAULT_START_DAYS;
}

export type CategoryRef = {
  id: string;
  /** For a parent category, the parent's name. */
  name: string;
  parentName: string;
  /** A parent category: the override covers every category without its own. */
  wholeParent: boolean;
  catalogDays: number | null;
};

/** The parent itself (`leaf` omitted), or one of its leaves. */
function categoryRef(
  parent: CategoryOption,
  leaf?: CategoryOption,
): CategoryRef {
  const category = leaf ?? parent;
  return {
    id: category.id,
    name: category.name,
    parentName: parent.name,
    wholeParent: leaf === undefined,
    catalogDays: category.catalogDays,
  };
}

/** The category with this id, leaf or parent, with the parent it sits under. */
export function lookupCategory(
  options: CategoryOptions | undefined,
  id: string,
): CategoryRef | null {
  if (!options) return null;
  for (const parent of options.parents) {
    if (parent.id === id) return categoryRef(parent);
    const leaf = parent.leaves.find((candidate) => candidate.id === id);
    if (leaf) return categoryRef(parent, leaf);
  }
  return null;
}

export type CategoryRow = CategoryRef & {
  /** The Family's override for this category, if any. */
  override: number | null;
};

export type CategoryGroup = {
  parent: CategoryOption;
  rows: CategoryRow[];
};

/**
 * The pick list: categories grouped by parent, "All {parent}" first in each group. A query matches
 * on a category's name or its parent's name; a parent-name match keeps the whole group. Groups with
 * no match are dropped. With `leavesOnly` there are no "All {parent}" rows.
 */
export function groupCategories(
  options: CategoryOptions | undefined,
  query: string,
  overrides: Readonly<Record<string, number>>,
  leavesOnly = false,
): CategoryGroup[] {
  if (!options) return [];
  const needle = normalizeName(query);
  const matches = (text: string) =>
    needle === '' || normalizeName(text).includes(needle);

  const row = (category: CategoryRef): CategoryRow => ({
    ...category,
    override: overrides[category.id] ?? null,
  });

  const groups: CategoryGroup[] = [];
  for (const parent of options.parents) {
    const parentMatches = matches(parent.name);
    const rows: CategoryRow[] = [];
    if (parentMatches && !leavesOnly) rows.push(row(categoryRef(parent)));
    for (const leaf of parent.leaves) {
      if (!parentMatches && !matches(leaf.name)) continue;
      rows.push(row(categoryRef(parent, leaf)));
    }
    if (rows.length > 0) groups.push({ parent, rows });
  }
  return groups;
}
