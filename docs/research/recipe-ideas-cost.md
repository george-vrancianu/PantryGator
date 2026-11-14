# What Recipe Ideas cost: one step or two?

Research note, 2026-11-14, for issue #793 (map #792). The question: compare the cost and latency of two designs for one Member journey, including one "More ideas" round.

- **(A) Two steps, as Plate Scan does.** List N short Ideas (title, one-line pitch, Ingredients used and missing), then write the picked one as a whole Recipe.
- **(B) One step.** Write M full Recipes (Ingredient Lines, Steps, Tips) up front.

Then: what Credit Price each design needs to stay in line with Plate Scan and Recipe from Link.

Provider prices were read on OpenAI's own pricing page on **2026-11-14**. Token counts are **estimates**. No Usage Record was queried, and the repo holds no measured token counts for Plate Scan writing, Recipe from Link or Suggest Guidance (see section 2). Latency figures rest on a stated assumption about speed, not on a provider figure. "~" marks my arithmetic.

## TL;DR

- **Output tokens drive the cost. Pantry size and the skip list barely matter.**
  - Going from 20 to 150 Pantry Ingredients and from 10 to 100 skipped titles adds under $0.001 per journey.
  - The text model charges 8x more for output than for input: gpt-5-mini is $0.25 per 1M input tokens and $2.00 per 1M output tokens.
  - The one big input is the **Ingredient Catalog** (~10k tokens). It goes into every call that writes a whole Recipe, so Ingredient Lines can name Catalog Ingredients by index.
- **(A) costs ~$0.010-0.013 per journey** at the assumed reasoning use: two Ideas rounds plus one written Recipe.
  - Each Ideas round is ~$0.002-0.003 and takes ~13-21 s.
  - Writing the picked Idea is ~$0.006 and ~23 s, the same call shape as Plate Scan writing. It can run in the background, as Plate Scan writing does (ADR 0035).
- **(B) costs ~$0.012 (M=1), ~$0.018 (M=2) or ~$0.024 (M=3) per journey.**
  - The Member waits for each round before seeing anything: ~23 s, ~44 s or ~66 s if the M Recipes are written in one call.
  - Writing them in M parallel calls brings the wait back to ~23 s, but sends the Catalog M times.
  - A Member who likes none of the Recipes still paid for M whole Recipes.
- **Credit Prices that stay in line with existing reads:** no money value is stated for a Credit anywhere (section 6), so the benchmark is what existing reads cost per Credit. That comes to **~$0.0035-0.006 per Credit**: Recipe from Link (page) is ~$0.007 for 2 Credits, and Plate Scan writing is ~$0.006 for 1 Credit.
  - **(A): 1 Credit per Ideas round, each "More ideas" included, plus 1 Credit to write the picked Idea** (the Plate writing price). A journey with one "More ideas" is 3 Credits for ~$0.010-0.013, so ~$0.0035-0.0043 per Credit, the same as a Link page read. With N up to 10 an Ideas round stays under 1 Credit's worth.
  - **(B): about 1-2 Credits per round for M=1, 2-3 for M=2, 2-4 for M=3.** A journey with one "More ideas" is then 2-4, 4-6 or 4-7 Credits.
- **Recommendation from the numbers: (A) with N=6-8.**
  - It costs less than half as much as B with M=3, and the first answer arrives 3-4x sooner.
  - A Member who rejects everything pays only for the cheap rounds, which is ADR 0035's argument for charging Plate Scan in two steps.
  - It reuses Plate Scan's writing call and price.

## 1. Model and settings used for recipe writing

- **Plate Scan writing, Recipe from Link and Suggest Guidance all call the text model** (`model: 'text'`).
  - Sources: `apps/api/src/scan/plate-scan.service.ts` (`writeRecipe`, `maxOutputTokens: 8000`), `apps/api/src/recipes/link-recipes.service.ts` (`maxOutputTokens: 8000`), `apps/api/src/recipes/guidance-suggestion.service.ts` (`maxOutputTokens: 4000`).
- **The text model is `gpt-5-mini` at reasoning effort `low`** unless the deployment overrides it.
  - Defaults: `DEFAULT_TEXT_MODEL = 'gpt-5-mini'` and `DEFAULT_TEXT_REASONING_EFFORT = 'low'` in `apps/api/src/config/env.ts`. The overrides are `AI_TEXT_MODEL` and `AI_TEXT_REASONING_EFFORT`.
  - The default provider is `openai`, called through the Responses API, with `store: false` and strict `json_schema` output (`apps/api/src/ai/structured-output-ai.service.ts`).
  - Temperature is sent only at effort `none`, so recipe writing runs without it.
  - With effort `low`, the service adds 2,000 tokens of reasoning headroom to the output limit (`REASONING_HEADROOM`).
