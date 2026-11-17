# Running low and missing Staples are scored together as Supply

A Family flagged all 40 Ingredients in its Pantry Running low and still saw Pantry Health 82, with most bars green. Running low only reached the Staples Health Factor, only for Staples, at 0.6 credit. Staples carried 30%, so a Pantry about to run out of everything could lose at most 12 points. A Family with no Staples scored Staples 100 for nothing, and the Running low Health To-do never showed a gain because adding a Running low Staple to the Shopping List did not change its credit. We replaced Staples with Supply, which scores every Ingredient in stock as well as missing Staples, and gave it the largest weight. The target was that the 40-item Pantry should need attention (about 60) and recover once its Running low Ingredients are on the Shopping List (about 91).

## Decision

- **Supply replaces Staples.** It is the mean credit over one entry per Ingredient: every Ingredient with an unexpired Batch, plus every missing Staple that is not dismissed. An Ingredient that is both a Staple and Running low counts once. Unmatched Batches are left out, and so are non-Staple Ingredients whose Batches are all Expired, because Fresh already counts those.
- **Credit per Ingredient:**

  | State                                    | Credit |
  | ---------------------------------------- | ------ |
  | Stocked, not Running low                 | 1      |
  | Running low, on the Shopping List        | 0.8    |
  | Missing Staple, on the Shopping List     | 0.5    |
  | Running low, not on the Shopping List    | 0.1    |
  | Missing Staple, not on the Shopping List | 0      |

  Running low sits just above missing, because some is left. Adding the Ingredient to the Shopping List wins back most of its credit, but not all of it until it is restocked.

- **Weights: Fresh 30, Supply 45, Dated 10, Rotation 15** (previously Fresh 40, Staples 30, Dated 15, Rotation 15).
- **A Health Factor with nothing to measure is left out.** Its weight is shared among the others in proportion, instead of the factor scoring 100. Only Fresh (no dated Batches) and Supply (no Ingredient to judge) can be empty, because Dated and Rotation always have Batches once there is a score.
- The verdict cutoffs (85 and 65) are unchanged, and each factor's bar is still coloured by its own value. A Pantry that is fine except for Supply shows one wide red bar next to green ones.

## Considered Options

- **Running low for Staples only, as before.** Rejected. The flag is set by hand on one Ingredient at a time, so the Family already cares about every Ingredient it flags.
- **Supply as a fifth factor beside Staples.** Rejected. A missing Staple and a Running low Ingredient are the same problem at different stages, so two factors would overlap.
- **Keep the weights and cap the total by Supply.** Rejected. The bars would no longer add up to the score.
- **Empty factors scored at a neutral 50.** Rejected. It would punish a new Family for not having Staples yet.

## Consequences

- Fresh weighs less now, so a stocked Pantry whose dated Batches are all Expiring Soon scores higher than before (about 88). How lenient Expiring Soon and undated Batches are is a separate question.
- The factor key changes from `staples` to `supply`. Pantry Health is never stored, so there is nothing to migrate.

## Sources

Pantry Health and its Health To-dos are computed in the browser, in `apps/web/src/lib/health.ts`, from what the Dashboard already loads: the Pantry (Batches and the Running low flags), the Staples, the Shopping List and the Stale Threshold. `usePantryHealth` gathers them. The only thing taken from the Suggestions API is the `dismissed` ids, which hide a dismissed missing Staple from Supply and from the To-dos.

The Running low To-do is not the server's Running low Suggestion. The browser lists a flagged Ingredient only when it has an unexpired Batch and is not on the Shopping List. The API (`runningLowGroup` in `suggestions.service.ts`) accepts any Batch, expired or not, and then drops Ingredients already shown as a missing Staple or as Expired. So a flagged non-Staple Ingredient whose Batches are all expired and whose Expired Suggestion was dismissed shows as Running low on the server, but gives no Running low To-do. The Expired To-do already covers it. The two lists are not meant to match one for one.
