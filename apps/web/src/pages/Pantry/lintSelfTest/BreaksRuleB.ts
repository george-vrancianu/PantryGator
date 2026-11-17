// Lint self-test fixture (scripts/check-lint-rules.mjs). Breaks Rule B on purpose:
// a page importing another area's components, once relatively and once through `@/`.
// The two whole-page imports at the end must stay allowed.
// Not linted by `npm run lint` (it passes --ignore-pattern for this folder).
import { RecipeRow as ViaAlias } from '@/pages/Recipes/components/RecipeRow';
import { RecipeRow as ViaRelative } from '../../Recipes/components/RecipeRow';
import { RecipesPage as WholePageViaAlias } from '@/pages/Recipes/RecipesPage';
import { RecipesPage as WholePageRelative } from '../../Recipes/RecipesPage';

export const breaksRuleB = [
  ViaAlias,
  ViaRelative,
  WholePageViaAlias,
  WholePageRelative,
];
