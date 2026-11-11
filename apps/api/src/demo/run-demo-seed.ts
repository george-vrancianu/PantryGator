// CLI entry: DEMO_EMAIL=<email> DEMO_PASSWORD=<password> npm run demo:seed -w apps/api -- [--apply] [--today YYYY-MM-DD]
// (needs DATABASE_URL). Without --apply it is a dry run: everything is written, counted and rolled back.
// The account is never named in the code: the email and password come from the environment only.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../database/schema';
import { DemoSeedRefusedError, seedDemoAccount } from './seed-demo-account';

const USAGE =
  'Usage: DEMO_EMAIL=<email> DEMO_PASSWORD=<password> npm run demo:seed -w apps/api -- [--apply] [--today YYYY-MM-DD]';

try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
} catch {
  // No root .env: rely on the environment (CI, containers).
}

async function main(): Promise<number> {
  let values: { apply?: boolean; today?: string };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: { apply: { type: 'boolean' }, today: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 1;
  }
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    console.error(`DEMO_EMAIL and DEMO_PASSWORD are required.\n${USAGE}`);
    return 1;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required.');
    return 1;
  }

  const pool = new Pool({ connectionString });
  try {
    const report = await seedDemoAccount(drizzle(pool, { schema }), {
      email,
      password,
      today: values.today ?? new Date().toISOString().slice(0, 10),
      apply: values.apply ?? false,
    });
    const counts = Object.entries(report.counts)
      .map(([name, count]) => `  ${name}: ${count}`)
      .join('\n');
    console.log(
      [
        report.applied
          ? 'Demo account seeded.'
          : 'Dry run: nothing was saved (add --apply to save).',
        report.replacedExisting
          ? 'Replaces the previous Demo account.'
          : 'A new Demo account.',
        `Family: ${report.familyId}`,
        counts,
      ].join('\n'),
    );
    return 0;
  } catch (error) {
    if (error instanceof DemoSeedRefusedError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
