// Lint self-test fixture (scripts/check-lint-rules.mjs). Breaks Rule A on purpose:
// a shared component importing a page, once relatively and once through `@/`.
// Not linted by `npm run lint` (it passes --ignore-pattern for this folder).
import { RecipesPage as ViaAlias } from '@/pages/Recipes/RecipesPage';
import { RecipesPage as ViaRelative } from '../../pages/Recipes/RecipesPage';

export const breaksRuleA = [ViaAlias, ViaRelative];
