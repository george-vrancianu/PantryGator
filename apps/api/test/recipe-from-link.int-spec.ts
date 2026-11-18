import { jest } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, ilike } from 'drizzle-orm';
import type { StructuredOutputRequest } from '../src/ai/structured-output-ai.service';
import { StructuredOutputAiError } from '../src/ai/structured-output-ai.service';
import { seedId } from '../src/catalog/seed/seed-catalog';
import { DATABASE } from '../src/database/database.constants';
import type { Database } from '../src/database/database.types';
import { recipes, scanUsage, tags } from '../src/database/schema';
import { PageFetchError } from '../src/page-fetch/page-fetcher';
import type { PageFetcher } from '../src/page-fetch/page-fetcher';
import type {
  AdminRecipeDetail,
  // The draft answer: the older describes below only read drafts.
  RecipeFromLinkDraft as RecipeFromLink,
  RecipeFromLink as LinkReadResult,
} from '../src/recipes/recipes.schemas';
import { ScanCapService } from '../src/scan/scan-cap.service';
import { client, signUp } from './support/admin-session';
import { promoteToAdmin } from './support/promote-to-admin';
import { catalogIndexIn } from './support/catalog-indices';
import { offeredTagNames, tagIndexIn } from './support/tag-indices';
import { catalogIndexInstruction } from '../src/ingredients/ingredient-catalog';
import { createTestApp } from './support/create-test-app';

jest.setTimeout(30_000);

const code = (res: { body: unknown }) => (res.body as { code: string }).code;
const flour = seedId.ingredient('flour');
const milk = seedId.ingredient('milk');