- **The photo half of Plate Scan uses the vision model**, `gpt-6-luna` at effort `none` (`DEFAULT_VISION_MODEL`, `DEFAULT_REASONING_EFFORT` in `env.ts`). That call returns only up to 5 titles (`maxOutputTokens: 600`).
- **Provider prices**, from https://developers.openai.com/api/docs/pricing (redirected from platform.openai.com/docs/pricing), read 2026-11-14. USD per 1M tokens:

  | Model, tier | Input | Cached input | Output |
  | --- | --- | --- | --- |
  | gpt-5-mini, Standard | 0.25 | 0.025 | 2.00 |
  | gpt-5-mini, Batch or Flex | 0.125 | 0.0125 | 1.00 |
  | gpt-5-mini, Fast (formerly Priority) | 0.45 | 0.045 | 3.60 |
  | gpt-6-luna, Standard (≤272K input) | 0.10 | 0.01 | 0.50 |

  - These match the price table in code, `apps/api/src/usage/prices.ts` ("from the providers' list prices (2026-10)").
  - Reasoning tokens bill as output (the `prices.ts` comment).
- **gpt-5-mini is marked deprecated.** Its model page (https://developers.openai.com/api/docs/models/gpt-5-mini, read 2026-11-14) recommends GPT-5.6 Terra for new low-latency, high-volume work.
  - The page gives no speed figure.
  - It lists a 400k context window, 272k maximum input and 128k maximum output.
  - If Recipe Ideas ships on another text model, redo the arithmetic below with that model's prices.
- **Prompt caching** (https://developers.openai.com/api/docs/guides/prompt-caching, read 2026-11-14):
  - It is automatic, and it matches only an exact prefix: "Cache reuse requires the entire rendered prefix to match."
  - The guide says to put stable material first.
  - Minimum length: 1,024 tokens for GPT-5.6 and later; earlier models vary.
  - In the current Plate writing prompt, the dish title comes *before* the Catalog, so the Catalog is never a shared cached prefix.

## 2. How Usage Records store cost, and what measurements exist

- **One Usage Record per provider call** (ADR 0032; table `usage_record` in `apps/api/src/database/schema.ts`). Each record has:
  - `kind`: one of `scan`, `voice`, `assistant`, `link-page`, `link-text`, `plate-recipe`, `guidance`, `guidance-admin`;
  - `step`: `transcription` or `reading`;
  - `model`;
  - `input_tokens`, `output_tokens`, `cached_tokens`, `reasoning_tokens`;
  - `audio_seconds`;
  - `success`;
  - `cost_usd` (numeric 14,8), frozen at write time by `costUsd()` in `apps/api/src/usage/prices.ts`, which computes (input − cached) × input price + cached × cached price + output × output price.
- **Measured counts in the repo: none for recipe writing.** The only measured counts are for Scans on gpt-6-luna at effort low:
  - "~70-270 reasoning tokens per Scan" (`structured-output-ai.service.ts`);
  - "202 reasoning tokens of 297 output" for a Product Scan (`structured-output-ai.service.spec.ts`).
- The only size note relevant here: Recipe from Link's visible page text is capped at 30,000 characters, "about 7,500 tokens" (`apps/api/src/recipes/visible-text.ts`).
- **Before setting prices, confirm the estimates below against real Usage Records.** These two queries give the measured figures:
  - `kind = 'plate-recipe'`: input, output and reasoning tokens per Plate writing.
  - `kind = 'link-page'`: the same per Recipe from Link page read.

  This note did not run them; the task said not to touch a database.

## 3. Token estimates

### Inputs

| Piece | Tokens | Basis |
| --- | --- | --- |
| Ingredient Catalog text (`catalogPrompt`) | **~10,000** | The seeded Catalog is 775 Ingredients in 131 Leaf Categories. Rendered as the model sees it, it is 33,529 characters of JSON tuples `[index, name, category]`, measured by running the seed data through the same shape. At ~3-3.5 characters per token for short JSON strings that is ~9.5-11k. Romanian and Danish names run longer. A Family's own Ingredients add to it. |
| Allowed Tags list | ~300-600 | `[index, name]` tuples, assuming ~40-80 Tags. |
| Instructions plus JSON schema | ~700 (Ideas), ~800-1,200 (writing) | The size of the existing Plate writing prompt text and `plateRecipeJsonSchema`. |
| Pantry Ingredient names, as `[index, name]` | **20 → ~120; 60 → ~360; 150 → ~900** | Seed names average 10.9 characters; ~6 tokens per tuple. |
| "Skip these Recipes" titles | **10 → ~80; 100 → ~750** | ~7-8 tokens per quoted title. |
| A source Recipe, when making a Variant | ~600-1,200 | The size of one written Recipe, below. |

### Outputs

| Piece | Visible tokens | Basis |
| --- | --- | --- |
| Short Idea: title, one-line pitch, Pantry indexes used, missing names | **~60-100 (90 used)** | A sample Idea JSON is 203 characters, ~60-70 tokens. The 90 allows a longer pitch and more Ingredients. |
| Full Recipe in the Plate writing schema (`plateRecipeModelResultSchema`) | **~500-1,500 (1,000 used)** | Seed Catalog Recipes rendered in this schema: Chicken salad (13 lines, 5 Steps, 3 Tips) is 3,349 characters, ~1,000-1,100 tokens. Omelette (5 lines, 4 Steps) is 1,668 characters, ~500-550. Romanian adds ~5-15%. |
| Reasoning at effort `low` | **500 per call (central); 2,000 (high case)** | Not measured for gpt-5-mini on writing. 500 is a guess above the 70-270 measured for Scans on gpt-6-luna. 2,000 is the headroom the service already budgets. |

## 4. Cost and latency per Member journey

**Journey.** One round of Ideas or Recipes, one "More ideas" round, then the Member picks one.

- **(A)** is 2 Ideas calls plus 1 writing call.
  - The writing call takes the Plate writing prompt plus the Pantry and the Idea: ~11.3-12.2k in, ~1,500 out.
  - The "More ideas" call adds the N titles already shown to the skip list.
- **(B)** is 2 calls of M Recipes each, with the Catalog sent once per call; the pick costs nothing more.

**Prices.** gpt-5-mini Standard prices from section 1.

**Latency model**, an assumption with no provider figure: ~1 s to the first token, plus input at ~20k tokens/s, plus output at ~70 tokens/s. Calls are non-streamed structured output, so the Member waits for the whole answer. If decoding is 2x faster, halve the output part.

### Central case (500 reasoning tokens per call)

Ranges cover all six Pantry and skip-list sizes (20/60/150 Ingredients × 10/100 titles). The spread is only ~$0.001.

| Design | One round | Wait for the round | Journey with one "More ideas" |
| --- | --- | --- | --- |
| A, N=4 | $0.0019-0.0023 | ~13 s | **$0.0098-0.0107** (+ write ~23 s, in background) |
| A, N=6 | $0.0023-0.0027 | ~16 s | **$0.0105-0.0114** |
| A, N=8 | $0.0027-0.0030 | ~18-19 s | **$0.0112-0.0121** |
| A, N=10 | $0.0030-0.0034 | ~21 s | **$0.0119-0.0129** |
| B, M=1 | $0.0060-0.0063 | ~23 s | **$0.0119-0.0126** |
| B, M=2 | $0.0089-0.0093 | ~44 s | **$0.0179-0.0186** |
| B, M=3 | $0.0119-0.0123 | ~66 s | **$0.0239-0.0246** |

- **(A) when the Member picks nothing** costs only the rounds: ~$0.004-0.007.
- **(B) when the Member picks nothing** costs the whole journey.
- **(B) with M parallel one-Recipe calls:** the wait drops to ~23 s for any M, and cost rises by ~$0.0027 per extra call for the repeated Catalog.
- **(B) with the Catalog cached** in the "More ideas" call (Catalog moved to the front of the prompt, second call within the cache lifetime): ~$0.0026 less per journey.

### High-reasoning case (2,000 reasoning tokens per call)

- Plate writing becomes ~$0.0088 and ~44 s.
- (A) with N=4-10 becomes ~$0.019-0.021 per journey, with ~35-42 s per Ideas round.
- (B) rises by ~$0.006 per call per M, because the reasoning assumption is applied per Recipe.

The ratio between A and B holds, because reasoning lands on output in both.

### Reference reads, same assumptions

| Read | Credits today | Calls | ~Cost | ~Wait |
| --- | --- | --- | --- | --- |
| Plate Scan writing (`plate-recipe`) | 1 (`CREDIT_PRICE_PLATE_RECIPE`) | gpt-5-mini, ~11.2k in, ~1.5k out | **$0.0058** | ~23 s |
| Recipe from Link, page (`link-page`) | 2 (`CREDIT_PRICE_LINK_PAGE`) | gpt-5-mini, ~15-19k in (page text up to ~7.5k), ~1.6k out | **$0.0070-0.0079** | ~25 s |
| Plate Scan photo (`scan`) | 1 (`CREDIT_PRICE_SCAN`) | gpt-6-luna, effort none, ≤600 out | well under $0.001 (not estimated closely: image token count not checked) | short |

Credit Prices: `CREDIT_PRICE_*` in `apps/api/src/config/env.ts`, read in `apps/api/src/credits/credits.service.ts`. GLOSSARY "Credit Price".

## 5. Credit Price each design needs

The benchmark is money per Credit of existing reads:

- Plate Scan writing: **~$0.0058 per Credit**, the most per Credit of the existing reads;
- Recipe from Link (page): **~$0.0035-0.0040 per Credit**.

A price is "in line" if it lands in ~$0.0035-0.006 per Credit.

| Design | Journey cost | Credits for the journey at $0.0058/Credit … at $0.0035/Credit | Suggested price |
| --- | --- | --- | --- |
| A, N=4-10 | $0.010-0.013 | 1.7-2.2 … 2.8-3.7 | **1 per Ideas round (each "More ideas" included) + 1 to write** = 3. Each round is $0.002-0.003, under one Credit's worth at either rate. |
| B, M=1 | $0.012-0.013 | 2.1-2.2 … 3.4-3.6 | 1-2 per round |
| B, M=2 | $0.018-0.019 | 3.1-3.2 … 5.1-5.3 | 2-3 per round |
| B, M=3 | $0.024-0.025 | 4.1-4.2 … 6.8-7.0 | 2-4 per round (3 to match Link) |

- **Design A could reuse `CREDIT_PRICE_PLATE_RECIPE` for the writing step**: same call shape, same cost.
- **An Ideas round would need its own `CREDIT_PRICE_*`** (starting at 1), following the pattern in `apps/api/src/scan/paid-reads.service.ts`: "Adding a kind here is all it takes to charge it".
- **A Credit Price of 1 per Ideas round leaves margin up to N≈10** at central reasoning. At the high-reasoning case a round reaches ~$0.005-0.006, still about one Credit at the Plate writing rate.

## 6. What a Credit is worth

- **No money value for a Credit is stated anywhere** in GLOSSARY.md, ADR 0032, ADR 0034, ADR 0035, `docs/SPEC.md` or the code.
- Credits are only *granted*: a Welcome Grant or Promo Code of 100, or a Credit Grant by hand. There is no top-up or purchase yet (ADR 0032).
- The Credit Price is "set by the app and changed as Usage Records show what reads really cost" (GLOSSARY "Credit Price").
- So the comparison above is relative to existing reads. At ~$0.004-0.006 per Credit, a 100-Credit grant is ~$0.40-0.60 of model spend.

## 7. Notes for the design

- **The Catalog dominates the input of any call that writes Ingredient Lines.**
  - (A)'s Ideas call does not need it: Ideas can name Pantry Ingredients by index into the Pantry list, and missing Ingredients as plain names. That is why an Ideas round costs about a third of a writing call.
  - Putting the Catalog (and Tags) first in the writing prompt would let it be cached across calls. The current Plate prompt puts the dish title first. The cached Catalog would cost ~$0.00025 instead of ~$0.0025 per call, a ~40% cut of a writing call's cost. Only identical prefixes cache, so this works per Catalog Language and per Family's Ingredient set.
- **Abandonment.** In (A), a Member who likes none of the Ideas pays only for the Ideas rounds. In (B), they pay for M whole Recipes per round. ADR 0035 rejected one-price Plate Scan for the same reason ("a Member who dislikes the guesses should pay only for the photo").
- **Latency.** (A) shows Ideas in ~13-21 s. The write then runs in the background holder, like a Plate Scan pick (ADR 0031, ADR 0035). (B) makes the Member wait ~44-66 s for M=2-3 unless the calls run in parallel, and a parallel call sends the Catalog again each time.
- **Caveat.** Every token count here is an estimate from repo data and schemas. Replace them with the averages from the `plate-recipe` and `link-page` Usage Records before setting a price.
