-- The new `voice` value is not used here: Postgres refuses to use an enum value added in the same
-- transaction, and drizzle runs every pending migration in one.
ALTER TYPE "public"."unmatched_source" ADD VALUE 'voice';--> statement-breakpoint
-- Recipe copies (Add to Family, and the copies migration 0046 made) never queued their Unmatched lines
-- the way Family saves do (source `recipe`). Backfill the names that came from the source line of a
-- live copy. A copy line without a queue row may instead have been made Unmatched by a Family deleting
-- its Family Ingredient: that name was discarded on purpose (ADR 0011) and is not queued, so a line
-- qualifies only if its source Recipe carries the same Unmatched name. Catalog lines are always
-- matched, so this is expected to find little or nothing. Archived copies are skipped.
-- Idempotent: a line that already has a queue row, open or dismissed, is skipped.
-- The locale is the Family owner's Catalog Language, else UI language, else 'en', as in 0046.
INSERT INTO "unmatched_entries" ("normalized_name", "raw_name", "locale", "source", "ingredient_line_id")
SELECT
  l."normalized_name",
  l."raw_name",
  COALESCE(
    (
      SELECT COALESCE(u."catalog_language", u."locale")
      FROM "user" u
      WHERE u."family_id" = r."family_id"
      ORDER BY (u."family_role" = 'owner') DESC, u."created_at" ASC, u."id" ASC
      LIMIT 1
    ),
    'en'
  ),
  'recipe',
  l."id"
FROM "recipe_ingredient_lines" l
INNER JOIN "recipes" r ON r."id" = l."recipe_id"
WHERE r."family_id" IS NOT NULL
  AND r."copied_from_id" IS NOT NULL
  AND r."archived_at" IS NULL
  AND l."ingredient_id" IS NULL
  AND l."raw_name" IS NOT NULL
  AND l."normalized_name" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "unmatched_entries" e WHERE e."ingredient_line_id" = l."id"
  )
  AND EXISTS (
    SELECT 1 FROM "recipe_ingredient_lines" s
    WHERE s."recipe_id" = r."copied_from_id"
      AND s."ingredient_id" IS NULL
      AND s."normalized_name" = l."normalized_name"
  )
ON CONFLICT DO NOTHING;
