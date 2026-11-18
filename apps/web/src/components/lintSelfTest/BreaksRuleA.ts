// Lint self-test fixture (scripts/check-lint-rules.mjs). Breaks Rule A on purpose:
// a shared component importing a page, once relatively and once through `@/`.
// The imported page does not exist on purpose (see BreaksRuleB.ts); tsc and move-map skip this folder.
// Not linted by `npm run lint` (it passes --ignore-pattern for this folder).
import { LintFixturePage as ViaAlias } from '@/pages/Recipes/LintFixturePage';
import { LintFixturePage as ViaRelative } from '../../pages/Recipes/LintFixturePage';

export const breaksRuleA = [ViaAlias, ViaRelative];
