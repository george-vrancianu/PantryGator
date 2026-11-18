/**
 * The ways a Family with no Recipes can get its first one, in the order every empty state shows
 * them. `labelKey` is a `recipes` namespace key; `href` is the page each one opens. New Recipe
 * opens the header's "+" menu on the Recipes page, which is why the page may swap its `href`.
 */
export const FIRST_RECIPE_WAYS = [
  {
    id: 'explore',
    href: '/recipes/explore',
    labelKey: 'emptyFamily.explore',
  },
  {
    id: 'fromLink',
    href: '/recipes/from-link',
    labelKey: 'emptyFamily.fromLink',
  },
  {
    id: 'fromText',
    href: '/recipes/from-text',
    labelKey: 'emptyFamily.fromText',
  },
  {
    id: 'newRecipe',
    href: '/recipes/new',
    labelKey: 'emptyFamily.newRecipe',
  },
] as const;

export type FirstRecipeWay = (typeof FIRST_RECIPE_WAYS)[number];
