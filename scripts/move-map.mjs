#!/usr/bin/env node
// Move map for ADR 0044 (web files live with the page that uses them).
// Builds the web import graph (static imports, re-exports, dynamic import(), vi.mock) and,
// for one page area or group, prints each module's current path, its target path under the
// ADR and the page areas that import it. Regenerate it at the start of every move PR; the
// script is deleted with the last move (#854).
//
// Usage (repo root): node scripts/move-map.mjs <Area|group|path-prefix|all> [--all] [--src <dir>]
//   Recipes            every module in pages/Recipes/ or moving into it
//   voice              every module in components/voice/ or moving into it
//   components/layout  a path prefix under apps/web/src
//   --all              also print modules that stay where they are
// Output: tab-separated `current<TAB>target<TAB>importers`, paths relative to apps/web/src.
// `<group>` in a target means the shared group is a naming decision for the move PR.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args.splice(i, i + 1 === args.length ? 1 : 2)[1] ?? true;
};
const srcArg = flag('--src');
const showAll = Boolean(flag('--all'));
const src = srcArg ?? join(root, 'apps/web/src');
const selector = args[0];
if (!selector) {
  console.error(
    'Usage: node scripts/move-map.mjs <Area|group|path-prefix|all> [--all] [--src <dir>]',
  );
  process.exit(1);
}

// Group folders that ADR 0044 renames or nests.
const GROUP_RENAMES = { background: 'backgroundRead', camera: 'scan/camera' };
// Shared modules whose group is already decided by the move tickets.
const GROUP_HINTS = {
  recipe: [
    'Servings',
    'RecipeRow',
    'RecipeFilters',
    'PantryStatus',
    'RowTags',
    'TagChips',
  ],
  pantry: [
    'ExpiryTag',
    'RunningLowChip',
    'LocationToggle',
    'LocationIcon',
    'UsualAmountRow',
  ],
  auth: ['AuthShell', 'LanguageSwitcher'],
  mealPlan: ['MealPlanPopover'],
  expiryPicker: ['ExpiryPicker'],
};
const GUARDS = [
  'RequireAuth',
  'RequireAdmin',
  'RedirectIfSignedIn',
  'IntroGate',
];

// ---- walk and parse -------------------------------------------------------
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts'))
      files.push(relative(src, full).split('\\').join('/'));
  }
})(src);
const fileSet = new Set(files);

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SPEC_RES = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  /\bvi\.(?:mock|doMock|importActual|importMock|unmock)\s*\(\s*['"]([^'"]+)['"]/g,
];
function resolve(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = posix.join(posix.dirname(from), spec);
  else return undefined;
  base = base.split('?')[0];
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ])
    if (fileSet.has(c)) return c;
  return undefined;
}
const importers = new Map(files.map((f) => [f, new Set()]));
for (const f of files) {
  const text = stripComments(readFileSync(join(src, f), 'utf8'));
  for (const re of SPEC_RES)
    for (const m of text.matchAll(re)) {
      const target = resolve(f, m[1]);
      if (target && target !== f) importers.get(target).add(f);
    }
}

// ---- classification -------------------------------------------------------
const isTest = (f) => /\.test\.tsx?$/.test(f);
const stemOf = (f) => basename(f).replace(/\.tsx?$/, '');
const areaOf = (f) => /^pages\/([^/]+)\//.exec(f)?.[1];
const isShared = (f) => f.startsWith('components/') || f.startsWith('lib/');
const label = (f) => areaOf(f) ?? (isShared(f) ? 'shared' : 'app');
const isPascal = (s) => /^[A-Z][A-Za-z0-9]*$/.test(s);
const isBarrel = (f) => /(^|\/)index\.tsx?$/.test(f);
const ownTest = (f, m) => isTest(f) && stemOf(f).split('.')[0] === stemOf(m);
const consumers = (m) =>
  [...importers.get(m)].filter((f) => !isTest(f) && !isBarrel(f) && f !== m);

const effectiveMemo = new Map();
function effective(m, visiting = new Set()) {
  if (effectiveMemo.has(m)) return effectiveMemo.get(m);
  if (visiting.has(m)) return new Set();
  visiting.add(m);
  const set = new Set();
  for (const c of consumers(m)) {
    if (areaOf(c)) set.add(areaOf(c));
    else if (isShared(c)) effective(c, visiting).forEach((a) => set.add(a));
    else set.add('app');
  }
  visiting.delete(m);
  effectiveMemo.set(m, set);
  return set;
}

const targetMemo = new Map();
function target(m, visiting = new Set()) {
  if (targetMemo.has(m)) return targetMemo.get(m);
  if (visiting.has(m)) return m;
  visiting.add(m);
  const t = computeTarget(m, visiting);
  visiting.delete(m);
  targetMemo.set(m, t);
  return t;
}

function placed(m, dir) {
  const stem = stemOf(m);
  const ext = m.slice(m.lastIndexOf('.'));
  if (ext === '.tsx' && isPascal(stem.split('.')[0]) && !isTest(m))
    return posix.join(dir, stem, basename(m));
  return posix.join(dir, basename(m));
}

