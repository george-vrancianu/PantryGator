# Pantry roll-up and search run client-side in wave 1

`docs/SPEC.md` says Pantry read endpoints return Batches grouped by Ingredient (totals, soonest expiry) and support Location filtering and search by localised name. Pantry management (issue #7, PR #36) instead returns plain Batches and does the roll-up and search in `apps/web/src/lib/pantry.ts`. The owner decided to keep it client-side for wave 1 and record the deviation here.

## Decision

- The API serves Batches; the web client groups and searches them.
- **Roll-up** is per Location section: within a Location, Batches of one Ingredient collapse into one row with quantity summed per unit and the soonest expiry date.
- **Mixed units are never converted.** An Ingredient with Batches in kg and pcs shows each unit total separately.
- **Search** is case and diacritic insensitive over the Ingredient's localised name and the Batch's Product Description.
- Coverage is unit tests (`rollUp`, search) and component tests, not API integration tests. The "Pantry grouping" API seam in the SPEC's Testing Decisions is therefore not exercised in wave 1.

## Consequences

- The planned Flutter app cannot reuse this logic. It must either reimplement it (and risk the two clients disagreeing on rounding, unit handling or search) or the logic moves server-side first.
- The API response shape is not the grouped shape the SPEC describes, so any other consumer gets raw Batches.
- Search only sees what the client has loaded, so it relies on the Pantry being fetched in full.

## Revisit

Before the Flutter client starts. Tracked in the issue "Move Pantry roll-up and search server-side before the Flutter client". Moving it server-side would supersede this ADR and restore the SPEC wording.

Update: the mobile apps package the web client with Capacitor (ADR 0036) and reuse this logic as it is, so they no longer require the move.
