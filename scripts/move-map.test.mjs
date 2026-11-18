import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'move-map.mjs');

// files: { 'pages/Recipes/RecipesPage.tsx': "import ... " }
function run(files, args) {
  const src = mkdtempSync(join(tmpdir(), 'move-map-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(src, rel)), { recursive: true });
      writeFileSync(join(src, rel), body);
    }
    const r = spawnSync(process.execPath, [script, '--src', src, ...args], {
      encoding: 'utf8',
    });
    const rows = new Map();
    for (const line of r.stdout.split('\n')) {
      const cols = line.split('\t');
      if (cols.length === 3 && cols[0] !== 'current') {
        rows.set(cols[0], { target: cols[1], importers: cols[2] });
      }
    }
    return { status: r.status, out: r.stdout + r.stderr, rows };
  } finally {
    rmSync(src, { recursive: true, force: true });
  }
}

const comp = 'export const X = 1;\n';

test('a component used by two page areas moves up into a shared group, listing both importers', () => {
  const { rows, status } = run(
    {
      'pages/Recipes/components/Widget.tsx': comp,
      'pages/Recipes/RecipesPage.tsx': `import { X } from './components/Widget';\n`,
      'pages/MealPlans/MealPlanPage.tsx': `import { X } from '../Recipes/components/Widget';\n`,
    },
    ['Recipes'],
  );
  assert.equal(status, 0);
  const row = rows.get('pages/Recipes/components/Widget.tsx');
  assert.equal(row.target, 'components/<group>/Widget/Widget.tsx');
  assert.equal(row.importers, 'MealPlans, Recipes');
});

test('known shared modules get the group the move tickets decided', () => {
  const { rows } = run(
    {
      'pages/Recipes/components/Servings.tsx': comp,
      'pages/Recipes/RecipesPage.tsx': `import { X } from './components/Servings';\n`,
      'pages/MealPlans/MealPlanPage.tsx': `import { X } from '../Recipes/components/Servings';\n`,
    },
    ['Recipes'],
  );
  assert.equal(
    rows.get('pages/Recipes/components/Servings.tsx').target,
    'components/recipe/Servings/Servings.tsx',
  );
});

test('a component used by one page area moves down into that area', () => {
  const { rows } = run(
    {
      'components/QuickView.tsx': comp,
      'pages/Recipes/RecipesPage.tsx': `import { X } from '@/components/QuickView';\n`,
    },
    ['Recipes'],
  );
  const row = rows.get('components/QuickView.tsx');
  assert.equal(row.target, 'pages/Recipes/components/QuickView/QuickView.tsx');
  assert.equal(row.importers, 'Recipes');
});

test('re-exports, dynamic import() and vi.mock count as importers', () => {
  const { rows } = run(
    {
      'components/A.tsx': comp,
      'components/B.tsx': comp,
      'components/C.tsx': comp,
      'pages/Pantry/PantryPage.tsx': `export { X } from '../../components/A';\n`,
      'pages/Scan/ScanPage.tsx': `const B = () => import('@/components/B');\n`,
      'pages/Shopping/ShoppingPage.test.tsx': `vi.mock('../../components/C', () => ({}));\n`,
    },
    ['all', '--all'],
  );
  assert.equal(rows.get('components/A.tsx').importers, 'Pantry');
  assert.equal(rows.get('components/B.tsx').importers, 'Scan');
  assert.match(rows.get('components/C.tsx').importers, /tests: Shopping/);
});

test('an unknown area or group exits non-zero', () => {
  const { status } = run({ 'components/A.tsx': comp }, ['Nope']);
  assert.equal(status, 1);
});

test('a group is selected by its folder name and by modules moving into it', () => {
  const { rows } = run(
    {
      'components/voice/VoiceSheet.tsx': comp,
      'pages/Pantry/PantryPage.tsx': `import { X } from '@/components/voice/VoiceSheet';\n`,
      'pages/Shopping/ShoppingPage.tsx': `import { X } from '@/components/voice/VoiceSheet';\n`,
    },
    ['voice'],
  );
  assert.equal(
    rows.get('components/voice/VoiceSheet.tsx').target,
    'components/voice/VoiceSheet/VoiceSheet.tsx',
  );
});

test('a module used only by another shared module becomes its private sub-part', () => {
  const { rows } = run(
    {
      'components/Parent.tsx': `import { X } from './Child';\n${comp}`,
      'components/Child.tsx': comp,
      'pages/Pantry/PantryPage.tsx': `import { X } from '@/components/Parent';\n`,
      'pages/Shopping/ShoppingPage.tsx': `import { X } from '@/components/Parent';\n`,
    },
    ['all'],
  );
  assert.equal(
    rows.get('components/Child.tsx').target,
    'components/<group>/Parent/Child/Child.tsx',
  );
});

