// Lint self-test fixture (scripts/check-lint-rules.mjs). A shared `*.test.*` file may import pages
// (ADR 0044 amendment): the two page imports must NOT be flagged by Rule A.
// The last import still breaks Rule B (another area's components), so the carve-out only lifts Rule A.
// The imported modules do not exist on purpose (see pages/Pantry/lintSelfTest/BreaksRuleB.ts); tsc and move-map skip this folder.
// Not linted by `npm run lint` (it passes --ignore-pattern for this folder), and vitest does not run
// it (the name does not end in `.test.ts`).
import { LintFixturePage as ViaAlias } from '@/pages/Recipes/LintFixturePage';
import { LintFixturePage as ViaRelative } from '../../pages/Recipes/LintFixturePage';
import { LintFixtureOnly } from '@/pages/Recipes/components/LintFixtureOnly';

export const allowsPageInTest = [ViaAlias, ViaRelative, LintFixtureOnly];
