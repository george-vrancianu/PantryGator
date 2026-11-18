export type FirstRecipeWay = {
  id: 'explore' | 'fromLink' | 'fromText' | 'newRecipe';
  href: string;
  labelKey: string;
  linkLabelKey?: string;
  /** The one way drawn as the filled button in the full empty state. */
  emphasis?: 'primary';
};

/**
 * The ways a Family with no Recipes can get its first one, in the order every empty state shows
 * them. `labelKey` is a `recipes` namespace key; `href` is the page each one opens.
 * `linkLabelKey` is the label for a bare text link, where the button's leading "+" would read oddly.
 */
export const FIRST_RECIPE_WAYS: readonly FirstRecipeWay[] = [
  {
    id: 'explore',
    href: '/recipes/explore',
    labelKey: 'emptyFamily.explore',
    emphasis: 'primary',
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
    linkLabelKey: 'family.newRecipe',
  },
];