const jsonLdPage = (recipe: object, wrap: (r: object) => object = (r) => r) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(wrap(recipe))}</script></head><body>Blog chatter 5521</body></html>`;

const ldScript = (json: string, attributes = 'type="application/ld+json"') =>
  `<script ${attributes}>${json}</script>`;
const htmlPage = (...scripts: string[]) =>
  `<html><head>${scripts.join('')}</head><body>Blog chatter 5521</body></html>`;

const PANCAKES = {
  '@type': 'Recipe',
  name: 'Fluffy pancakes',
  recipeIngredient: ['2 cups flour', '1 cup milk'],
};

const reading = (overrides: Record<string, unknown> = {}) => ({
  recipeFound: true,
  sourceLanguage: 'en',
  title: 'Pancakes',
  servings: null,
  prepMinutes: 10,
  cookMinutes: 15,
  tagIndexes: [],
  steps: [
    { text: 'Whisk everything.', timerMinutes: null },
    { text: 'Fry each side.', timerMinutes: 2 },
  ],
  ingredients: [
    {
      nameAsWritten: 'flour',
      ingredientId: flour,
      matchConfidence: 0.9,
      quantity: 250,
      unit: 'g',
      originalAmount: '2 cups',
      preparation: null,
      optional: false,
    },
    {
      nameAsWritten: 'grandma spice',
      ingredientId: null,
      matchConfidence: 0,
      quantity: null,
      unit: null,
      originalAmount: 'a pinch',
      preparation: 'ground',
      optional: true,
    },
  ],
  ...overrides,
});

describe('Recipe from Link (integration)', () => {
  let app: NestFastifyApplication;
  let database: Database;
  let member: ReturnType<typeof client>;
  let familyBMember: ReturnType<typeof client>;
  let cookieB: string;
  const stamp = Date.now();
  const prompts: StructuredOutputRequest[] = [];
  let answer: (
    request: StructuredOutputRequest,
  ) => Promise<{ data: unknown; requestId: string | null }>;
  let page: () => Promise<{ finalUrl: string; html: string }>;
  const fetched: string[] = [];
  const generateSignals: (AbortSignal | undefined)[] = [];
  const fetchSignals: (AbortSignal | undefined)[] = [];

  const respondWith = (
    data: object | ((request: StructuredOutputRequest) => object),
  ) => {
    answer = (request) =>
      Promise.resolve({
        data:
          typeof data === 'function'
            ? (data as (request: StructuredOutputRequest) => object)(request)
            : data,
        requestId: 'fake-request',
      });
  };
  const serve = (html: string) => {
    page = () => Promise.resolve({ finalUrl: 'https://example.com/', html });
  };
  const read = (url: string, who = member, extra: object = {}) =>
    who.post('/from-link', { url, ...extra });

  beforeAll(async () => {
    const pageFetcher: PageFetcher = {
      fetchPage: (url, signal) => {
        fetched.push(url);
        fetchSignals.push(signal);
        return page();
      },
    };
    app = await createTestApp(
      [],
      {
        generate: (input, options) => {
          prompts.push(input);
          generateSignals.push(options?.signal);
          return answer(input);
        },
      },
      undefined,
      undefined,
      undefined,
      pageFetcher,
    );
    database = app.get<Database>(DATABASE);
    cookieB = await signUp(app, `link-b-${stamp}@example.com`, 'B');
    familyBMember = client(app, cookieB, '/api/recipes');
  });
  afterAll(async () => {
    await app.close();
  });
  let memberCount = 0;
  let memberCookie: string;
  beforeEach(async () => {
    // A fresh Member per test: the Link Cap (2 in the test env) counts every read that reaches the AI.
    memberCookie = await signUp(
      app,
      `link-a-${stamp}-${++memberCount}@example.com`,
      'A',
    );
    member = client(app, memberCookie, '/api/recipes');
    prompts.length = 0;
    fetched.length = 0;
    serve(jsonLdPage(PANCAKES));
    respondWith(reading());
  });

  it('requires authentication', async () => {
    await client(app, '', '/api/recipes')
      .post('/from-link', { url: 'https://example.com/' })
      .expect(401);
  });

  it('turns a JSON-LD page into a draft with matched and Unmatched lines, converted amounts and Steps', async () => {
    const res = await read('https://Example.com/pancakes#top').expect(200);
    const body = res.body as RecipeFromLink;

    expect(fetched).toEqual(['https://example.com/pancakes']);
    expect(body).toMatchObject({
      kind: 'draft',
      sourceLink: 'https://example.com/pancakes',
      hiddenByAllergiesCount: 0,
    });
    expect(body.draft).toMatchObject({
      title: 'Pancakes',
      servings: null,
      prepMinutes: 10,
      cookMinutes: 15,
      tagIds: [],
      tips: [],
      guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
      steps: [
        { text: 'Whisk everything.', timerSeconds: null },
        { text: 'Fry each side.', timerSeconds: 120 },
      ],
    });
    expect(body.draft.lines).toEqual([
      {
        ingredientId: flour,
        rawName: null,
        ingredientName: 'Flour',
        ingredientOwner: 'catalog',
        quantity: 250,
        unit: 'g',
        optional: false,
        note: '2 cups',
      },
      {
        ingredientId: null,
        rawName: 'grandma spice',
        ingredientName: 'grandma spice',
        ingredientOwner: null,
        quantity: null,
        unit: null,
        optional: true,
        note: 'a pinch, ground',
      },
    ]);
  });

  it('finds the Recipe inside @graph and hands the JSON-LD to the model', async () => {
    serve(
      jsonLdPage({ ...PANCAKES, name: 'Graph Pancakes 7731' }, (r) => ({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'WebSite' }, r],
      })),
    );
    await read('https://example.com/graph').expect(200);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].prompt).toContain('Graph Pancakes 7731');
    expect(prompts[0].prompt).toContain('2 cups flour');
    expect(catalogIndexIn(prompts[0].prompt, 'Flour')).toEqual(
      expect.any(Number),
    );
    expect(prompts[0].prompt).not.toContain('Blog chatter 5521');
  });

  describe('finding the Recipe in the page', () => {
    const promptAfter = async (html: string, path: string) => {
      serve(html);
      await read(`https://example.com/${path}`).expect(200);
      return prompts[0].prompt;
    };

    it('drops bulky keys before the prompt', async () => {
      const prompt = await promptAfter(
        jsonLdPage({
          ...PANCAKES,
          image: 'https://cdn.example.com/IMG-8842.jpg',
          video: { name: 'VIDEO-8843' },
          review: [{ reviewBody: 'REVIEW-8844' }],
          comment: [{ text: 'COMMENT-8845' }],
          aggregateRating: { ratingValue: 'RATING-8846' },
        }),
        'bulky',
      );
      expect(prompt).toContain('Fluffy pancakes');
      for (const gone of ['IMG-8842', 'VIDEO-8843', 'REVIEW-8844']) {
        expect(prompt).not.toContain(gone);
      }
      expect(prompt).not.toContain('COMMENT-8845');
      expect(prompt).not.toContain('RATING-8846');
      expect(prompt).not.toContain('Blog chatter 5521');
    });

    it('also reads the graph form with the image beside it', async () => {
      const prompt = await promptAfter(
        jsonLdPage({ ...PANCAKES, image: 'IMG-9001.jpg' }, (r) => ({
          '@graph': [{ '@type': 'ImageObject' }, r],
        })),
        'graph-image',
      );
      expect(prompt).not.toContain('IMG-9001');
    });

    it.each([
      ['an @type array', { ...PANCAKES, '@type': ['Thing', 'Recipe'] }],
      ['schema:Recipe', { ...PANCAKES, '@type': 'schema:Recipe' }],
      [
        'a full schema.org URL type',
        { ...PANCAKES, '@type': 'https://schema.org/Recipe' },
      ],
    ])('finds a Recipe typed as %s', async (_label, recipe) => {
      const prompt = await promptAfter(jsonLdPage(recipe), 'typed');
      expect(prompt).toContain('Fluffy pancakes');
    });

    it('finds a Recipe in a top-level array of nodes', async () => {
      const prompt = await promptAfter(
        htmlPage(ldScript(JSON.stringify([{ '@type': 'WebSite' }, PANCAKES]))),
        'array',
      );
      expect(prompt).toContain('Fluffy pancakes');
    });

    it('finds a Recipe that is the mainEntity of a WebPage', async () => {
      const prompt = await promptAfter(
        jsonLdPage({ ...PANCAKES, name: 'Main Entity Soup 3310' }, (r) => ({
          '@type': 'WebPage',
          mainEntity: r,
        })),
        'main-entity',
      );
      expect(prompt).toContain('Main Entity Soup 3310');
    });

    it('finds a Recipe in mainEntityOfPage when it is an object', async () => {
      const prompt = await promptAfter(
        jsonLdPage({ ...PANCAKES, name: 'Page Entity Soup 3311' }, (r) => ({
          '@type': 'WebPage',
          mainEntityOfPage: r,
        })),
        'main-entity-of-page',
      );
      expect(prompt).toContain('Page Entity Soup 3311');
    });

    it('skips other scripts and invalid blocks before a valid one, in any attribute order and quoting', async () => {
      const prompt = await promptAfter(
        htmlPage(
          '<script>var a=1</script>',
          ldScript('{oops'),
          ldScript('{"@type":"Article"}'),
          `<script data-x='1' TYPE='application/ld+json' id=a>${JSON.stringify({ ...PANCAKES, name: 'Quoted Soup 4410' })}</script>`,
        ),
        'attributes',
      );
      expect(prompt).toContain('Quoted Soup 4410');
    });

    it('reads an unquoted type attribute and an upper-case tag', async () => {
      const prompt = await promptAfter(
        htmlPage(
          `<SCRIPT type=application/ld+json>${JSON.stringify({ ...PANCAKES, name: 'Unquoted Soup 4411' })}</SCRIPT >`,
        ),
        'unquoted',
      );
      expect(prompt).toContain('Unquoted Soup 4411');
    });
  });

  it('asks in the Catalog Language of the Member', async () => {
    const cookie = await signUp(app, `link-ro-${stamp}@example.com`, 'RO');
    await client(app, cookie, '/api/settings')
      .put('/preferences', {
        locale: 'en',
        catalogLanguage: 'ro',
        scanLanguage: 'da',
      })
      .expect(200);
    await read(
      'https://example.com/ro',
      client(app, cookie, '/api/recipes'),
    ).expect(200);
    expect(prompts[0].prompt).toContain('Romanian');
    expect(prompts[0].prompt).not.toContain('Danish');
  });

  describe('language choice and source language', () => {
    const url = 'https://example.com/lang';

    it('defaults to the Catalog Language and instructs it for the text', async () => {
      await read(url).expect(200);
      const prompt = prompts[0].prompt;
      expect(prompt).toContain('Write the title and the steps in English');
      expect(prompt).toContain(
        'nameAsWritten as a short ingredient name in English',
      );
      expect(prompt).not.toContain("recipe's own language");
    });

    it('catalog is the same as the default, in the Catalog Language', async () => {
      const cookie = await signUp(app, `link-lc-${stamp}@example.com`, 'LC');
      await client(app, cookie, '/api/settings')
        .put('/preferences', {
          locale: 'en',
          catalogLanguage: 'da',
          scanLanguage: 'en',
        })
        .expect(200);
      await read(url, client(app, cookie, '/api/recipes'), {
        language: 'catalog',
      }).expect(200);
      expect(prompts[0].prompt).toContain(
        'Write the title and the steps in Danish',
      );
    });

    it('source keeps the page language and does not name the Catalog Language', async () => {
      const cookie = await signUp(app, `link-ls-${stamp}@example.com`, 'LS');
      await client(app, cookie, '/api/settings')
        .put('/preferences', {
          locale: 'en',
          catalogLanguage: 'ro',
          scanLanguage: 'en',
        })
        .expect(200);
      await read(url, client(app, cookie, '/api/recipes'), {
        language: 'source',
      }).expect(200);
      const prompt = prompts[0].prompt;
      expect(prompt).toContain("in the recipe's own language");
      expect(prompt).toContain('(do not translate)');
      expect(prompt).toContain('match ingredients across languages');
      expect(prompt).not.toContain('Romanian');
      expect(prompt).not.toContain('Write the title and the steps in English');
      // Matching against the Catalog is unchanged.
      expect(prompt).toContain(catalogIndexInstruction('ingredientIndex'));
    });

    it('refuses an unknown language choice and extra fields', async () => {
      await read(url, member, { language: 'french' }).expect(400);
      await read(url, member, { language: null }).expect(400);
      await read(url, member, { extra: 1 }).expect(400);
      expect(prompts).toHaveLength(0);
    });

    it('sets sourceLanguage when the page language differs from the Catalog Language', async () => {
      respondWith(reading({ sourceLanguage: 'ro' }));
      const res = await read(url).expect(200);
      expect((res.body as RecipeFromLink).sourceLanguage).toBe('ro');
    });

    it('normalises a regional code to its base code', async () => {
      respondWith(reading({ sourceLanguage: ' DA-dk ' }));
      const res = await read(url).expect(200);
      expect((res.body as RecipeFromLink).sourceLanguage).toBe('da');
    });

    it('is null when the page language is the Catalog Language', async () => {
      respondWith(reading({ sourceLanguage: 'en-GB' }));
      const res = await read(url).expect(200);
      expect((res.body as RecipeFromLink).sourceLanguage).toBeNull();
    });

    it('is null with the source choice, even when detected', async () => {
      respondWith(reading({ sourceLanguage: 'ro' }));
      const res = await read(url, member, { language: 'source' }).expect(200);
      expect((res.body as RecipeFromLink).sourceLanguage).toBeNull();
    });

    it.each([null, '', '  ', 'not a language!', '123'])(
      'is null for an unknown detected language (%j)',
      async (detected) => {
        respondWith(reading({ sourceLanguage: detected }));
        const res = await read(url).expect(200);
        expect((res.body as RecipeFromLink).sourceLanguage).toBeNull();
      },
    );
  });

  it('leaves a UUID in place of an index, and low-confidence matches, Unmatched', async () => {
    const ingredients = reading().ingredients;
    respondWith(
      reading({
        ingredients: [
          {
            ...ingredients[0],
            ingredientIndex: crypto.randomUUID(),
            nameAsWritten: 'mystery',
          },
          {
            ...ingredients[0],
            ingredientId: milk,
            matchConfidence: 0.1,
            nameAsWritten: 'maybe milk',
          },
          {
            ...ingredients[0],
            ingredientId: milk,
            matchConfidence: 0.95,
            nameAsWritten: 'milk',
          },
        ],
      }),
    );
    const { draft } = (await read('https://example.com/scope').expect(200))
      .body as RecipeFromLink;
    expect(draft.lines.map((l) => [l.ingredientId, l.rawName])).toEqual([
      [null, 'mystery'],
      [null, 'maybe milk'],
      [milk, null],
    ]);
  });

  it('names Catalog Ingredients by index, never by UUID, and leaves an index outside the Catalog, or not an index, Unmatched', async () => {
    const line = reading().ingredients[0];
    answer = () =>
      Promise.resolve({
        data: reading({
          ingredients: [
            {
              ...line,
              ingredientIndex: catalogIndexIn(prompts[0].prompt, 'Milk'),
              nameAsWritten: 'milk',
            },
            ...[100_000, -1, 2.5, 'flour'].map((index) => ({
              ...line,
              ingredientIndex: index,
              nameAsWritten: `mystery ${index}`,
            })),
          ],
        }),
        requestId: 'fake-request',
      });
    const { draft } = (await read('https://example.com/indices').expect(200))
      .body as RecipeFromLink;
    // The Catalog goes by index.
    expect(prompts[0].prompt).not.toContain(milk);
    expect(prompts[0].prompt).not.toContain(flour);
    expect(draft.lines.map((l) => [l.ingredientId, l.rawName])).toEqual([
      [milk, null],
      [null, 'mystery 100000'],
      [null, 'mystery -1'],
      [null, 'mystery 2.5'],
      [null, 'mystery flour'],
    ]);
  });

  it("matches the Family's own Ingredient but not another Family's", async () => {
    const own = (
      await client(app, cookieB, '/api/catalog')
        .post('/family-ingredients', {
          name: `Zq secret sauce ${stamp}`,
          leafCategoryId: seedId.leaf('hard-cheese'),
          defaultUnit: 'g',
        })
        .expect(201)
    ).body as { id: string };
    respondWith(
      reading({
        ingredients: [{ ...reading().ingredients[0], ingredientId: own.id }],
      }),
    );
    const mine = (
      await read('https://example.com/own', familyBMember).expect(200)
    ).body as RecipeFromLink;
    expect(mine.draft.lines[0]).toMatchObject({
      ingredientId: own.id,
      rawName: null,
    });
    // The other Family's prompt does not list it, and its answer cannot use it.
    const theirs = (await read('https://example.com/own').expect(200))
      .body as RecipeFromLink;
    expect(theirs.draft.lines[0]).toMatchObject({ ingredientId: null });
    const name = `Zq secret sauce ${stamp}`;
    expect(() => catalogIndexIn(prompts[1].prompt, name)).toThrow();
    expect(catalogIndexIn(prompts[0].prompt, name)).toEqual(expect.any(Number));
  });

  it('drops zero and negative quantities', async () => {
    const line = reading().ingredients[0];
    respondWith(
      reading({
        servings: 4,
        ingredients: [
          { ...line, quantity: 0 },
          { ...line, quantity: -3, nameAsWritten: 'neg' },
        ],
      }),
    );
    const { draft } = (await read('https://example.com/drop').expect(200))
      .body as RecipeFromLink;
    expect(draft).toMatchObject({ servings: 4 });
    expect(draft.lines.map((l) => [l.quantity, l.unit])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  describe('Tags (#714)', () => {
    const dinner = seedId.tag('meal:dinner');
    const vegan = seedId.tag('diet:vegan');
    const tagCount = async () =>
      (await database.select({ id: tags.id }).from(tags)).length;
    const drafts = () => client(app, memberCookie, '/api/recipe-drafts');
    const familyTag = async (who: ReturnType<typeof client>, name: string) =>
      ((await who.post('/tags', { name }).expect(200)).body as { id: string })
        .id;

    it("offers the Catalog Tags and this Family's, never another Family's", async () => {
      const mine = `Mine ${stamp}-a`;
      const theirs = `Theirs ${stamp}-a`;
      await familyTag(member, mine);
      await familyTag(familyBMember, theirs);
      await read('https://example.com/offered').expect(200);
      const names = offeredTagNames(prompts[0].prompt);
      expect(names).toEqual(expect.arrayContaining(['Dinner', 'Vegan', mine]));
      expect(names).not.toContain(theirs);
      // Catalog Tags come first and the Family's own last, so the Catalog part stays identical across Families.
      expect(names.indexOf(mine)).toBe(names.length - 1);
    });

    it('turns proposed indices into Catalog and own Family Tag ids on the draft and the stored Recipe Draft', async () => {
      const mine = `Mine ${stamp}-b`;
      const mineId = await familyTag(member, mine);
      respondWith((request: StructuredOutputRequest) =>
        reading({
          tagIndexes: [
            tagIndexIn(request.prompt, 'Dinner'),
            tagIndexIn(request.prompt, mine),
            tagIndexIn(request.prompt, 'Vegan'),
          ],
        }),
      );
      const body = (await read('https://example.com/tagged').expect(200))
        .body as RecipeFromLink;
      expect(body.draft.tagIds).toEqual([dinner, mineId, vegan]);
      const stored = await drafts().get(`/${body.recipeDraftId}`).expect(200);
      expect(
        (stored.body as { content: { tagIds: string[] } }).content.tagIds,
      ).toEqual([dinner, mineId, vegan]);
    });

    it('drops out-of-range, fractional, negative and non-number indices, dedupes, and caps at 10', async () => {
      respondWith((request: StructuredOutputRequest) =>
        reading({
          tagIndexes: [
            tagIndexIn(request.prompt, 'Dinner'),
            tagIndexIn(request.prompt, 'Dinner'),
            100_000,
            -1,
            2.5,
            'Vegan',
            null,
            tagIndexIn(request.prompt, 'Vegan'),
          ],
        }),
      );
      const body = (await read('https://example.com/junk').expect(200))
        .body as RecipeFromLink;
      expect(body.draft.tagIds).toEqual([dinner, vegan]);

      respondWith((request: StructuredOutputRequest) =>
        reading({
          tagIndexes: offeredTagNames(request.prompt).map((_, i) => i),
        }),
      );
      const many = (await read('https://example.com/many').expect(200))
        .body as RecipeFromLink;
      expect(many.draft.tagIds).toHaveLength(10);
    });

    it('never accepts a Tag id where an index is expected', async () => {
      const theirs = `Theirs ${stamp}-c`;
      const theirId = await familyTag(familyBMember, theirs);
      respondWith(reading({ tagIndexes: [theirId, 'x'], tagIds: [theirId] }));
      const body = (await read('https://example.com/other').expect(200))
        .body as RecipeFromLink;
      expect(body.draft.tagIds).toEqual([]);
    });

    it('never creates a Tag by reading, whatever the model proposes', async () => {
      const before = await tagCount();
      respondWith({
        ...reading({ tagIndexes: [0, 1, 100_000] }),
        newTags: ['Brand new'],
        tagNames: ['Brand new'],
      });
      await read('https://example.com/nocreate').expect(200);
      expect(await tagCount()).toBe(before);
    });

    it('proposes Tags for pasted text through the same reader', async () => {
      respondWith((request: StructuredOutputRequest) =>
        reading({ tagIndexes: [tagIndexIn(request.prompt, 'Vegan')] }),
      );
      const body = (
        await member.post('/from-link', { text: 'Pancakes 5521' }).expect(200)
      ).body as RecipeFromLink;
      expect(body.draft.tagIds).toEqual([vegan]);
    });
  });

  it('keeps quantity and unit together, folds wording into the note, and drops empty Steps', async () => {
    const line = reading().ingredients[0];
    respondWith(
      reading({
        steps: [
          { text: ' Mix. ', timerMinutes: 1.5 },
          { text: '   ', timerMinutes: 3 },
          { text: 'Cook', timerMinutes: 0 },
        ],
        ingredients: [
          { ...line, unit: null, nameAsWritten: 'no unit' },
          { ...line, quantity: null, nameAsWritten: 'no quantity' },
          {
            ...line,
            quantity: null,
            unit: null,
            originalAmount: 'a pinch',
            preparation: null,
            nameAsWritten: 'pinch',
          },
          { ...line, ingredientId: flour, preparation: 'sifted' },
        ],
      }),
    );
    const { draft } = (await read('https://example.com/amounts').expect(200))
      .body as RecipeFromLink;
    expect(draft.lines.map((l) => [l.quantity, l.unit, l.note])).toEqual([
      [null, null, '2 cups'],
      [null, null, '2 cups'],
      [null, null, 'a pinch'],
      [250, 'g', '2 cups, sifted'],
    ]);
    expect(draft.steps).toEqual([
      { text: 'Mix.', timerSeconds: 90 },
      { text: 'Cook', timerSeconds: null },
    ]);
  });

  it('does not fail the read when a confidence is out of range', async () => {
    respondWith(
      reading({
        ingredients: [{ ...reading().ingredients[0], matchConfidence: 1.01 }],
      }),
    );
    const { draft } = (await read('https://example.com/confident').expect(200))
      .body as RecipeFromLink;
    expect(draft.lines[0]).toMatchObject({ ingredientId: flour });
  });

  describe('the closest Base Recipes', () => {
    const parmesan = seedId.ingredient('parmesan');
    const MILK = seedId.allergen('milk');
    let admin: ReturnType<typeof client>;
    let tag = 0;
    const word = () => `Zqx${stamp}t${++tag}`;
    const catalogBase = async (title: string, ingredientIds: string[]) =>
      (
        await admin
          .post('', {
            title,
            servings: 4,
            lines: ingredientIds.map((ingredientId) => ({
              ingredientId,
              quantity: 100,
              unit: 'g',
            })),
            steps: [{ text: 'Cook' }],
          })
          .expect(201)
      ).body as AdminRecipeDetail;
    // A reading with a title and no ingredient lines, so only the title can match.
    const readTitled = async (title: string, who = member) => {
      respondWith(reading({ title, ingredients: [] }));
      return (await read('https://example.com/x', who).expect(200))
        .body as RecipeFromLink;
    };

    beforeAll(async () => {
      const email = `link-admin-${stamp}@example.com`;
      const cookie = await signUp(app, email, 'Admin');
      await promoteToAdmin(database, email);
      admin = client(app, cookie, '/api/admin/recipes');
    });
    afterAll(async () => {
      await database
        .delete(recipes)
        .where(ilike(recipes.title, `Zqx${stamp}%`));
    });

    it('offers the Catalog Base Recipe the title and matched lines resemble, shaped as plate matches', async () => {
      const dish = word();
      const base = await catalogBase(`${dish} soup`, [flour, milk]);
      respondWith(reading({ title: `${dish} soup` }));
      const body = (await read('https://example.com/x').expect(200))
        .body as RecipeFromLink;
      const first = body.closestBases[0];
      expect(first).toMatchObject({
        id: base.id,
        title: `${dish} soup`,
        allergyWarning: null,
      });
      expect(first.score).toBeGreaterThan(0);
      expect(body.closestBases.length).toBeLessThanOrEqual(5);
      expect(body.hiddenByAllergiesCount).toBe(0);
    });

    it('is empty, with a zero count, when nothing is close', async () => {
      const body = await readTitled(word());
      expect(body.closestBases).toEqual([]);
      expect(body.hiddenByAllergiesCount).toBe(0);
    });

    it('never offers a Family Recipe, a Variant or an archived Recipe', async () => {
      const dish = word();
      const base = await catalogBase(`${dish} base`, [flour]);
      const archived = await catalogBase(`${dish} archived`, [flour]);
      await admin.post(`/${archived.id}/archive`).expect(200);
      const variant = (
        await admin
          .post(`/${base.id}/variants`, { title: `${dish} variant` })
          .expect(201)
      ).body as AdminRecipeDetail;
      const family = (
        await member
          .post('', {
            title: `${dish} family`,
            servings: 2,
            locale: 'en',
            parentId: null,
            lines: [{ ingredientId: flour, quantity: 1, unit: 'g' }],
          })
          .expect(201)
      ).body as { id: string };

      const body = await readTitled(dish);
      const offered = body.closestBases.map((b) => b.id);
      expect(offered).toContain(base.id);
      expect(offered).not.toContain(archived.id);
      expect(offered).not.toContain(variant.id);
      expect(offered).not.toContain(family.id);
    });

    it('leaves out a base with the own Allergen under "Hide Recipes with my Allergies" and counts it', async () => {
      const dish = word();
      const milky = await catalogBase(`${dish} cheesy`, [parmesan]);
      const settings = (who: string) => client(app, who, '/api/settings');
      const cookie = await signUp(
        app,
        `link-hide-${stamp}-${tag}@example.com`,
        'H',
      );
      const hider = client(app, cookie, '/api/recipes');
      await settings(cookie)
        .put('/allergies', { allergenIds: [MILK] })
        .expect(200);
      await settings(cookie)
        .put('/preferences', { hideRecipesWithAllergies: true })
        .expect(200);

      const body = await readTitled(`${dish} cheesy`, hider);
      expect(body.closestBases.map((b) => b.id)).not.toContain(milky.id);
      expect(body.hiddenByAllergiesCount).toBe(1);

      await settings(cookie)
        .put('/preferences', { hideRecipesWithAllergies: false })
        .expect(200);
      const shown = await readTitled(`${dish} cheesy`, hider);
      expect(shown.closestBases.find((b) => b.id === milky.id)).toMatchObject({
        allergyWarning: { severity: 'strong' },
      });
      expect(shown.hiddenByAllergiesCount).toBe(0);
    });

    it('creates a Variant that keeps the Source Link and language when saved with a returned base', async () => {
      const dish = word();
      const base = await catalogBase(`${dish} omelette`, [flour]);
      respondWith(reading({ title: `${dish} omelette`, sourceLanguage: 'fr' }));
      const body = (await read('https://example.com/tortilla').expect(200))
        .body as RecipeFromLink;
      const parent = body.closestBases.find((b) => b.id === base.id);
      expect(parent).toBeDefined();

      const created = (
        await member
          .post('', {
            title: `${dish} tortilla`,
            servings: 2,
            locale: 'en',
            parentId: parent!.id,
            sourceLink: body.sourceLink,
            sourceLanguage: body.sourceLanguage,
            lines: [{ ingredientId: flour, quantity: 1, unit: 'g' }],
          })
          .expect(201)
      ).body as { id: string };
      const detail = (await member.get(`/${created.id}?locale=en`).expect(200))
        .body as {
        parentId: string | null;
        sourceLink: string | null;
        sourceLanguage: string | null;
      };
      expect(detail).toMatchObject({
        parentId: base.id,
        sourceLink: 'https://example.com/tortilla',
        sourceLanguage: 'fr',
      });
    });
  });

  describe('errors', () => {
    it.each([['ftp://example.com/a'], ['javascript:alert(1)'], ['not a link']])(
      'link.invalid for %s, without fetching',
      async (url) => {
        const res = await read(url).expect(400);
        expect(code(res)).toBe('link.invalid');
        expect(fetched).toEqual([]);
        expect(prompts).toEqual([]);
      },
    );

    it('link.invalid when the fetcher refuses the address', async () => {
      page = () => Promise.reject(new PageFetchError('invalid', 'refused'));
      const res = await read('https://example.com/private').expect(400);
      expect(code(res)).toBe('link.invalid');
      expect(prompts).toEqual([]);
    });

    it('link.unreadable when the fetch fails', async () => {
      page = () => Promise.reject(new PageFetchError('unreadable', 'timeout'));
      const res = await read('https://example.com/slow').expect(422);
      expect(code(res)).toBe('link.unreadable');
      expect(prompts).toEqual([]);
    });

    it('link.no_recipe for a page with neither a JSON-LD Recipe nor visible text, and no AI call', async () => {
      serve(
        '<html><head><title>Empty</title><script>var a = 1;</script></head><body><nav>Home</nav><style>p{}</style></body></html>',
      );
      const res = await read('https://example.com/blog').expect(422);
      expect(code(res)).toBe('link.no_recipe');
      expect(prompts).toEqual([]);
    });

    it('reads the visible text of a page whose JSON-LD has no Recipe', async () => {
      serve(jsonLdPage({ '@type': 'Article', name: 'News' }));
      await read('https://example.com/article').expect(200);
      expect(prompts[0].prompt).toContain('Blog chatter 5521');
    });

    it('link.no_recipe quickly for a huge page of unclosed script tags', async () => {
      serve(`<html>${'<script>'.repeat(200_000)}`);
      const started = Date.now();
      const res = await read('https://example.com/unclosed').expect(422);
      expect(Date.now() - started).toBeLessThan(5000);
      expect(code(res)).toBe('link.no_recipe');
      expect(prompts).toEqual([]);
    });

    it('link.invalid for a link over the length limit', async () => {
      const res = await read(`https://example.com/${'a'.repeat(2100)}`).expect(
        400,
      );
      expect(code(res)).toBe('link.invalid');
      expect(fetched).toEqual([]);
    });

    it('link.no_recipe when the AI finds none', async () => {
      respondWith(reading({ recipeFound: false }));
      const res = await read('https://example.com/odd').expect(422);
      expect(code(res)).toBe('link.no_recipe');
      expect(prompts).toHaveLength(1);
    });

    it('maps a provider failure like the Scans do', async () => {
      answer = () =>
        Promise.reject(new StructuredOutputAiError('failed', null));
      const res = await read('https://example.com/down').expect(502);
      expect(code(res)).toBe('scan.provider_unavailable');
    });

    it('scan.result_invalid when the answer is not a reading', async () => {
      respondWith({ nope: true });
      const res = await read('https://example.com/bad').expect(502);
      expect(code(res)).toBe('scan.result_invalid');
    });
  });

  describe('the Link Cap', () => {
    // The test env sets LINK_DAILY_CAP to 2 and SCAN_DAILY_CAP to 3.
    const idOf = async (cookie: string) =>
      (
        (await client(app, cookie, '/api/auth').get('/get-session')).body as {
          user: { id: string };
        }
      ).user.id;

    it('counts a read only when the AI is called', async () => {
      await read('https://example.com/one').expect(200);
      await read('https://example.com/two').expect(200);
      expect(prompts).toHaveLength(2);
      const res = await read('https://example.com/three').expect(429);
      expect(code(res)).toBe('link.cap_reached');
      expect(prompts).toHaveLength(2);
    });

    it('answers link.cap_reached before any fetch for a Member already at the cap, and a duplicate stays free', async () => {
      const saved = await member
        .post('', {
          title: `Dup at cap ${stamp}`,
          servings: 2,
          locale: 'en',
          parentId: null,
          lines: [{ ingredientId: flour, quantity: 50, unit: 'g' }],
          steps: [{ text: 'Whisk' }],
          sourceLink: 'https://example.com/dup',
        })
        .expect(201);
      await read('https://example.com/one').expect(200);
      await read('https://example.com/two').expect(200);
      fetched.length = 0;
      const res = await read('https://example.com/three').expect(429);
      expect(code(res)).toBe('link.cap_reached');
      expect(res.body).toMatchObject({ params: { cap: 2 } });
      expect(fetched).toEqual([]);
      // Pasted text is still charged inside the AI step, so it is refused too.
      await member.post('/from-link', { text: 'Soup' }).expect(429);
      // A duplicate comes before the cap check, so it is still answered, without a fetch.
      const dup = await read('https://example.com/dup').expect(200);
      expect(dup.body).toEqual({
        kind: 'duplicate',
        recipeId: (saved.body as { id: string }).id,
      });
      expect(fetched).toEqual([]);
    });

    it('answers link.cap_reached with the cap and the next UTC midnight', async () => {
      await read('https://example.com/one').expect(200);
      await read('https://example.com/two').expect(200);
      const res = await read('https://example.com/three').expect(429);
      const body = res.body as {
        code: string;
        params: { cap: number; resetsAt: string };
      };
      expect(body.params.cap).toBe(2);
      const resetsAt = Date.parse(body.params.resetsAt);
      expect(resetsAt).toBeGreaterThan(Date.now());
      expect(resetsAt - Date.now()).toBeLessThanOrEqual(86_400_000);
      expect(new Date(resetsAt).toISOString()).toMatch(/T00:00:00\.000Z$/);
    });

    it('is not touched by invalid links, failed fetches or a page without text', async () => {
      await read('not a link').expect(400);
      page = () => Promise.reject(new PageFetchError('invalid', 'refused'));
      await read('https://example.com/private').expect(400);
      page = () => Promise.reject(new PageFetchError('unreadable', 'timeout'));
      await read('https://example.com/slow').expect(422);
      serve('<html><body><script>1</script></body></html>');
      await read('https://example.com/blog').expect(422);
      expect(prompts).toEqual([]);

      // The whole cap is still there.
      serve(jsonLdPage(PANCAKES));
      await read('https://example.com/one').expect(200);
      await read('https://example.com/two').expect(200);
      await read('https://example.com/three').expect(429);
    });

    it('hands back a read the AI found no recipe in, and one the provider failed', async () => {
      respondWith(reading({ recipeFound: false }));
      await read('https://example.com/odd').expect(422);
      answer = () =>
        Promise.reject(new StructuredOutputAiError('failed', null));
      await read('https://example.com/down').expect(502);
      respondWith({ nope: true });
      await read('https://example.com/bad').expect(502);

      // None stayed counted: the whole cap is left.
      respondWith(reading());
      await read('https://example.com/ok').expect(200);
      await read('https://example.com/ok2').expect(200);
      const res = await read('https://example.com/over').expect(429);
      expect(code(res)).toBe('link.cap_reached');
    });

    it('is separate from the Scan Cap', async () => {
      const caps = app.get(ScanCapService);
      const linkCookie = await signUp(
        app,
        `link-full-${stamp}@example.com`,
        'L',
      );
      const linkFull = client(app, linkCookie, '/api/recipes');
      const scanCookie = await signUp(
        app,
        `link-scan-${stamp}@example.com`,
        'S',
      );
      const scanFull = client(app, scanCookie, '/api/recipes');

      // A full Link Cap leaves every Scan available.
      await read('https://example.com/one', linkFull).expect(200);
      await read('https://example.com/two', linkFull).expect(200);
      await read('https://example.com/three', linkFull).expect(429);
      const linkId = await idOf(linkCookie);
      for (let i = 0; i < 3; i++) await caps.consume(linkId);
      await expect(caps.consume(linkId)).rejects.toMatchObject({
        code: 'scan.cap_reached',
      });

      // A full Scan Cap, in turn, leaves the Link Cap alone.
      const scanId = await idOf(scanCookie);
      for (let i = 0; i < 3; i++) await caps.consume(scanId);
      await read('https://example.com/one', scanFull).expect(200);
      await read('https://example.com/two', scanFull).expect(200);

      const rows = await database
        .select({ kind: scanUsage.kind, count: scanUsage.count })
        .from(scanUsage)
        .where(eq(scanUsage.memberId, scanId));
      expect(rows).toEqual(
        expect.arrayContaining([
          { kind: 'scan', count: 3 },
          { kind: 'link', count: 2 },
        ]),
      );
      expect(rows).toHaveLength(2);
    });
  });

  describe('a page without JSON-LD', () => {
    const TEXT_ONLY = `<!DOCTYPE html><html><head><title>Blog title 7001</title>
      <style>.x { color: red } /* css 7002 */</style>
      <SCRIPT>var tracker = "script 7003";</SCRIPT></head>
      <body><header>Header 7004</header><NAV><ul><li>Nav 7005</li></ul></NAV>
      <!-- comment 7006 -->
      <aside>Aside 7007</aside><noscript>Noscript 7008</noscript>
      <svg><text>Svg 7009</text></svg><template><p>Template 7010</p></template>
      <main><h1>Pancakes &amp; syrup</h1>
      <p>Mix   2 cups&nbsp;flour with<br>1 cup milk &#38; a pinch of &#x73;alt, &lt;sifted&gt; &quot;fine&quot; &apos;ok&apos;.</p>
      <ul><li>Fry 2 min</li><li>Serve</li></ul></main>
      <footer>Footer 7011</footer></body></html>`;

    it('sends the visible text, without scripts, styles, navigation or comments, and returns the same kind of draft', async () => {
      serve(TEXT_ONLY);
      const res = await read('https://example.com/blog').expect(200);
      const body = res.body as RecipeFromLink;

      const prompt = prompts[0].prompt;
      expect(prompt).toContain('Pancakes & syrup');
      expect(prompt).toContain(
        'Mix 2 cups flour with\n1 cup milk & a pinch of salt, <sifted> "fine" \'ok\'.',
      );
      expect(prompt).toContain('Fry 2 min');
      for (const hidden of [
        'Blog title 7001',
        'css 7002',
        'script 7003',
        'Header 7004',
        'Nav 7005',
        'comment 7006',
        'Aside 7007',
        'Noscript 7008',
        'Svg 7009',
        'Template 7010',
        'Footer 7011',
        '&amp;',
        '<h1>',
      ]) {
        expect(prompt).not.toContain(hidden);
      }

      expect(body).toMatchObject({
        kind: 'draft',
        sourceLink: 'https://example.com/blog',
      });
      expect(body.draft).toMatchObject({
        title: 'Pancakes',
        servings: null,
        tips: [],
        guidance: { nutritionNote: null, pairings: [], eatingMoments: [] },
        steps: [
          { text: 'Whisk everything.', timerSeconds: null },
          { text: 'Fry each side.', timerSeconds: 120 },
        ],
      });
      expect(body.draft.lines).toEqual([
        expect.objectContaining({
          ingredientId: flour,
          quantity: 250,
          unit: 'g',
          note: '2 cups',
        }),
        expect.objectContaining({
          ingredientId: null,
          rawName: 'grandma spice',
          optional: true,
          note: 'a pinch, ground',
        }),
      ]);
    });

    it('keeps text after an unclosed navigation or head tag', async () => {
      serve('<html><head><body><nav>Menu<p>Salt and pepper 7020</p>');
      await read('https://example.com/loose').expect(200);
      expect(prompts[0].prompt).toContain('Salt and pepper 7020');
    });

    it('does not stop an unclosed head at a header, and keeps custom elements', async () => {
      serve(
        '<head><title>T</title><body><p>Before header</p><header>Site 7050</header><p>Recipe</p>',
      );
      await read('https://example.com/minified').expect(200);
      expect(prompts[0].prompt).toContain('Before header');
      expect(prompts[0].prompt).toContain('Recipe');
      expect(prompts[0].prompt).not.toContain('Site 7050');

      serve(
        '<body><nav-bar>Bar text 7051</nav-bar><script-x>Custom 7052</script-x><p>Rest 7053</p>',
      );
      await read('https://example.com/custom').expect(200);
      const prompt = prompts[1].prompt;
      expect(prompt).toContain('Bar text 7051');
      expect(prompt).toContain('Custom 7052');
      expect(prompt).toContain('Rest 7053');
    });

    it('keeps the header and footer of an article, and drops the site ones', async () => {
      serve(
        '<body><header>Site header 7060</header><article><header class="entry-header"><h1>Title 7061</h1></header><p>Body</p><footer>Entry footer 7062</footer></article><footer>Site footer 7063</footer></body>',
      );
      await read('https://example.com/article').expect(200);
      const prompt = prompts[0].prompt;
      expect(prompt).toContain('Title 7061');
      expect(prompt).toContain('Entry footer 7062');
      expect(prompt).not.toContain('Site header 7060');
      expect(prompt).not.toContain('Site footer 7063');
    });

    it('does not treat a slash on script as self-closing', async () => {
      serve('<body><script src=x />leak 7070</script><p>Visible 7071</p>');
      await read('https://example.com/slash').expect(200);
      expect(prompts[0].prompt).toContain('Visible 7071');
      expect(prompts[0].prompt).not.toContain('leak 7070');
    });

    it('gives the model the JSON-LD and not the page text when the page has it', async () => {
      serve(
        jsonLdPage(PANCAKES).replace(
          '<body>',
          '<body><p>Distinctive visible words 7030</p>',
        ),
      );
      await read('https://example.com/both').expect(200);
      expect(prompts).toHaveLength(1);
      expect(prompts[0].prompt).toContain('2 cups flour');
      expect(prompts[0].prompt).not.toContain('Distinctive visible words 7030');
      expect(prompts[0].prompt).not.toContain('Blog chatter 5521');
    });

    it('trims a long page to the budget', async () => {
      const marker = 'TAIL-MARKER-7040';
      serve(
        `<html><body><p>Head 7041 ${'word '.repeat(60_000)}</p><p>${marker}</p></body></html>`,
      );
      await read('https://example.com/long').expect(200);
      const prompt = prompts[0].prompt;
      expect(prompt).toContain('Head 7041');
      expect(prompt).not.toContain(marker);
      // Compared with a short page, the long one adds at most the budget.
      serve('<html><body><p>Head 7041</p></body></html>');
      await read('https://example.com/short').expect(200);
      expect(prompt.length - prompts[1].prompt.length).toBeLessThanOrEqual(
        30_000,
      );
    });

    it('is link.no_recipe with no AI call and no cap charge when nothing is visible', async () => {
      serve('<html><body><script>a()</script>  <!-- x -->\n</body></html>');
      const res = await read('https://example.com/empty').expect(422);
      expect(code(res)).toBe('link.no_recipe');
      expect(prompts).toEqual([]);
      // The whole cap is still there.
      serve(TEXT_ONLY);
      await read('https://example.com/a').expect(200);
      await read('https://example.com/b').expect(200);
      await read('https://example.com/c').expect(429);
    });

    it('link.no_recipe when the AI finds none in the page text', async () => {
      serve('<html><body>Just a blog about cats</body></html>');
      respondWith(reading({ recipeFound: false }));
      const res = await read('https://example.com/cats').expect(422);
      expect(code(res)).toBe('link.no_recipe');
      expect(prompts).toHaveLength(1);
    });

    describe('hostile pages finish quickly', () => {
      const cases: [string, string][] = [
        ['unclosed script tags', '<html>' + '<script>'.repeat(200_000)],
        ['unclosed non-raw tags', '<html>' + '<nav>'.repeat(200_000) + 'x'],
        ['unclosed head tags', '<head>'.repeat(200_000) + 'text'],
        ['lone angle brackets', '< '.repeat(500_000) + 'text'],
        ['tag openers without an end', '<a href='.repeat(300_000)],
        ['unclosed comments', '<!--'.repeat(300_000)],
        ['many comments', '<!-- c -->'.repeat(200_000) + 'text'],
        ['deep nesting', '<div>'.repeat(400_000) + 'text'],
        ['nav with one distant close', '<nav>'.repeat(200_000) + '</nav>text'],
        [
          'entities without an end',
          '&#'.repeat(500_000) + '&#x'.repeat(100_000),
        ],
        ['a 3 MB page', '<p>some recipe words</p>'.repeat(130_000)],
        [
          'a Recipe node with deeply nested arrays',
          ldScript(
            `{"@type":"Recipe","name":"x","recipeInstructions":${'['.repeat(400_000)}${']'.repeat(400_000)}}`,
          ) + '<body>Some visible words</body>',
        ],
      ];
      it.each(cases)('%s', async (_name, html) => {
        serve(html);
        const started = Date.now();
        const res = await read('https://example.com/hostile');
        expect(Date.now() - started).toBeLessThan(5000);
        expect([200, 422]).toContain(res.status);
      });
    });
  });

  describe('two reads in flight per Member', () => {
    it('answers link.read_in_progress to a third concurrent read, and the first two succeed', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let startedCount = 0;
      let bothStarted: () => void = () => undefined;
      const twoStarted = new Promise<void>((resolve) => {
        bothStarted = resolve;
      });
      page = async () => {
        startedCount += 1;
        if (startedCount === 2) bothStarted();
        await gate;
        return { finalUrl: 'https://example.com/', html: jsonLdPage(PANCAKES) };
      };
      const first = read('https://example.com/slow-one').then((r) => r);
      const second = read('https://example.com/slow-two').then((r) => r);
      await twoStarted;
      const third = await read('https://example.com/slow-three').expect(429);
      expect(code(third)).toBe('link.read_in_progress');
      expect(fetched).toHaveLength(2);
      release();
      expect((await first).status).toBe(200);
      expect((await second).status).toBe(200);
    });

    it('releases the Member after a failed read', async () => {
      page = () => Promise.reject(new PageFetchError('unreadable', 'timeout'));
      await read('https://example.com/slow').expect(422);
      await read('https://example.com/slow').expect(422);
    });
  });

  describe('a read lasts as long as its connection (ADR 0031)', () => {
    const drafts = async () =>
      (
        (await client(app, memberCookie, '/api/recipe-drafts')
          .get('')
          .expect(200)) as { body: unknown[] }
      ).body;
    const until = async (done: () => boolean) => {
      for (let i = 0; i < 200 && !done(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(done()).toBe(true);
    };

    /** One read at a time per Member: an answer other than 429 means the server is done with the cancelled read. */
    const serverLetGo = async () => {
      for (let i = 0; i < 200; i++) {
        const res = await read('ftp://example.com/x');
        if (res.status !== 429) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('the cancelled read never let go');
    };

    it('aborts the AI call and keeps no Recipe Draft when the request closes mid-read', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      answer = async () => {
        await gate;
        return { data: reading(), requestId: 'late' };
      };
      generateSignals.length = 0;
      const request = read('https://example.com/cancelled');
      void request.then(
        () => undefined,
        () => undefined,
      );
      await until(() => prompts.length === 1);
      request.abort();
      await until(() => generateSignals[0]?.aborted === true);
      release();
      // The Member is free again once the server has let the read go.
      await serverLetGo();
      expect(await drafts()).toEqual([]);
    });

    it('aborts the page fetch when the request closes before the page arrives', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      page = async () => {
        await gate;
        return { finalUrl: 'https://example.com/', html: jsonLdPage(PANCAKES) };
      };
      fetchSignals.length = 0;
      const request = read('https://example.com/cancelled-early');
      void request.then(
        () => undefined,
        () => undefined,
      );
      await until(() => fetched.length === 1);
      request.abort();
      await until(() => fetchSignals[0]?.aborted === true);
      release();
      await serverLetGo();
      expect(prompts).toHaveLength(0);
      expect(await drafts()).toEqual([]);
    });
  });

  describe('pasted text', () => {
    const paste = (
      text: unknown,
      who: ReturnType<typeof client> = member,
      extra: object = {},
    ) => who.post('/from-link', { text, ...extra });
    const PASTED = 'Pancakes\n2 cups flour\n1 cup milk\nWhisk, then fry. 5521';

    it('returns a draft without a Source Link, without fetching', async () => {
      const res = await paste(`  ${PASTED}  `).expect(200);
      const body = res.body as RecipeFromLink;
      expect(fetched).toEqual([]);
      expect(body).toMatchObject({
        kind: 'draft',
        sourceLink: null,
        sourceLanguage: null,
      });
      expect(body.draft.title).toBe('Pancakes');
      expect(body.draft.lines[0]).toMatchObject({
        ingredientId: flour,
        quantity: 250,
        unit: 'g',
        note: '2 cups',
      });
      expect(body.draft.lines[1]).toMatchObject({
        rawName: 'grandma spice',
        optional: true,
      });
      expect(body.draft.steps[1]).toMatchObject({ timerSeconds: 120 });
      expect(prompts).toHaveLength(1);
      expect(prompts[0].prompt).toContain(PASTED);
    });

    it('carries the language choice into the prompt and sets sourceLanguage as for a link', async () => {
      respondWith(reading({ sourceLanguage: 'fr' }));
      const res = await paste(PASTED).expect(200);
      expect((res.body as RecipeFromLink).sourceLanguage).toBe('fr');
      expect(prompts[0].prompt).toContain(
        'Write the title and the steps in English',
      );

      await paste(PASTED, member, { language: 'source' }).expect(200);
      expect(prompts[1].prompt).not.toContain(
        'Write the title and the steps in English',
      );
      expect(prompts[1].prompt).toContain("recipe's own language");
    });

    it('counts against the Link Cap and hands the use back when the AI finds no recipe', async () => {
      await paste(PASTED).expect(200);
      await paste(PASTED).expect(200);
      const res = await paste(PASTED).expect(429);
      expect(code(res)).toBe('link.cap_reached');
      expect(prompts).toHaveLength(2);

      const fresh = client(
        app,
        await signUp(app, `link-paste-${stamp}@example.com`, 'P'),
        '/api/recipes',
      );
      respondWith(reading({ recipeFound: false }));
      const none = await paste('Just my diary', fresh).expect(422);
      expect(code(none)).toBe('link.no_recipe');
      await paste('Still my diary', fresh).expect(422);
      respondWith(reading());
      await paste(PASTED, fresh).expect(200);
      await paste(PASTED, fresh).expect(200);
      await paste(PASTED, fresh).expect(429);
    });

    it('maps provider failures like a link read', async () => {
      answer = () =>
        Promise.reject(new StructuredOutputAiError('failed', null));
      const res = await paste(PASTED).expect(502);
      expect(code(res)).toBe('scan.provider_unavailable');
    });

    it('treats text as data: it never reaches the fetcher even when it holds a link', async () => {
      await paste('https://example.com/recipe').expect(200);
      expect(fetched).toEqual([]);
    });
  });

  describe('exactly one of a link and pasted text', () => {
    it.each([
      ['both', { url: 'https://example.com/a', text: 'Some recipe' }],
      ['neither', {}],
      ['empty text', { text: '' }],
      ['whitespace-only text', { text: ' \n\t ' }],
      ['text over the limit', { text: 'a'.repeat(50_001) }],
      ['an unknown field', { text: 'Some recipe', extra: 1 }],
      ['non-string text', { text: 5 }],
    ])('%s is refused without fetching or charging', async (_name, body) => {
      const res = await member.post('/from-link', body).expect(400);
      expect(code(res)).toBe('validation_failed');
      expect(fetched).toEqual([]);
      expect(prompts).toEqual([]);
    });

    it('treats blank text beside a link as just the link', async () => {
      await member
        .post('/from-link', { url: 'https://example.com/a', text: '  ' })
        .expect(200);
      expect(fetched).toEqual(['https://example.com/a']);
    });

    it('takes text at the limit and leaves the Link Cap untouched by refusals', async () => {
      await member.post('/from-link', { text: '' }).expect(400);
      await member.post('/from-link', { text: 'a'.repeat(50_000) }).expect(200);
      await member.post('/from-link', { text: 'x' }).expect(200);
      await member.post('/from-link', { text: 'y' }).expect(429);
    });
  });

  it('saves nothing', async () => {
    const before = await database
      .select()
      .from(recipes)
      .where(eq(recipes.title, 'Pancakes'));
    await read('https://example.com/nosave').expect(200);
    expect(
      await database
        .select()
        .from(recipes)
        .where(eq(recipes.title, 'Pancakes')),
    ).toHaveLength(before.length);
  });

  describe('the Recipe Draft of a read (ADR 0031)', () => {
    const drafts = () => client(app, memberCookie, '/api/recipe-drafts');
    const blank = (title: string) => ({
      kind: 'new_recipe',
      content: {
        title,
        servings: '4',
        prepMinutes: '',
        cookMinutes: '',
        difficulty: '',
        lines: [],
        steps: [],
      },
    });
    const fillDrafts = async (count: number) => {
      for (let i = 0; i < count; i++) {
        await drafts()
          .post('', blank(`Held ${i}`))
          .expect(201);
      }
    };
    const usedToday = async () => {
      const id = (
        (await client(app, memberCookie, '/api/auth').get('/get-session'))
          .body as { user: { id: string } }
      ).user.id;
      const rows = await database
        .select()
        .from(scanUsage)
        .where(eq(scanUsage.memberId, id));
      return rows
        .filter((r) => r.kind === 'link')
        .reduce((n, r) => n + r.count, 0);
    };

    it("stores the read as the Member's Recipe Draft and returns its id, so a reload still finds it in Drafts", async () => {
      const res = await read('https://example.com/pancakes').expect(200);
      const body = res.body as RecipeFromLink;
      expect(body.recipeDraftId).toEqual(expect.any(String));

      const got = await drafts().get(`/${body.recipeDraftId}`).expect(200);
      expect(got.body).toMatchObject({
        id: body.recipeDraftId,
        kind: 'new_recipe',
        baseRecipeId: null,
        content: {
          title: 'Pancakes',
          servings: '',
          prepMinutes: '10',
          cookMinutes: '15',
          tagIds: [],
          sourceLink: 'https://example.com/pancakes',
          sourceLanguage: null,
          plateScan: false,
          offersBases: true,
          steps: [
            { text: 'Whisk everything.', timer: '' },
            { text: 'Fry each side.', timer: '2' },
          ],
          lines: [
            { ingredientId: flour, name: 'Flour', quantity: '250', unit: 'g' },
            {
              ingredientId: '',
              name: 'grandma spice',
              quantity: '',
              optional: true,
              note: 'a pinch, ground',
            },
          ],
        },
      });

      const listed = await drafts().get('').expect(200);
      expect(listed.body).toEqual([
        expect.objectContaining({
          id: body.recipeDraftId,
          title: 'Pancakes',
          origin: { type: 'link', domain: 'example.com' },
        }),
      ]);
    });

    it('keeps the language of a translation, and the top closest Base Recipe as the pick', async () => {
      respondWith(reading({ sourceLanguage: 'fr' }));
      const res = await read('https://example.com/crepes').expect(200);
      const body = res.body as RecipeFromLink;
      const got = await drafts().get(`/${body.recipeDraftId}`).expect(200);
      expect(got.body).toMatchObject({
        content: {
          sourceLanguage: 'fr',
          pickedBaseId: body.closestBases[0]?.id ?? null,
        },
      });
    });

    it('stores pasted text as a Recipe Draft with no Source Link', async () => {
      const res = await member.post('/from-link', { text: 'Soup' }).expect(200);
      const body = res.body as RecipeFromLink;
      const got = await drafts().get(`/${body.recipeDraftId}`).expect(200);
      expect(got.body).toMatchObject({
        content: { sourceLink: null, title: 'Pancakes' },
      });
    });

    it('stores no Recipe Draft when the read fails', async () => {
      respondWith(reading({ recipeFound: false }));
      await read('https://example.com/none').expect(422);
      expect((await drafts().get('').expect(200)).body).toEqual([]);
    });

    it('refuses at 20 Recipe Drafts before any fetch or AI call, and leaves the Link Cap untouched', async () => {
      await fillDrafts(20);
      const res = await read('https://example.com/full').expect(409);
      expect(code(res)).toBe('recipe_drafts.limit_reached');
      expect(res.body).toMatchObject({ params: { max: 20 } });
      await member.post('/from-link', { text: 'Soup' }).expect(409);
      expect(fetched).toEqual([]);
      expect(prompts).toEqual([]);
      expect(await usedToday()).toBe(0);
      expect((await drafts().get('').expect(200)).body).toHaveLength(20);
    });

    it('still reads at 19 and then refuses the next', async () => {
      await fillDrafts(19);
      await read('https://example.com/last').expect(200);
      expect((await drafts().get('').expect(200)).body).toHaveLength(20);
      await read('https://example.com/over').expect(409);
      expect(prompts).toHaveLength(1);
    });

    it('answers a duplicate link as a duplicate and creates no Recipe Draft', async () => {
      const saved = await member
        .post('', {
          title: `Dup draft ${stamp}`,
          servings: 2,
          locale: 'en',
          parentId: null,
          lines: [{ ingredientId: flour, quantity: 50, unit: 'g' }],
          steps: [{ text: 'Whisk' }],
          sourceLink: 'https://example.com/dup-draft',
        })
        .expect(201);
      const res = await read('https://example.com/dup-draft').expect(200);
      expect(res.body).toEqual({
        kind: 'duplicate',
        recipeId: (saved.body as { id: string }).id,
      });
      expect(fetched).toEqual([]);
      expect(prompts).toEqual([]);
      expect((await drafts().get('').expect(200)).body).toEqual([]);
    });

    it('answers a duplicate even at 20 Recipe Drafts', async () => {
      const saved = await member
        .post('', {
          title: `Dup full ${stamp}`,
          servings: 2,
          locale: 'en',
          parentId: null,
          lines: [{ ingredientId: flour, quantity: 50, unit: 'g' }],
          steps: [{ text: 'Whisk' }],
          sourceLink: 'https://example.com/dup-full',
        })
        .expect(201);
      await fillDrafts(20);
      const res = await read('https://example.com/dup-full').expect(200);
      expect(res.body).toEqual({
        kind: 'duplicate',
        recipeId: (saved.body as { id: string }).id,
      });
    });
  });
});

describe('Already in your Recipes (integration)', () => {
  let app: NestFastifyApplication;
  let member: ReturnType<typeof client>;
  const stamp = Date.now();
  const prompts: StructuredOutputRequest[] = [];
  const fetched: string[] = [];
  let count = 0;
  let memberCookie: string;

  beforeAll(async () => {
    const pageFetcher: PageFetcher = {
      fetchPage: (url) => {
        fetched.push(url);
        return Promise.resolve({
          finalUrl: 'https://elsewhere.example.com/',
          html: jsonLdPage(PANCAKES),
        });
      },
    };
    app = await createTestApp(
      [],
      {
        generate: (input) => {
          prompts.push(input);
          return Promise.resolve({ data: reading(), requestId: 'fake' });
        },
      },
      undefined,
      undefined,
      undefined,
      pageFetcher,
    );
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    memberCookie = await newCookie();
    member = client(app, memberCookie, '/api/recipes');
    prompts.length = 0;
    fetched.length = 0;
  });

  const newCookie = () =>
    signUp(app, `dup-${stamp}-${++count}@example.com`, 'D');
  const freshMember = async () =>
    client(app, await newCookie(), '/api/recipes');
  const save = async (who: typeof member, sourceLink: string) => {
    const res = await who
      .post('', {
        title: `Saved ${stamp}-${++count}`,
        servings: 2,
        locale: 'en',
        parentId: null,
        lines: [{ ingredientId: flour, quantity: 50, unit: 'g' }],
        steps: [{ text: 'Whisk' }],
        sourceLink,
      })
      .expect(201);
    return res.body as AdminRecipeDetail;
  };
  const read = (url: string, who = member, extra: object = {}) =>
    who.post('/from-link', { url, ...extra });
  const expectUntouched = () => {
    expect(fetched).toHaveLength(0);
    expect(prompts).toHaveLength(0);
  };

  it('answers with the saved Recipe, without fetching, reading or using the Link Cap', async () => {
    const saved = await save(member, 'https://example.com/soup');
    for (let i = 0; i < 3; i++) {
      const res = await read('https://example.com/soup').expect(200);
      expect(res.body).toEqual({ kind: 'duplicate', recipeId: saved.id });
    }
    expectUntouched();
    // The cap (2) is still whole: two real reads succeed afterwards.
    await read('https://example.com/other').expect(200);
    await read('https://example.com/another').expect(200);
    expect(prompts).toHaveLength(2);
  });

  describe('the duplicate check (GET /link-check)', () => {
    const check = (url: string, who = member) =>
      who.get(`/link-check?url=${encodeURIComponent(url)}`);

    it('requires authentication', async () => {
      await client(app, '', '/api/recipes')
        .get('/link-check?url=https%3A%2F%2Fexample.com%2F')
        .expect(401);
    });

    it('answers the Recipe a link normalises to, and none for other links', async () => {
      const saved = await save(member, 'https://example.com/soup?id=1');
      for (const same of [
        'https://example.com/soup?id=1',
        'https://EXAMPLE.com/soup?id=1#step-2',
        'https://example.com/soup?id=1&utm_source=mail',
      ]) {
        const res = await check(same).expect(200);
        expect(res.body).toEqual({ recipeId: saved.id });
      }
      for (const other of [
        'https://example.com/soup?id=2',
        'https://example.com/stew?id=1',
        'not a link',
      ]) {
        const res = await check(other).expect(200);
        expect(res.body).toEqual({ recipeId: null });
      }
    });

    it("does not answer an archived Recipe or another Family's Recipe", async () => {
      const archived = await save(member, 'https://example.com/old');
      await member.post(`/${archived.id}/archive`).expect(200);
      await save(await freshMember(), 'https://example.com/theirs');
      expect((await check('https://example.com/old')).body).toEqual({
        recipeId: null,
      });
      expect((await check('https://example.com/theirs')).body).toEqual({
        recipeId: null,
      });
    });

    it('never fetches, reads or counts against the Link Cap', async () => {
      await save(member, 'https://example.com/soup');
      for (let i = 0; i < 5; i++) {
        await check('https://example.com/soup').expect(200);
        await check('https://example.com/new').expect(200);
      }
      expectUntouched();
      // The cap (2) is still whole: two real reads succeed afterwards.
      await read('https://example.com/other').expect(200);
      await read('https://example.com/another').expect(200);
    });
  });

  it('refuses a sourceLanguage without a sourceLink', async () => {
    const res = await member
      .post('', {
        title: `Lang ${stamp}-${++count}`,
        servings: 2,
        locale: 'en',
        parentId: null,
        lines: [{ ingredientId: flour, quantity: 50, unit: 'g' }],
        steps: [{ text: 'Whisk' }],
        sourceLanguage: 'ro',
      })
      .expect(400);
    expect(code(res)).toBe('validation_failed');
  });

  it('keeps the Source Link normalised on create', async () => {
    const saved = await save(
      member,
      'https://Example.com/soup?utm_source=a&id=1&fbclid=x#top',
    );
    expect(saved.sourceLink).toBe('https://example.com/soup?id=1');
    const detail = (await member.get(`/${saved.id}`).expect(200)).body as {
      sourceLink: string;
    };
    expect(detail.sourceLink).toBe('https://example.com/soup?id=1');
  });

  it('ignores the fragment, tracking parameters and the host case', async () => {
    const saved = await save(member, 'https://example.com/soup?id=1');
    for (const variant of [
      'https://EXAMPLE.com/soup?id=1#step-2',
      'https://example.com/soup?id=1&utm_source=mail&utm_MEDIUM=x',
      'https://example.com/soup?fbclid=abc&id=1',
      'https://example.com/soup?id=1&gclid=abc&msclkid=1&_ga=2.1',
      'https://example.com/soup?id=1&',
      'https://example.com/soup?id=1&utm_source=x&',
    ]) {
      const res = await read(variant).expect(200);
      expect(res.body).toEqual({ kind: 'duplicate', recipeId: saved.id });
    }
    expectUntouched();
  });

  it('keeps the other parameters exactly as written when dropping tracking', async () => {
    const saved = await save(
      member,
      'https://example.com/soup?q=a%20b&flag&t=~x&s=a/b',
    );
    const res = await read(
      'https://example.com/soup?q=a%20b&flag&utm_source=x&t=~x&gclid=1&s=a/b',
    ).expect(200);
    expect(res.body).toEqual({ kind: 'duplicate', recipeId: saved.id });
  });

  it('drops a bare trailing question mark', async () => {
    const saved = await save(member, 'https://example.com/plain?');
    expect(saved.sourceLink).toBe('https://example.com/plain');
    const res = await read('https://example.com/plain?utm_source=x').expect(
      200,
    );
    expect(res.body).toEqual({ kind: 'duplicate', recipeId: saved.id });
  });

  it('finds the Recipe saved from a draft, by the submitted link and not the final one', async () => {
    const drafted = (
      await read('https://Example.com/pie?utm_source=a#x').expect(200)
    ).body as LinkReadResult;
    if (drafted.kind !== 'draft') throw new Error('expected a draft');
    expect(drafted.sourceLink).toBe('https://example.com/pie');
    if (drafted.sourceLink === null) throw new Error('expected a link');
    const saved = await save(member, drafted.sourceLink);
    const again = await read('https://example.com/pie?fbclid=z').expect(200);
    expect(again.body).toEqual({ kind: 'duplicate', recipeId: saved.id });
  });

  it('is shared by every Member of the Family', async () => {
    const saved = await save(member, 'https://example.com/soup');
    const family = (
      await client(app, memberCookie, '/api/family').get('').expect(200)
    ).body as { inviteCode: string };
    const secondCookie = await newCookie();
    const second = client(app, secondCookie, '/api/recipes');
    await client(app, secondCookie, '/api/family')
      .post('/join', { code: family.inviteCode })
      .expect(201);
    const res = await read('https://example.com/soup', second).expect(200);
    expect(res.body).toEqual({ kind: 'duplicate', recipeId: saved.id });
  });

  it('treats a link with another path or a real parameter as new', async () => {
    await save(member, 'https://example.com/soup?id=1');
    for (const other of [
      'https://example.com/soup?id=2',
      'https://example.com/stew?id=1',
    ]) {
      const res = await read(other).expect(200);
      expect((res.body as LinkReadResult).kind).toBe('draft');
    }
  });

  it('is scoped to the Family', async () => {
    const other = await freshMember();
    await save(other, 'https://example.com/soup');
    const res = await read('https://example.com/soup').expect(200);
    expect((res.body as LinkReadResult).kind).toBe('draft');
    expect(prompts).toHaveLength(1);
  });

  it('does not count an archived Recipe', async () => {
    const saved = await save(member, 'https://example.com/soup');
    await member.post(`/${saved.id}/archive`).expect(200);
    const res = await read('https://example.com/soup').expect(200);
    expect((res.body as LinkReadResult).kind).toBe('draft');
  });

  it('names the newest live Recipe when several have the link', async () => {
    const older = await save(member, 'https://example.com/soup');
    const newer = await save(member, 'https://example.com/soup#again');
    const archived = await save(member, 'https://example.com/soup?utm_x=1');
    await member.post(`/${archived.id}/archive`).expect(200);
    expect(older.id).not.toBe(newer.id);
    const res = await read('https://example.com/soup').expect(200);
    expect(res.body).toEqual({ kind: 'duplicate', recipeId: newer.id });
  });

  it('reads anyway with force', async () => {
    await save(member, 'https://example.com/soup');
    const res = await read('https://example.com/soup', member, {
      force: true,
    }).expect(200);
    expect((res.body as LinkReadResult).kind).toBe('draft');
    expect(fetched).toHaveLength(1);
    expect(prompts).toHaveLength(1);
  });

  it('still refuses an invalid link before the check', async () => {
    const res = await read('ftp://example.com/soup').expect(400);
    expect((res.body as { code: string }).code).toBe('link.invalid');
  });

  it('keeps the strict body: unknown fields and a non-boolean force are refused', async () => {
    await read('https://example.com/a', member, { extra: 1 }).expect(400);
    await read('https://example.com/a', member, { force: 'yes' }).expect(400);
  });

  it('never treats pasted text as a link, even one equal to a saved Source Link', async () => {
    await save(member, 'https://example.com/soup');
    const res = await member
      .post('/from-link', { text: 'https://example.com/soup' })
      .expect(200);
    const body = res.body as LinkReadResult;
    expect(body.kind).toBe('draft');
    expect(prompts).toHaveLength(1);
    expect(fetched).toHaveLength(0);
  });

  it('accepts force with pasted text and ignores it', async () => {
    await save(member, 'https://example.com/soup');
    const res = await member
      .post('/from-link', {
        text: 'Pancakes: flour, eggs, whisk.',
        force: true,
      })
      .expect(200);
    expect((res.body as LinkReadResult).kind).toBe('draft');
  });
});
