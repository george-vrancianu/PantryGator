# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

Plain `gh issue view N`, `gh issue edit` and `gh pr edit` fail here with a "Projects (classic) is being deprecated" GraphQL error. Use the `--json` and `gh api` forms below.

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments --jq '{title, body, labels: [.labels[].name], comments: [.comments[].body]}'`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Children of a spec**: `gh issue list --state all --search '"Parent #<N>" in:body' --json number,title,state --jq '.[] | "\(.number) \(.state) \(.title)"'`. This repo links children with a `## Parent` section holding `#<N>`, not GitHub sub-issues.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh api -X POST repos/george-vrancianu/PantryGator/issues/<number>/labels -f 'labels[]=<label>'` / `gh api -X DELETE repos/george-vrancianu/PantryGator/issues/<number>/labels/<label>` (URL-encode spaces in the label name as `%20`). List current labels with `gh api repos/george-vrancianu/PantryGator/issues/<number>/labels --jq '.[].name'`.
- **Close with a comment**: `gh issue comment <number> --body "..."`, then `gh api -X PATCH repos/george-vrancianu/PantryGator/issues/<number> -f state=closed -f state_reason=completed`.
- **Read a PR**: `gh pr view <number> --json title,body,comments --jq ...` and `gh pr diff <number>` (`--name-only` for the file list).
- **Edit a PR body**: `gh api -X PATCH repos/george-vrancianu/PantryGator/pulls/<number> -F body=@body.md`. The body is replaced whole, so write the full text to the file first; never pass an empty file.

**Syntax checked, not run.** These write commands were not executed when this doc was written, so expect to adjust on first use: label POST/DELETE, the close PATCH, the assignees POST, `gh issue create`, `gh issue comment`, `gh pr comment`, `gh pr close`. The read commands and the PR-body PATCH were run.

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: see the Read a PR command above.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, the issue label endpoints above (a PR number works there), `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42 --json title` and fall back to `gh issue view 42 --json title`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run the **Read an issue** command above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh api -X POST repos/george-vrancianu/PantryGator/issues/<n>/assignees -f 'assignees[]=<login>'`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then close it (see **Close with a comment**), then append a context pointer (gist + link) to the map's Decisions-so-far.
