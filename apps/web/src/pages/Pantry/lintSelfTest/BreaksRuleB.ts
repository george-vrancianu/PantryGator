// Lint self-test fixture (scripts/check-lint-rules.mjs). Breaks Rule B on purpose:
// a page importing another area's components, once relatively and once through `@/`.
// The two whole-page imports at the end must stay allowed.
// The imported modules do not exist on purpose: oxlint matches the raw string, and real targets
// would break typecheck when a move ticket relocates them. The folder is excluded from tsc
// (apps/web/tsconfig.json).
// Not linted by `npm run lint` (it passes --ignore-pattern for this folder).
import { LintFixtureOnly as ViaAlias } from '@/pages/Recipes/components/LintFixtureOnly';
import { LintFixtureOnly as ViaRelative } from '../../Recipes/components/LintFixtureOnly';
import { LintFixturePage as WholePageViaAlias } from '@/pages/Recipes/LintFixturePage';
import { LintFixturePage as WholePageRelative } from '../../Recipes/LintFixturePage';

export const breaksRuleB = [
  ViaAlias,
  ViaRelative,
  WholePageViaAlias,
  WholePageRelative,
];
