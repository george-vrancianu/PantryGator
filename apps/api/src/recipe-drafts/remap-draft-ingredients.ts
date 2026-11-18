import { sql } from 'drizzle-orm';
import type { Tx } from '../database/database.types';
import { recipeDrafts } from '../database/schema';

const texts = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::text`),
    sql`, `,
  );

/**
 * Re-points the Ingredients of every Recipe Draft from `sourceIds` to `targetId`:
 * the `ingredientId` of lines and the `linkTarget` of Ingredient-linked Guidance
 * Pairings. The merge deletes the sources, and a Recipe Draft left on a deleted
 * Ingredient would read back as an Unmatched name.
 *
 * A changed Recipe Draft gets a new version, so a form open on it elsewhere meets
 * a version conflict instead of silently writing the old Ingredient back, but
 * keeps its `updated_at`: the merge is not an edit, and must not extend its 30 days.
 */
export async function remapDraftIngredients(
  tx: Tx,
  targetId: string,
  sourceIds: string[],
): Promise<void> {
  if (sourceIds.length === 0) return;
  const sources = texts(sourceIds);
  const target = sql`to_jsonb(${targetId}::text)`;
  await tx.execute(sql`
    UPDATE ${recipeDrafts} d
    SET content = jsonb_set(
          jsonb_set(
            d.content,
            '{lines}',
            COALESCE((
              SELECT jsonb_agg(
                CASE WHEN l.line ->> 'ingredientId' IN (${sources})
                  THEN jsonb_set(l.line, '{ingredientId}', ${target})
                  ELSE l.line END
                ORDER BY l.pos)
              FROM jsonb_array_elements(d.content -> 'lines') WITH ORDINALITY AS l(line, pos)
            ), '[]'::jsonb)),
          '{guidance}',
          CASE WHEN jsonb_typeof(d.content -> 'guidance') = 'object'
            THEN jsonb_set(
              d.content -> 'guidance',
              '{pairings}',
              COALESCE((
                SELECT jsonb_agg(
                  CASE WHEN p.pairing ->> 'linkType' = 'ingredient'
                        AND p.pairing ->> 'linkTarget' IN (${sources})
                    THEN jsonb_set(p.pairing, '{linkTarget}', ${target})
                    ELSE p.pairing END
                  ORDER BY p.pos)
                FROM jsonb_array_elements(COALESCE(d.content #> '{guidance,pairings}', '[]'::jsonb))
                  WITH ORDINALITY AS p(pairing, pos)
              ), '[]'::jsonb))
            ELSE COALESCE(d.content -> 'guidance', 'null'::jsonb) END),
        version = d.version + 1,
        updated_at = d.updated_at
    WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(d.content -> 'lines', '[]'::jsonb)) x
        WHERE x ->> 'ingredientId' IN (${sources}))
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(d.content #> '{guidance,pairings}', '[]'::jsonb)) x
        WHERE x ->> 'linkType' = 'ingredient' AND x ->> 'linkTarget' IN (${sources}))`);
}
