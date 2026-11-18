import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { translateApiError } from '@/i18n/translateApiError';
import {
  localName,
  useAdminCatalog,
  type AdminLeafCategory,
  type AdminParentCategory,
  type CategoryKind,
} from '@/lib/admin';

export type AdminTab = 'review' | 'catalog' | 'codes';
const TABS: readonly AdminTab[] = ['review', 'catalog', 'codes'];
const TAB_PARAM = 'tab';
export type Editing =
  | { type: 'ingredient'; id: string | null }
  | { type: 'aisle'; id: string | null }
  | { type: 'recipe'; id: string | null }
  | { type: 'eatingMoment'; id: string | null }
  | { type: 'allergen'; id: string | null }
  | { type: 'tagGroup'; id: string | null }
  | { type: 'tag'; id: string | null }
  | { type: 'category'; kind: CategoryKind; id: string | null };

/** State of the Admin screen: loaded Catalog, the tab (kept in `?tab=`, To review by default), Ingredient filter, and which editor is open. */
export function useAdminScreen() {
  const { t, i18n } = useTranslation(['admin', 'errors']);
  const query = useAdminCatalog();
  const [params, setParams] = useSearchParams();
  const requested = params.get(TAB_PARAM);
  const tab = TABS.find((value) => value === requested) ?? 'review';
  const setTab = (next: AdminTab) => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set(TAB_PARAM, next);
        return copy;
      },
      { replace: true },
    );
  };
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const catalog = query.data;

  const ingredients = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (catalog?.ingredients ?? []).filter(
      (item) =>
        needle === '' ||
        localName(item, i18n.language).toLowerCase().includes(needle) ||
        item.name.toLowerCase().includes(needle),
    );
  }, [catalog, filter, i18n.language]);

  const editedIngredient =
    editing?.type === 'ingredient'
      ? catalog?.ingredients.find((item) => item.id === editing.id)
      : undefined;
  const editedAisle =
    editing?.type === 'aisle'
      ? catalog?.aisles.find((item) => item.id === editing.id)
      : undefined;
  const editedEatingMoment =
    editing?.type === 'eatingMoment'
      ? catalog?.eatingMoments.find((item) => item.id === editing.id)
      : undefined;
  const editedAllergen =
    editing?.type === 'allergen'
      ? catalog?.allergens.find((item) => item.id === editing.id)
      : undefined;
  const editedTagGroup =
    editing?.type === 'tagGroup'
      ? catalog?.tagGroups.find((item) => item.id === editing.id)
      : undefined;
  const editedTag =
    editing?.type === 'tag'
      ? catalog?.tags.find((item) => item.id === editing.id)
      : undefined;
  let editedCategory: AdminParentCategory | AdminLeafCategory | undefined;
  if (editing?.type === 'category' && catalog) {
    const list: Array<AdminParentCategory | AdminLeafCategory> =
      editing.kind === 'parent'
        ? catalog.parentCategories
        : catalog.leafCategories;
    editedCategory = list.find((item) => item.id === editing.id);
  }

  return {
    catalog,
    isLoading: query.isPending,
    error: query.error ? translateApiError(t, query.error) : null,
    tab,
    setTab,
    filter,
    setFilter,
    ingredients,
    editing,
    editedIngredient,
    editedAisle,
    editedCategory,
    editedTagGroup,
    editedTag,
    editedEatingMoment,
    editedAllergen,
    edit: setEditing,
    close: () => setEditing(null),
  };
}
