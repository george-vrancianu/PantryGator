# Background reads share one strip, and a link read becomes a Recipe Draft on the server

> Amended by [ADR 0035](0035-a-plate-scan-writes-a-recipe-draft.md): the link-read holder also holds Plate Scan picks being written as Recipe Drafts.

Voice Notes are read in the background behind a strip above the Dock (ADR 0025), and Scans carry on reading after the Member leaves the camera (ADR 0004), but nothing outside the Scan and Review screens shows them. Recipe from Link makes the Member wait on its own page, and leaving cancels the read. We let a link read run in the background like the others, and show Voice Notes, the Scan Session and link reads in the one strip the Voice Inbox already has. Prototyped on branch `prototype-cookbook-reading` (variant A). This amends ADR 0025 (the strip) and ADR 0028 (who creates a Recipe Draft from a link).

## Decision

- **The strip only shows what is there.** The Voice Inbox and the Scan Session keep their own rules, caps and Review. Link reads get their own holder in the app, in memory: at most 2 read at a time and 5 held. The Link Cap fails the read that reaches it and those waiting behind it, as the Scan Cap does. Like the other two holders, it reads through a module store outside the query cache, not through a page's mutation. Closing the sheet or refreshing the screen from the logo leaves its reads running. A finished read invalidates the Recipe Drafts query so "Drafts (N)" updates. Barcode Lookups never show, since they are answered at once.
- **The strip shows on every page with the Dock**, except the camera and the Review screens, which already show the Scan Session. With one item it shows that item's own copy and Review once it is ready. With several it shows "N in the background · 2 reading · 1 ready" and Open. The Scan Session counts as one item. When everything is ready the pill turns dark with a happy Gator. Each ready item buzzes, with no toast. A failure outlines the strip and is announced as an alert.
- **The sheet, "In the background",** has one row for the Scan Session (opening the Review overview, which already shows cards still reading), one row per Voice Note with "Review all (N)" as before, and one row per link read, newest first.
- **"From a link" is a sheet over Recipes, not a page.** On submit, a new lightweight check (by Source Link, using the server's own link normalisation) answers "Already in your Recipes" right in the sheet. Otherwise the sheet closes and the read joins the strip. A failed read keeps its row with Retry and Discard. When the page could not be read, it also offers "Paste text instead", which reopens the sheet in text mode with the link filled in. A failed read does not count against the Link Cap.
- **The server creates the Recipe Draft** inside the from-link request and returns its id, checking the 20-draft limit before the fetch, like the duplicate check. Review on a ready row opens the New Recipe editor on that Recipe Draft, and the row leaves at once. If the draft is already gone, the row says so and leaves.
- **A read lasts as long as its connection.** The server aborts the fetch and the AI call when the request closes, and creates no draft. Discarding a row that is still reading closes the request. The page asks before unloading while a link read is reading.
- **The wording stays "Recipes".** The prototype's CookBook rename is dropped. Its icons are kept: the open book on the Dock tab, and the reading art in the strip.

## Considered options

- **One holder for all background work.** Rejected: it would reopen the settled rules of ADR 0004 and ADR 0025 for no gain the Member sees. Only the indicator is shared.
- **Keep a finished link read in memory, or let the client create the Recipe Draft.** Rejected: a reload would lose a read the Link Cap had already counted, which is what ADR 0028 exists to stop.
- **Let a read finish after a disconnect, with a separate cancel call.** Rejected: two ways to stop a read instead of one, and a cancelled read could still turn up in Drafts.
- **A strip row for a duplicate link.** Rejected: the answer is free and immediate, so it belongs where the Member is still looking.
- **One row per Scan in the sheet.** Rejected: it repeats the Review overview.
- **A hero sheet with per-job bubbles (B), or a top island (C)**, the other prototype variants. The strip won because it grows from what Members already know.

## Consequences

- A cancel that arrives after the AI call has answered may still count against the Link Cap.
- The from-link endpoint now writes: every successful read leaves a Recipe Draft, kept for 30 days without an edit (ADR 0028).
- The `/recipes/from-link` page goes away, and links to it must open the sheet instead.

## Amendment (2026-11-16): the strip becomes the Gator bubble

- **The shared indicator is now a draggable Gator bubble** above the Dock instead of a strip (Canopy, `docs/handoffs/canopy/handoff.md` §9). Holders, caps, Review and "nothing changes until you apply" are unchanged. Only the indicator's form changes.
- **The bubble counts the Member's own Jobs on this device**, because the holders are in memory per device. It is hidden under Sheets and in the camera, and sits 16 above the bottom safe area on pages with no Dock.
- **Its sheet is titled "Review"**, with the groups Ready to review, Being read and Could not be read.
