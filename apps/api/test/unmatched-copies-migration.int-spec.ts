import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

// Migration 0053 backfills the Unmatched names of Recipe copies made before copies were queued
// (Add to Family, and the copies migration 0046 made). The enum half has already run on the test
// database, so each test replays only the INSERT inside a transaction that is rolled back.
const statements = readFileSync(
  resolve(process.cwd(), 'drizzle/0053_unmatched_voice_copies.sql'),
  'utf8',
)
  .split('--> statement-breakpoint')
  .map((statement) =>
    statement
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter((statement) => /^INSERT /i.test(statement));

const id = (n: number) =>
  `00000000-0000-4000-8000-0000000053${String(n).padStart(2, '0')}`;
const ids = {
  family: id(1),
  member: id(2),
  catalog: id(3),
  copy: id(4),
  archivedCopy: id(5),
  ownRecipe: id(6),
  queued: id(11),
  dismissed: id(12),
  fresh: id(13),
  matched: id(14),
  archivedLine: id(15),
  ownLine: id(16),
};

describe('Migration 0053: backfill Unmatched names of Recipe copies (integration)', () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(() => client.query('BEGIN'));
  afterEach(() => client.query('ROLLBACK'));

  const rows = async <T extends pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ) => (await client.query<T>(sql, params)).rows;
  const migrate = async () => {
    for (const statement of statements) await client.query(statement);
  };
  const entries = () =>
    rows<{
      ingredient_line_id: string;
      raw_name: string;
      normalized_name: string;
      locale: string;
      source: string;
      dismissed_at: Date | null;
    }>(
      `select ingredient_line_id, raw_name, normalized_name, locale, source, dismissed_at
       from unmatched_entries where ingredient_line_id = any($1) order by raw_name`,
      [Object.values(ids)],
    );

  async function seed() {
    await client.query(
      `insert into family (id, invite_code, invite_code_expires_at) values ($1, 'bf0053', now())`,
      [ids.family],
    );
    await client.query(
      `insert into "user" (id, name, email, email_verified, family_id, family_role, catalog_language)
       values ($1, 'Owner', 'backfill-0053@example.com', true, $2, 'owner', 'da')`,
      [ids.member, ids.family],
    );
    await client.query(
      `insert into recipes (id, title, servings, family_id, copied_from_id, archived_at) values
         ($1, 'Catalog', 2, null, null, null),
         ($2, 'Copy', 2, $5, $1, null),
         ($3, 'Old copy', 2, $5, $1, now()),
         ($4, 'Own', 2, $5, null, null)`,
      [ids.catalog, ids.copy, ids.archivedCopy, ids.ownRecipe, ids.family],
    );
    await client.query(
      `insert into recipe_ingredient_lines (id, recipe_id, position, raw_name, normalized_name) values
         ($1, $6, 0, 'Queued Spice', 'queued spice'),
         ($2, $6, 1, 'Dismissed Spice', 'dismissed spice'),
         ($3, $6, 2, 'Fresh Spice', 'fresh spice'),
         ($4, $7, 0, 'Archived Spice', 'archived spice'),
         ($5, $8, 0, 'Own Spice', 'own spice')`,
      [
        ids.queued,
        ids.dismissed,
        ids.fresh,
        ids.archivedLine,
        ids.ownLine,
        ids.copy,
        ids.archivedCopy,
        ids.ownRecipe,
      ],
    );
    await client.query(
      `insert into unmatched_entries (normalized_name, raw_name, locale, source, ingredient_line_id, dismissed_at) values
         ('queued spice', 'Queued Spice', 'en', 'recipe', $1, null),
         ('dismissed spice', 'Dismissed Spice', 'en', 'recipe', $2, now())`,
      [ids.queued, ids.dismissed],
    );
  }

  it('queues the Unmatched lines of live copies in the owner Catalog Language', async () => {
    await seed();
    await migrate();
    const fresh = (await entries()).find(
      (e) => e.ingredient_line_id === ids.fresh,
    );
    expect(fresh).toMatchObject({
      raw_name: 'Fresh Spice',
      normalized_name: 'fresh spice',
      locale: 'da',
      source: 'recipe',
    });
  });

  it('skips archived copies, Family-made Recipes and lines already queued', async () => {
    await seed();
    await migrate();
    const found = await entries();
    expect(found.map((e) => e.raw_name)).toEqual([
      'Dismissed Spice',
      'Fresh Spice',
      'Queued Spice',
    ]);
    // Existing rows are left as they were: locale untouched, dismissal kept.
    expect(found.find((e) => e.raw_name === 'Queued Spice')?.locale).toBe('en');
    expect(
      found.find((e) => e.raw_name === 'Dismissed Spice')?.dismissed_at,
    ).not.toBeNull();
  });

  it('is idempotent', async () => {
    await seed();
    await migrate();
    const once = await entries();
    await migrate();
    expect(await entries()).toEqual(once);
  });
});