test('a component imported by lib/ goes to lib/; route guards go to routing/; barrels are deleted', () => {
  const { rows } = run(
    {
      'components/Item.tsx': comp,
      'lib/reads.ts': `import { X } from '../components/Item';\n`,
      'components/RequireAuth.tsx': comp,
      'App.tsx': `import { X } from './components/RequireAuth';\n`,
      'components/ExpiryPicker/index.ts': `export * from './ExpiryPicker';\n`,
      'components/ExpiryPicker/ExpiryPicker.tsx': comp,
      'pages/Pantry/PantryPage.tsx': `import { X } from '@/components/ExpiryPicker';\n`,
    },
    ['all'],
  );
  assert.equal(rows.get('components/Item.tsx').target, 'lib/Item.tsx');
  assert.equal(
    rows.get('components/RequireAuth.tsx').target,
    'routing/RequireAuth.tsx',
  );
  assert.equal(
    rows.get('components/ExpiryPicker/index.ts').target,
    '(delete barrel)',
  );
});

test('a test moves beside the module it is named after; a page test stays', () => {
  const { rows } = run(
    {
      'components/Chip.tsx': comp,
      'components/Chip.test.tsx': `import { X } from './Chip';\n`,
      'pages/Pantry/PantryPage.tsx': `import { X } from '@/components/Chip';\n`,
      'pages/Shopping/ShoppingPage.tsx': `import { X } from '@/components/Chip';\n`,
      'pages/Pantry/PantryPage.test.tsx': `import { X } from './PantryPage';\n`,
    },
    ['all'],
  );
  assert.equal(
    rows.get('components/Chip.test.tsx').target,
    'components/<group>/Chip/Chip.test.tsx',
  );
  assert.equal(rows.has('pages/Pantry/PantryPage.test.tsx'), false);
});

test('a string holding /* does not swallow the imports after it', () => {
  const { rows } = run(
    {
      'pages/Recipes/components/Widget.tsx': comp,
      'pages/Recipes/RecipesPage.tsx':
        `const glob = 'src/*';\nimport { X } from './components/Widget';\n` +
        `/* a real comment */\n`,
      'pages/MealPlans/MealPlanPage.tsx': `import { X } from '../Recipes/components/Widget';\n`,
    },
    ['Recipes'],
  );
  assert.equal(
    rows.get('pages/Recipes/components/Widget.tsx').importers,
    'MealPlans, Recipes',
  );
});

test('a trailing line comment is stripped, so a commented-out import is not counted', () => {
  const { rows } = run(
    {
      'pages/Recipes/components/Widget.tsx': comp,
      'pages/Recipes/RecipesPage.tsx': `const a = 1; // import { X } from './components/Widget';\n`,
      'pages/MealPlans/MealPlanPage.tsx': `import { X } from '../Recipes/components/Widget';\n`,
    },
    ['Recipes'],
  );
  assert.equal(
    rows.get('pages/Recipes/components/Widget.tsx').importers,
    'MealPlans',
  );
});

test('modules in a lintSelfTest folder are not part of the graph', () => {
  const { rows } = run(
    {
      'pages/Recipes/components/Widget.tsx': comp,
      'pages/Pantry/lintSelfTest/Fixture.ts': `import { X } from '@/pages/Recipes/components/Widget';\n`,
    },
    ['Recipes', '--all'],
  );
  assert.equal(rows.get('pages/Recipes/components/Widget.tsx').importers, '-');
  assert.equal(rows.has('pages/Pantry/lintSelfTest/Fixture.ts'), false);
});

test('a feature group keeps its parts together: sub-groups stay inside, not moved into a page', () => {
  const { rows } = run(
    {
      'components/catalogSearch/CatalogSearch.tsx': `import { Tile } from './emptyState/Tile';\n${comp}`,
      'components/catalogSearch/emptyState/Tile.tsx': comp,
      'components/catalogSearch/emptyState/Tile.test.tsx': `import { X } from './Tile';\n`,
      'components/catalogSearch/emptyState/context.tsx': comp,
      'pages/Pantry/PantryPage.tsx': `import { X } from '@/components/catalogSearch/emptyState/Tile';\nimport { X as Y } from '@/components/catalogSearch/emptyState/context';\n`,
    },
    ['catalogSearch'],
  );
  assert.equal(
    rows.get('components/catalogSearch/emptyState/Tile.tsx').target,
    'components/catalogSearch/emptyState/Tile/Tile.tsx',
  );
  assert.equal(
    rows.get('components/catalogSearch/emptyState/Tile.test.tsx').target,
    'components/catalogSearch/emptyState/Tile/Tile.test.tsx',
  );
  assert.equal(
    rows.get('components/catalogSearch/emptyState/context.tsx'),
    undefined,
  );
});

test('the recipeEditor feature group keeps its parts at the group level', () => {
  const { rows } = run(
    {
      'components/recipeEditor/RecipeMetaFields.tsx': comp,
      'pages/Admin/components/RecipeForm/RecipeForm.tsx': `import { X } from '@/components/recipeEditor/RecipeMetaFields';\n`,
    },
    ['recipeEditor'],
  );
  assert.equal(
    rows.get('components/recipeEditor/RecipeMetaFields.tsx').target,
    'components/recipeEditor/RecipeMetaFields/RecipeMetaFields.tsx',
  );
});
