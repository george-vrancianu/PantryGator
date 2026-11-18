# Web files live with the page that uses them; shared code is grouped by domain, each component in its own folder

`apps/web/src` drifted. An audit on 2026-11-17 found these problems:

- `components/` held 65 flat files, and about 20 of them were used by only one page area. Genuinely shared modules (`Servings`, `RecipeRow`, `RecipeFilters`, `PantryStatus`) sat inside `pages/Recipes` and were imported by Meal Plans.
- `components/RequireAuth` and `lib/dashboardLayout` imported from `pages/`.
- No component had its own folder. Tests sat at page roots and were named after behaviour (`SiriSwitch.test.tsx`), so a module's test couldn't be found from the module.
- 688 imports climbed three or more levels (`../../../`), so every move meant a mass edit.

We decided on one layout and a lint rule that keeps it true. The moves are planned area by area after the Sheet action work (#821) and the open ticket branches land.

## Decision

- **A module's place says who uses it.**
  - `components/` holds only modules imported by two or more page areas (`pages/<Area>`).
  - A module used by one area lives in `pages/<Area>/components/` (or `hooks/`).
  - A module used only by another shared module is a private sub-part inside that module's folder.
- **The atomic tiers (atoms, molecules, organisms, templates) apply only in `packages/ui`.** Those are app-agnostic pieces, sized by how they compose. Shared app code knows the domain, so `components/` is grouped by GLOSSARY concept instead: `recipe/`, `pantry/`, `shopping/`, `dashboard/`, `layout/` and so on.
  - A feature made of many parts stays together as one group: `voice/`, `catalogSearch/`, `scan/camera/`, `backgroundRead/`, `recipeEditor/`.
  - There is no `common/` folder. Something with no domain home and no app knowledge belongs in `packages/ui`.
- **Each component gets its own folder:** `RecipeRow/RecipeRow.tsx` with `RecipeRow.test.tsx` beside it, and no `index.ts`. Hooks and non-visual `.ts` files stay flat in `hooks/` or `lib/`, with their test beside them.
- **Pages sit flat at their area root, one page per file** (`pages/Recipes/RecipePage.tsx`, its test beside it).
  - The one exception is Shopping's Template pages (`TemplatesPage`, `TemplateEditorPage`), which sit in `pages/Shopping/templates/` with their Template parts (decided 2026-11-18).
- **A test lives beside what it renders:**
  - a page test beside the page;
  - a component test in the component's folder;
  - a test across several pages beside the shared module whose behaviour it checks.

  An existing test is never split just to fill folders. A page test that covers five components stays one page test.

- **Casing:**
  - group folders are lower camelCase (`catalogSearch/`);
  - component folders and page areas are PascalCase (`RecipeRow/`, `pages/Recipes/`).
- **Import rules:**
  - Imports inside a page area are relative. Everything else imports through the `@/` alias for `apps/web/src`.
  - A page may import another area's whole page (Intro's Setup flow renders the Review and Scan pages, ADR 0030).
  - Nothing outside `pages/X` imports `pages/X/components` or `pages/X/hooks`.
  - `components/` and `lib/` never import `pages/`. Route guards live in `src/routing/`.
  - Tests follow the same rules.
- **oxlint's `no-restricted-imports` enforces the import rules as an error.** Today's violators are listed as exclusions, and each move removes its own entries.

## Considered options

- **Atomic tiers inside `apps/web/src/components` too.** Rejected: an "organisms" folder would hold `VoiceReview` beside `RecipeRow`, which tells a reader nothing. App modules change with their domain concept, not with their size.
- **An `index.ts` per component folder.** Rejected: it is one more file per folder to keep by hand, go-to-definition lands on the barrel, and barrels can hide import cycles. Only two existed, and one was already bypassed.
- **Folders only for components that have a test or sub-parts.** Rejected: one rule beats "it depends", and an empty slot beside `Foo.tsx` shows at a glance that it has no test.
- **Move flat files first and add folders later.** Rejected: every file would move twice, doubling the conflicts with open branches.
- **One big move PR.** Rejected: dozens of worktrees and open branches would all have to rebase onto it at once. One PR per area lands each area when no open branch touches it.

## Consequences

- Until an area has moved, its files keep the old layout. New files follow this ADR from now on.
- Moving a test to a different folder depth breaks its relative `vi.mock` paths into `lib/`. Each move PR rewrites them to `@/lib/...`.
- The Dashboard widget registry is split: widget sizes go to `lib/`, name and icon go to `components/dashboard/` for Customise, and the type-to-component map stays in the Dashboard. This way `lib/` no longer imports a page.

## Amendment (2026-11-18): shared tests may import pages

A test under `components/` or `lib/` (`*.test.*`) may import pages, to check behaviour that spans several pages (pull-to-refresh, row hints, header actions, Canopy snapshots). The rule against `components/` and `lib/` importing `pages/` still holds for every non-test file. The carve-out lifts only that rule: such a test may still not import another area's `components/` or `hooks/`. It is an `excludeFiles` glob on the shared-code override in `.oxlintrc.json`, and `npm run check:web-layout` proves both halves (a shared non-test file importing a page still fails; a shared test importing a page does not).
