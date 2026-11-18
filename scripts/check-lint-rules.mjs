#!/usr/bin/env node
// Proves the ADR 0044 import rules (Rule A and Rule B in .oxlintrc.json) still fire.
// Six fixtures (one per rule glob) break the rules on purpose; a misconfigured glob would let them pass
// silently, so this exits non-zero when a rule stops matching (or starts matching a
// whole-page import, which must stay allowed).
// Usage: node scripts/check-lint-rules.mjs
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// One fixture per `files` glob in .oxlintrc.json, so breaking any glob fails this script.
const fixtures = [
  ['A', 'apps/web/src/components/lintSelfTest/BreaksRuleA.ts'],
  ['A', 'apps/web/src/components/lintSelfTest/BreaksRuleA.tsx'],
  ['A', 'apps/web/src/lib/lintSelfTest/BreaksRuleA.ts'],
  ['A', 'apps/web/src/lib/lintSelfTest/BreaksRuleA.tsx'],
  ['B', 'apps/web/src/pages/Pantry/lintSelfTest/BreaksRuleB.ts'],
  ['B', 'apps/web/src/pages/Pantry/lintSelfTest/BreaksRuleB.tsx'],
];

const r = spawnSync(
  join(root, 'node_modules/.bin/oxlint'),
  ['-c', '.oxlintrc.json', '-f', 'json', ...fixtures.map(([, file]) => file)],
  { cwd: root, encoding: 'utf8' },
);
let diagnostics;
try {
  diagnostics = JSON.parse(r.stdout).diagnostics;
} catch {
  console.error(
    `oxlint gave no JSON (exit ${r.status}):\n${r.stdout}${r.stderr}`,
  );
  process.exit(1);
}

const restricted = diagnostics.filter((d) =>
  d.code.includes('no-restricted-imports'),
);
const errors = [];
for (const [rule, file] of fixtures) {
  const hits = restricted.filter((d) => d.filename.endsWith(file));
  const wrongRule = hits.filter((d) => !d.help?.startsWith(`Rule ${rule}`));
  // Two imports break the rule (relative and `@/`); the whole-page imports must not be flagged.
  if (hits.length !== 2 || wrongRule.length > 0) {
    errors.push(
      `Rule ${rule}: expected 2 "Rule ${rule}" errors in ${file}, got ${hits.length}` +
        (wrongRule.length ? ` (${wrongRule.length} from another rule)` : ''),
    );
  }
}
if (errors.length > 0) {
  console.error(`Import rule self-test failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(
  'Import rules fire on all fixtures; whole-page imports stay allowed.',
);
