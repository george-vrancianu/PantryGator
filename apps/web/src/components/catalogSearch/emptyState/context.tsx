import { createContext, useContext } from 'react';
import type {
  CatalogAisle,
  CatalogScopeName,
  CatalogSearchResult,
} from '@/lib/catalog';

/**
 * What the enclosing CatalogSearch offers an empty-state block, so the block
 * drives the search instead of bypassing it. `CatalogSearch` provides it around
 * its `emptyState` and nowhere else; blocks read it with `useEmptyStateSearch`
 * and take no wiring from the host.
 */
export type EmptyStateSearch = {
  /** Picks an Ingredient through the search: the token, the field text and `onSelect`, like a typed pick. */
  select: (ingredient: CatalogSearchResult) => void;
  /** The search's scope, so a block lists the same Catalog the search reads. */
  scope: CatalogScopeName;
  /** Opens the aisle view in the search's own list; the search owns the view from there. */
  openAisle: (aisle: CatalogAisle) => void;
};

export const CatalogSearchEmptyStateContext =
  createContext<EmptyStateSearch | null>(null);

/** The enclosing search, or null outside one (a block then renders nothing). */
export const useEmptyStateSearch = () =>
  useContext(CatalogSearchEmptyStateContext);
