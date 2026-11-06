# Coding standards

Rules reviewers keep flagging. Each has its reason.

- **Toasts and Undo toasts are polite live regions (`role="status"`), not alerts.** `ToastProvider` defaults to `role="alert"`; pass `polite: true` in the toast options to get `status`. An alert interrupts the screen reader mid-sentence; a toast is information, not an emergency.
- **Tests use fake timers (`vi.useFakeTimers`), never real waits or `setTimeout` sleeps.** Real waits make suites slow and flaky under load.
- **Snapshots and date assertions never depend on today's date.** Pin the clock with fake timers or pass fixed dates, or the test breaks the day after it is written.
- **A component used by more than one page lives in `apps/web/src/components`.** Page-local copies drift apart; `pages/<Page>/components` is for single-page code only.
- **Undo reverses only what the action created.** Reversing more deletes Member data the action never touched.
- **New copy goes in en, ro and da, with ro plural forms (`_one`, `_few`, `_other`; `_few` covers 0, fractions, and counts whose last two digits are 01-19 except 1 itself (0, 2-19, 101-119, ...; 20, 100 and 120 are `_other`)), using `GLOSSARY.md` terms.** A missing locale shows raw keys, and without `_few` Romanian counts such as 0 or 12 read wrongly.
- **Gator speaks only where Gator is drawn.** Copy beside a Gator image may use Gator's first person ("I spotted 6 things!"); toasts, empty states and errors elsewhere keep the app's plain voice, and Gator's lines name only real features. Spoken Siri replies and permission prompts name the app, PantryGator.
- **Inside a `Sheet` or `Dialog`, never focus a field that is present when it opens: no `autoFocus` and no focusing in `onEntered`. Pass `initialFocus` instead.** Below `md`, `initialFocus` keeps a text field unfocused so the phone keyboard does not jump the sheet while it slides in (ADR 0039). `initialFocus` never moves focus the Member has already moved to a control inside the sheet; with no target, focus goes to the sheet's surface. A field revealed by the Member's tap inside an open sheet may take focus.
- **Lint with the right tool: `oxlint` in `apps/web` and `packages/ui` (shared config `.oxlintrc.json` at the root), eslint in `apps/api`.** Running the wrong one passes silently or reports nothing; use `npm run lint -w <workspace>`. Test files may not use `setTimeout`/`setInterval` (lint error): use `vi.useFakeTimers()`, `waitFor`/`findBy*`, or await the real promise. The pre-commit hook lints staged files first (`lint-staged.config.mjs`).
