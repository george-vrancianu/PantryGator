# Codebase map

npm workspaces monorepo (Node >= 24, see `.nvmrc`). Run `npm ci` once per worktree. Read `GLOSSARY.md` for domain terms and `CODING_STANDARDS.md` for review rules.

## Workspaces

| Path          | What                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `apps/api`    | NestJS on Fastify, Drizzle ORM, Postgres                                          |
| `apps/web`    | React + Vite + react-i18next, TanStack Query                                      |
| `packages/ui` | Design system on MUI, Storybook, imported as `@pocket-pantry/ui`                  |
| `apps/mobile` | Capacitor iOS and Android apps packaging the web build (ADR 0036); see its README |

Which linter each workspace uses: `CODING_STANDARDS.md`.

Root `package.json` fans out `lint`, `typecheck`, `test`, `build` to every workspace. CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, build and the migration check (`npm run check:migrations`) against a Postgres service. Pre-commit hooks: `.husky/pre-commit` (lint-staged: `lint-staged.config.mjs` lints staged files, then Prettier; then typecheck).

## API (`apps/api`)

- One folder per module in `apps/api/src/` (`pantry`, `shopping`, `recipes`, `voice`, ...), each with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.schemas.ts`. Register new modules in `apps/api/src/app.module.ts`.
- Unit specs sit beside the code as `*.spec.ts`.
- Integration tests live in `apps/api/test/*.int-spec.ts` (real Postgres via `TEST_DATABASE_URL`; config `apps/api/test/jest-integration.config.mjs`). Helpers: `apps/api/test/support/`.
- Schema: `apps/api/src/database/schema.ts`. Migrations: `apps/api/drizzle/NNNN_name.sql` plus `apps/api/drizzle/meta/_journal.json` and a snapshot. Generate with `npm run db:generate -w apps/api`; never hand-number a file, because parallel branches collide on the next number.
- Voice: handlers in `apps/api/src/voice/handlers/`, registry in `voice-handlers.registry.ts`.
- Tags: `apps/api/src/tags/recipe-tags.ts` (loading Tags onto Recipe reads, checking and writing a Recipe's `tagIds` with the 10-Tag cap, the pickable Tags for the editors, copying Tags), Manage Tags (`manage-family-tags.service.ts`, routes `/api/recipes/tags/family|restore|:id`) and the `tag_groups`, `tags`, `recipe_tags` tables.

## Web (`apps/web/src`)

- Layout rules are in ADR 0044. Areas are moving to them one at a time, so older areas still have flat files, tests at the page root, and some shared code used by one page only. New files follow the ADR.
- One deliberate exception to "pages sit flat": Shopping's Template pages (`TemplatesPage`, `TemplateEditorPage`) sit in `pages/Shopping/templates/` with their Template parts.
- `pages/<Area>/` holds one feature area each (some areas have several pages, one page per file), with its own `components/` and `hooks/` for code only that area uses. Page tests sit beside the page; a component's test sits in its folder (`components/Foo/Foo.test.tsx`).
- `components/` holds anything used by two or more page areas, grouped by GLOSSARY concept (`recipe/`, `pantry/`, `layout/`, ...), with feature groups such as `voice/` and `catalogSearch/` kept together. The atomic tiers apply only in `packages/ui`. Tags on Recipe rows: `RowTags` (the 2 chips, "+N" and Level line) and `TagChips` (the full list); the `TagChip` itself is in `packages/ui`.
- `components/layout/` is the shared layout: `LayoutFrame` (top bar, header and the one scrolling sheet, page transitions, pull-to-refresh) and `Screen`, which every in-layout page renders to fill those regions. The window never scrolls: use `useScroller()` (`lib/scroller.tsx`) instead of `window.scrollTo/scrollBy/scrollY`. `lib/layoutKind.ts` says which route is a camera, editor or page, and which are Dock tab roots (`isRecipeEditor` is shared with `lib/dockState.ts`).
- Cross-page tests: a `*.test.*` file under `components/` or `lib/` may import pages (ADR 0044 amendment), so a test of behaviour across several pages sits beside the shared module it checks (`components/layout/LayoutFrame/RefreshScreen.test.tsx`). Non-test shared files still never import pages.
- Import alias and rules (ADR 0044): `@/` maps to `apps/web/src` (tsconfig `paths`, no `baseUrl`; Vite 8 reads it, so tests and `vi.mock('@/lib/...')` resolve it too). Imports inside a page area stay relative; everything else should use `@/`. Existing imports are rewritten one area at a time by the move PRs. oxlint `no-restricted-imports` (error, in `.oxlintrc.json`) enforces two rules: **Rule A**, `components/` and `lib/` never import `pages/`; **Rule B**, nothing imports another area's `components` or `hooks` (a whole-page import across areas is allowed). Rule B lists every page area by name (oxlint globs have no braces), so a new `pages/Foo/` needs its `components`/`hooks` pattern pair added to all three overrides; the self-test cannot notice a missing area or a mistyped area pattern. Until an area moves its modules into `components/` or `hooks/`, modules at its root or in other subfolders (such as `Dashboard/widgets/`) are not protected by Rule B. `vi.mock` and `vi.importActual` strings are not checked by the rules; reviewers check them. Today's violators are in the `excludeFiles` of the first two overrides (each with the ticket that removes it); a move PR deletes its own entries. The globs start with `apps/web/` because they are relative to the root config, an override replaces the base rule's options (so the second and third overrides repeat Rule B), and the rule matches the raw import string (relative and `@/` need patterns). `import/no-cycle` is off (see the comment in `.oxlintrc.json`). The self-test fixtures import made-up modules (oxlint only reads the raw string), so moves cannot break them; `lintSelfTest/` folders are excluded from tsc (`apps/web/tsconfig.json`) and from the move map.
- Rule self-test: `npm run check:web-layout` (CI step) lints six fixtures that break the rules, one per `files` glob (`.ts` and `.tsx` in `components/lintSelfTest/`, `lib/lintSelfTest/`, `pages/Pantry/lintSelfTest/`; `npm run lint -w apps/web` ignores them), plus two shared-test fixtures (`AllowsPageInTest.test.fixture.ts` in `components/lintSelfTest/` and `lib/lintSelfTest/`) that must get 0 Rule A and exactly 1 Rule B, and fails if any rule glob stops matching or a whole-page import is flagged. It also runs the move-map tests.
- Move map: `npm run move-map -- <Area|group|path-prefix|all> [--all]` (`scripts/move-map.mjs`, repo root) prints `current<TAB>target<TAB>importers` for a page area or group, from the import graph (static imports, re-exports, `import()`, `vi.mock`). `<group>` in a target means a naming decision for the move PR. Run it at the start of every move PR. It is deleted with the last move.
- `lib/` holds non-visual logic: API client (`api.ts`), data hooks, the Voice Note module (`voiceNote.ts`), dates, amounts. `lib/tags.ts` holds the `RecipeTag` type and row ordering (`orderRowTags`, `splitRowTags`, `rowTagNames`).
- `test/` holds shared test helpers: `render.tsx` (render with providers), `voice.ts` (fake voice environment), `voiceDom.ts` (mock-free bubble and Review-sheet DOM helpers: use it when a test does not need the voice mocks; import `test/voice` FIRST when it does), `setup.ts` (vitest setup), plus per-feature helpers (`scan.ts`, `review.ts`, `mealPlans.ts`, `viewport.ts`, `scroll.ts`).
- i18n: `i18n/locales/{en,ro,da}/<namespace>.json`, one file per namespace, same names in all three. Wiring in `i18n/resources.ts`; API error codes map to copy in `i18n/translateApiError.ts`.

## UI package (`packages/ui/src`)

Atomic layout: `atoms/`, `molecules/` (includes `Sheet.tsx`, which also exports `SheetContainerProvider`, and `ToastProvider.tsx`), `organisms/`, `templates/`, `theme/`. Public exports go through `src/index.ts`. Stories sit beside components as `*.stories.tsx`; config in `packages/ui/.storybook/`. Test helpers: `packages/ui/src/test/`.

## Commands

Run from the repo root unless noted.

- Typecheck all: `npm run typecheck`; one workspace: `npm run typecheck -w apps/web`.
- Lint all: `npm run lint`; one workspace: `npm run lint -w apps/api`.
- Targeted web or ui test (`cd apps/web` or `cd packages/ui`): `npx vitest run --pool=forks --maxWorkers=2 <path-or-pattern>`. Vitest rejects `--poolOptions.forks.maxForks`. Run the full suite only when a ticket needs it.
- API unit: `npm run test:unit -w apps/api`.
- API integration (needs Postgres, `npm run db:up`): `npm run test:integration -w apps/api -- <pattern>` (the script caps workers itself; `--runInBand` is only for debugging).
- Grant Credits to a Family by hand (needs `DATABASE_URL`; never point it at a database you do not mean to change): `npm run credits:grant -w apps/api -- --family <family-uuid> --amount <positive whole number> --reason "<why>"`. Writes one `grant` Credit entry and prints the new Credit Balance; refuses a missing reason, a non-whole or non-positive amount and an unknown Family (exit 1, nothing written). Code: `apps/api/src/credits/grant/`.
- Storybook: `npm run storybook -w packages/ui`.
- Worktree create/remove helper: `scripts/worktree.sh` (see `docs/agents/worktrees-and-migrations.md`).
- Import rules self-test and move-map tests: `npm run check:web-layout`.
- Migration-number collision check: `npm run check:migrations` (`scripts/check-migrations.mjs`).
- `npm run dev` starts Postgres, migrates, and runs both apps; agents leave it to the human.

## Gotchas

- `SettingsAppearance` and `PantryHealthCluster` tests flake under load; rerun alone before calling a regression.
- Gh quirks are in `docs/agents/issue-tracker.md`.
