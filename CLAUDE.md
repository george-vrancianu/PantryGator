# Pocket Pantry

## Agent skills

### Issue tracker

Issues are tracked as GitHub Issues on `george-vrancianu/PantryGator` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root plus `docs/adr/`. See `docs/agents/domain.md`.

## Codebase

Where things live and the test, lint and typecheck commands: `docs/agents/codebase-map.md`. Read it before exploring.

Review rules (toasts, fake timers, shared components, Undo, i18n, lint tools): `CODING_STANDARDS.md`. Follow them when writing or reviewing code.

Worktrees, `scripts/worktree.sh`, and migration-number collisions (`npm run check:migrations`): `docs/agents/worktrees-and-migrations.md`. Read it before adding a migration or a worktree.
