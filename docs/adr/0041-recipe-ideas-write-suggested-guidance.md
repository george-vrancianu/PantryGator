# Recipe Ideas write Guidance too, marked as suggested

ADR 0024 kept Guidance (Pairings, Nutrition Note, Eating Moments) out of what an AI read fills in, and ADR 0035 kept that rule for Plate Scan's written Recipe: Guidance is left to Suggest Guidance (ADR 0026). For Recipe Ideas we reverse it. Writing the picked Idea also proposes its Guidance, so the Recipe Draft opens with it. Agreed while working through the Recipe Ideas map, ticket "What does Enhance keep from its base Recipe?", on 2026-11-14.

## Decision

- **Every picked Idea**, Variant or not, gets proposed Guidance in the same write-up call.
- **It behaves as Suggest Guidance already run.** Each field is marked as suggested, a field with nothing worth proposing stays empty, and once saved it is ordinary Guidance chosen by the Member who saved it.
- **No extra price.** It is part of the write-up's Credit, and it does not count against the Guidance Cap.
- **Nothing is copied from the starting Recipe.** The dish has changed, so its Pairings or Eating Moments may no longer fit.

## Considered options

- **Leave Guidance to Suggest Guidance** (the ADR 0024 / 0035 rule). Rejected: an Idea is made up from start to finish, so there is no source the Guidance could be mistaken for, and leaving it out costs the Member a second wait and a second tap.
- **Copy the starting Recipe's Guidance**, as Make Variant's prefill does. Rejected: the dish has changed.
- **Write it as ordinary, unmarked Guidance.** Rejected: the "suggested" marking is what keeps made-up text from looking hand-written (ADR 0008).
- **A separate Suggest Guidance charge.** Rejected: two prices for what the Member sees as one result, the reasoning ADR 0035 used against a separate "Suggest Steps".

## Consequences

- Plate Scan now differs from Recipe Ideas. Whether it should follow is tracked separately.
- Usage Records will show whether the longer write-up needs a higher Credit Price.