const hinted = (m) =>
  Object.values(GROUP_HINTS).some((n) => n.includes(stemOf(m)));
function groupOf(m) {
  const stem = stemOf(m);
  for (const [g, names] of Object.entries(GROUP_HINTS))
    if (names.includes(stem)) return g;
  const first = /^components\/([^/]+)\//.exec(m)?.[1];
  if (first && !isPascal(first)) return GROUP_RENAMES[first] ?? first;
  return '<group>';
}

function computeTarget(m, visiting) {
  if (isBarrel(m)) return '(delete barrel)';
  if (isTest(m)) return testTarget(m, visiting);
  const inShared = m.startsWith('components/');
  const inAreaParts = /^pages\/[^/]+\/(components|hooks)\//.test(m);
  if (!inShared && !inAreaParts) return m;
  const stem = stemOf(m);
  if (inShared && GUARDS.includes(stem))
    return posix.join('routing', basename(m));

  // Already inside a component folder (Foo/Foo.tsx plus its parts): follow the main file.
  const pascalDir =
    /^(components|pages\/[^/]+\/(?:components|hooks))\/([A-Z][A-Za-z0-9]*)\/(.+)$/.exec(
      m,
    );
  if (pascalDir && stem !== pascalDir[2]) {
    const main = `${pascalDir[1]}/${pascalDir[2]}/${pascalDir[2]}.tsx`;
    if (fileSet.has(main))
      return posix.join(dirname(target(main, visiting)), pascalDir[3]);
  }

  const cons = consumers(m);
  if (cons.length === 0) return m;
  if (cons.some((c) => c.startsWith('lib/')))
    return posix.join('lib', basename(m));

  const sharedOnly = cons.every((c) => c.startsWith('components/'));
  // Modules already inside a feature group (voice/, background/, ...) stay in that group.
  const inGroup = inShared && groupOf(m) !== '<group>' && !hinted(m);
  if (hinted(m)) return placed(m, posix.join('components', groupOf(m)));
  if (inShared && !inGroup && sharedOnly && cons.length === 1) {
    const parent = target(cons[0], visiting);
    return placed(m, dirname(parent));
  }
  const areas = effective(m);
  if (areas.size === 1 && !areas.has('app')) {
    const [area] = areas;
    const hook = stem.startsWith('use');
    const base = `pages/${area}/${hook ? 'hooks' : 'components'}`;
    return hook ? posix.join(base, basename(m)) : placed(m, base);
  }
  return placed(m, posix.join('components', groupOf(m)));
}

function testTarget(t, visiting) {
  const stem = stemOf(t).split('.')[0];
  const subject = ['.tsx', '.ts']
    .map((e) => posix.join(posix.dirname(t), stem + e))
    .find((c) => fileSet.has(c) && !isTest(c));
  if (!subject || /^pages\/[^/]+\/[^/]+$/.test(subject)) return t;
  return posix.join(dirname(target(subject, visiting)), basename(t));
}

// ---- rows -----------------------------------------------------------------
const rows = files.map((f) => {
  const imp = [...importers.get(f)].filter(
    (i) => !ownTest(i, f) && !isBarrel(i),
  );
  // Page areas that reach the module, directly or through shared modules (`app` is the shell).
  const direct = imp.filter((i) => !isTest(i));
  const plain = [...effective(f)].sort();
  if (plain.length === 0 && direct.length) plain.push('shared');
  const tests = [...new Set(imp.filter(isTest).map(label))].sort();
  const parts = [];
  if (plain.length) parts.push(plain.join(', '));
  if (tests.length) parts.push(`tests: ${tests.join(', ')}`);
  return { current: f, target: target(f), importers: parts.join('; ') || '-' };
});

let prefixes = null;
if (selector !== 'all') {
  prefixes = selector.includes('/')
    ? [`${selector.replace(/\/$/, '')}/`]
    : [`pages/${selector}/`, `components/${selector}/`];
}
const inScope = (p) =>
  prefixes === null || prefixes.some((x) => p.startsWith(x));
const scoped = rows.filter((r) => inScope(r.current) || inScope(r.target));
const known =
  prefixes === null ||
  scoped.length > 0 ||
  prefixes.some((x) => existsSync(join(src, x))) ||
  files.some((f) => f.startsWith(`components/${selector}.`));
if (!known) {
  console.error(
    `No page area, group or path matches "${selector}" under ${src}`,
  );
  process.exit(1);
}
const moves = scoped.filter((r) => r.current !== r.target);
const shown = (showAll ? scoped : moves).sort((a, b) =>
  a.current.localeCompare(b.current),
);
console.log('current\ttarget\timporters');
for (const r of shown) console.log(`${r.current}\t${r.target}\t${r.importers}`);
console.error(
  `${moves.length} to move, ${scoped.length - moves.length} staying, for ${selector}` +
    (moves.length === 0 ? ' (nothing left to move)' : ''),
);
