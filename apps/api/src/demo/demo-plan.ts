// What `demo:seed` writes into the Demo Family. Pure data with no imports, so the web test
// (apps/web/src/lib/health.demo-seed.test.ts) can run it through the real Pantry Health.
// Ingredients and Catalog Recipes are named by their Catalog seed slug. Dates are offsets from
// the day the seed runs, so a re-run gives the same Pantry Health on any day.

export type DemoUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';
export type DemoLocation = 'fridge' | 'freezer' | 'cupboard' | 'spices';

export type DemoBatch = {
  ingredient: string;
  location: DemoLocation;
  quantity: number;
  unit: DemoUnit;
  /** Days from the seed day to the expiry date; negative is Expired, null is undated. */
  expiresIn: number | null;
  /** How many days before the seed day the Batch was added. */
  addedDaysAgo: number;
};

export type DemoShoppingItem = {
  /** A Catalog Ingredient slug, or a typed name for an Unmatched item. */
  ingredient?: string;
  name?: string;
  quantity: number;
  unit: DemoUnit;
  checked: boolean;
  /** The Family Recipe keys that added it (Source Recipes). */
  from?: string[];
};

export type DemoLine = {
  /** A Catalog Ingredient slug, or a typed name for an Unmatched line. */
  ingredient?: string;
  rawName?: string;
  quantity?: number;
  unit?: DemoUnit;
  optional?: boolean;
  note?: string;
};

export type DemoRecipe = {
  key: string;
  title: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  /** A Variant of this Family Recipe key. */
  variantOf?: string;
  lines: DemoLine[];
  steps: Array<{ text: string; timerSeconds?: number }>;
};

/** A Plan Slot's Recipe: a Family Recipe key, a Catalog Recipe slug, or the Add to Family copy. */
export type DemoSlotRecipe =
  { family: string } | { catalog: string } | { copy: string };

export const DEMO_NAME = 'Demo Gator';
export const DEMO_GRANT_REASON = 'Demo account';
export const DEMO_CREDITS = 1000;
export const DEMO_PLAN_SERVINGS = 4;

export const DEMO_STAPLES = [
  'salt',
  'sunflower-oil',
  'olive-oil',
  'flour',
  'sugar',
  'rice',
  'eggs',
  'garlic',
  'onion',
  'butter',
  'milk',
] as const;

/** Flagged Running low. Eggs and butter are on the Shopping List; the rest are not. */
export const DEMO_RUNNING_LOW = [
  'eggs',
  'butter',
  'flour',
  'rice',
  'garlic',
  'honey',
  'sunflower-oil',
  'paprika',
  'cornmeal',
] as const;

export const DEMO_BATCHES: DemoBatch[] = [
  // Spices and cupboard.
  {
    ingredient: 'salt',
    location: 'spices',
    quantity: 500,
    unit: 'g',
    expiresIn: null,
    addedDaysAgo: 60,
  },
  {
    ingredient: 'black-pepper',
    location: 'spices',
    quantity: 50,
    unit: 'g',
    expiresIn: null,
    addedDaysAgo: 100,
  },
  {
    ingredient: 'paprika',
    location: 'spices',
    quantity: 20,
    unit: 'g',
    expiresIn: 250,
    addedDaysAgo: 50,
  },
  // Forgotten: undated and past the Spices limit.
  {
    ingredient: 'bay-leaves',
    location: 'spices',
    quantity: 10,
    unit: 'g',
    expiresIn: null,
    addedDaysAgo: 800,
  },
  // Forgotten: undated and past the Cupboard limit.
  {
    ingredient: 'baking-soda',
    location: 'cupboard',
    quantity: 200,
    unit: 'g',
    expiresIn: null,
    addedDaysAgo: 420,
  },
  {
    ingredient: 'sunflower-oil',
    location: 'cupboard',
    quantity: 200,
    unit: 'ml',
    expiresIn: 200,
    addedDaysAgo: 20,
  },
  {
    ingredient: 'flour',
    location: 'cupboard',
    quantity: 300,
    unit: 'g',
    expiresIn: 120,
    addedDaysAgo: 40,
  },
  {
    ingredient: 'rice',
    location: 'cupboard',
    quantity: 250,
    unit: 'g',
    expiresIn: 300,
    addedDaysAgo: 30,
  },
  {
    ingredient: 'cornmeal',
    location: 'cupboard',
    quantity: 1000,
    unit: 'g',
    expiresIn: 150,
    addedDaysAgo: 10,
  },
  {
    ingredient: 'spaghetti',
    location: 'cupboard',
    quantity: 500,
    unit: 'g',
    expiresIn: 400,
    addedDaysAgo: 15,
  },
  {
    ingredient: 'oats',
    location: 'cupboard',
    quantity: 500,
    unit: 'g',
    expiresIn: 180,
    addedDaysAgo: 12,
  },
  {
    ingredient: 'canned-tomatoes',
    location: 'cupboard',
    quantity: 800,
    unit: 'g',
    expiresIn: 500,
    addedDaysAgo: 25,
  },
  {
    ingredient: 'tomato-paste',
    location: 'cupboard',
    quantity: 140,
    unit: 'g',
    expiresIn: 2,
    addedDaysAgo: 12,
  },
  {
    ingredient: 'honey',
    location: 'cupboard',
    quantity: 80,
    unit: 'g',
    expiresIn: 600,
    addedDaysAgo: 90,
  },
  {
    ingredient: 'jam',
    location: 'cupboard',
    quantity: 350,
    unit: 'g',
    expiresIn: 90,
    addedDaysAgo: 14,
  },
  {
    ingredient: 'onion',
    location: 'cupboard',
    quantity: 6,
    unit: 'pcs',
    expiresIn: 25,
    addedDaysAgo: 7,
  },
  {
    ingredient: 'garlic',
    location: 'cupboard',
    quantity: 30,
    unit: 'g',
    expiresIn: 30,
    addedDaysAgo: 10,
  },
  {
    ingredient: 'potato',
    location: 'cupboard',
    quantity: 2,
    unit: 'kg',
    expiresIn: 28,
    addedDaysAgo: 8,
  },
  // Fridge.
  {
    ingredient: 'eggs',
    location: 'fridge',
    quantity: 2,
    unit: 'pcs',
    expiresIn: 9,
    addedDaysAgo: 6,
  },
  {
    ingredient: 'butter',
    location: 'fridge',
    quantity: 50,
    unit: 'g',
    expiresIn: 20,
    addedDaysAgo: 15,
  },
  {
    ingredient: 'milk',
    location: 'fridge',
    quantity: 1,
    unit: 'l',
    expiresIn: -2,
    addedDaysAgo: 12,
  },
  {
    ingredient: 'sour-cream',
    location: 'fridge',
    quantity: 200,
    unit: 'g',
    expiresIn: -1,
    addedDaysAgo: 10,
  },
  {
    ingredient: 'telemea',
    location: 'fridge',
    quantity: 300,
    unit: 'g',
    expiresIn: 2,
    addedDaysAgo: 5,
  },
  {
    ingredient: 'cottage-cheese',
    location: 'fridge',
    quantity: 250,
    unit: 'g',
    expiresIn: 1,
    addedDaysAgo: 6,
  },
  {
    ingredient: 'greek-yogurt',
    location: 'fridge',
    quantity: 400,
    unit: 'g',
    expiresIn: 3,
    addedDaysAgo: 7,
  },
  {
    ingredient: 'minced-pork',
    location: 'fridge',
    quantity: 500,
    unit: 'g',
    expiresIn: 1,
    addedDaysAgo: 2,
  },
  {
    ingredient: 'bacon',
    location: 'fridge',
    quantity: 200,
    unit: 'g',
    expiresIn: 18,
    addedDaysAgo: 8,
  },
  {
    ingredient: 'sauerkraut',
    location: 'fridge',
    quantity: 1000,
    unit: 'g',
    expiresIn: 40,
    addedDaysAgo: 20,
  },
  {
    ingredient: 'carrot',
    location: 'fridge',
    quantity: 600,
    unit: 'g',
    expiresIn: -2,
    addedDaysAgo: 4,
  },
  {
    ingredient: 'bell-pepper',
    location: 'fridge',
    quantity: 3,
    unit: 'pcs',
    expiresIn: -3,
    addedDaysAgo: 14,
  },
  {
    ingredient: 'dill',
    location: 'fridge',
    quantity: 30,
    unit: 'g',
    expiresIn: -4,
    addedDaysAgo: 10,
  },
  {
    ingredient: 'parsley',
    location: 'fridge',
    quantity: 40,
    unit: 'g',
    expiresIn: 2,
    addedDaysAgo: 3,
  },
  {
    ingredient: 'lemon',
    location: 'fridge',
    quantity: 2,
    unit: 'pcs',
    expiresIn: -1,
    addedDaysAgo: 21,
  },
  {
    ingredient: 'parmesan',
    location: 'fridge',
    quantity: 150,
    unit: 'g',
    expiresIn: 0,
    addedDaysAgo: 30,
  },
  // Freezer.
  {
    ingredient: 'chicken-thighs',
    location: 'freezer',
    quantity: 1000,
    unit: 'g',
    expiresIn: 80,
    addedDaysAgo: 30,
  },
  {
    ingredient: 'frozen-peas',
    location: 'freezer',
    quantity: 450,
    unit: 'g',
    expiresIn: 200,
    addedDaysAgo: 45,
  },
  {
    ingredient: 'frozen-berries',
    location: 'freezer',
    quantity: 300,
    unit: 'g',
    expiresIn: -5,
    addedDaysAgo: 200,
  },
];

export const DEMO_SHOPPING: DemoShoppingItem[] = [
  { ingredient: 'milk', quantity: 2, unit: 'l', checked: false },
  { ingredient: 'eggs', quantity: 10, unit: 'pcs', checked: false },
  { ingredient: 'butter', quantity: 250, unit: 'g', checked: false },
  {
    ingredient: 'sour-cream',
    quantity: 400,
    unit: 'g',
    checked: false,
    from: ['mamaliga', 'papanasi'],
  },
  {
    ingredient: 'minced-beef',
    quantity: 500,
    unit: 'g',
    checked: false,
    from: ['perisoare'],
  },
  {
    ingredient: 'celeriac',
    quantity: 300,
    unit: 'g',
    checked: false,
    from: ['perisoare'],
  },
  {
    ingredient: 'lovage',
    quantity: 20,
    unit: 'g',
    checked: false,
    from: ['perisoare'],
  },
  {
    ingredient: 'button-mushrooms',
    quantity: 400,
    unit: 'g',
    checked: false,
    from: ['sarmale-post'],
  },
  { ingredient: 'chicken-breast', quantity: 600, unit: 'g', checked: false },
  { ingredient: 'tomato', quantity: 600, unit: 'g', checked: false },
  { ingredient: 'cucumber', quantity: 2, unit: 'pcs', checked: false },
  { name: 'Birthday candles', quantity: 1, unit: 'pcs', checked: false },
  { ingredient: 'bread', quantity: 1, unit: 'pcs', checked: true },
  { ingredient: 'banana', quantity: 6, unit: 'pcs', checked: true },
  { ingredient: 'apple', quantity: 6, unit: 'pcs', checked: true },
  { ingredient: 'coffee', quantity: 250, unit: 'g', checked: true },
];

export const DEMO_RECIPES: DemoRecipe[] = [
  {
    key: 'sarmale',
    title: "Grandma's sarmale",
    servings: 8,
    prepMinutes: 60,
    cookMinutes: 180,
    difficulty: 'hard',
    lines: [
      {
        ingredient: 'sauerkraut',
        quantity: 1500,
        unit: 'g',
        note: 'whole soured cabbage leaves, rinsed',
      },
      { ingredient: 'minced-pork', quantity: 800, unit: 'g' },
      { ingredient: 'rice', quantity: 120, unit: 'g', note: 'rinsed' },
      { ingredient: 'onion', quantity: 2, unit: 'pcs', note: 'finely chopped' },
      {
        ingredient: 'bacon',
        quantity: 150,
        unit: 'g',
        note: 'smoked, in strips',
      },
      { ingredient: 'tomato-paste', quantity: 70, unit: 'g' },
      { ingredient: 'dill', quantity: 20, unit: 'g' },
      { ingredient: 'bay-leaves', quantity: 1, unit: 'g' },
      { ingredient: 'paprika', quantity: 5, unit: 'g' },
      { ingredient: 'black-pepper', quantity: 2, unit: 'g' },
      { ingredient: 'salt', quantity: 10, unit: 'g' },
      {
        ingredient: 'sour-cream',
        quantity: 200,
        unit: 'g',
        optional: true,
        note: 'to serve',
      },
    ],
    steps: [
      {
        text: 'Soften the onion in a little oil, then let it cool. Mix it with the pork, rice, paprika, pepper and salt.',
      },
      {
        text: 'Lay out a cabbage leaf, put a spoonful of filling at the thick end, roll it up and tuck the sides in.',
      },
      {
        text: 'Line a heavy pot with chopped leftover cabbage, then pack in the rolls in layers with the bacon, dill and bay leaves between them.',
      },
      {
        text: 'Stir the tomato paste into hot water, pour it over until the rolls are just covered, and simmer on low with the lid on.',
        timerSeconds: 10_800,
      },
      {
        text: 'Serve hot with sour cream and mămăligă. They are even better the next day.',
      },
    ],
  },
  {
    key: 'sarmale-post',
    title: 'Sarmale de post (mushroom and rice)',
    servings: 6,
    prepMinutes: 45,
    cookMinutes: 120,
    difficulty: 'medium',
    variantOf: 'sarmale',
    lines: [
      { ingredient: 'sauerkraut', quantity: 1200, unit: 'g' },
      {
        ingredient: 'button-mushrooms',
        quantity: 400,
        unit: 'g',
        note: 'finely chopped',
      },
      { ingredient: 'rice', quantity: 200, unit: 'g' },
      { ingredient: 'onion', quantity: 2, unit: 'pcs' },
      { ingredient: 'carrot', quantity: 150, unit: 'g', note: 'grated' },
      { ingredient: 'tomato-paste', quantity: 70, unit: 'g' },
      { ingredient: 'dill', quantity: 20, unit: 'g' },
      { ingredient: 'sunflower-oil', quantity: 60, unit: 'ml' },
      { ingredient: 'salt', quantity: 8, unit: 'g' },
    ],
    steps: [
      {
        text: 'Fry the onion, carrot and mushrooms in the oil until the liquid has gone, then stir in the rice and half the dill.',
      },
      {
        text: 'Roll the filling in the cabbage leaves as for the meat sarmale.',
      },
      {
        text: 'Layer in the pot, cover with tomato water and simmer on low.',
        timerSeconds: 7_200,
      },
    ],
  },
  {
    key: 'perisoare',
    title: 'Ciorbă de perișoare',
    servings: 6,
    prepMinutes: 30,
    cookMinutes: 60,
    difficulty: 'medium',
    lines: [
      { ingredient: 'minced-beef', quantity: 250, unit: 'g' },
      { ingredient: 'minced-pork', quantity: 250, unit: 'g' },
      { ingredient: 'rice', quantity: 60, unit: 'g' },
      { ingredient: 'eggs', quantity: 1, unit: 'pcs' },
      { ingredient: 'onion', quantity: 1, unit: 'pcs' },
      { ingredient: 'carrot', quantity: 150, unit: 'g', note: 'diced' },
      { ingredient: 'celeriac', quantity: 150, unit: 'g', note: 'diced' },
      { ingredient: 'bell-pepper', quantity: 1, unit: 'pcs', note: 'diced' },
      { ingredient: 'canned-tomatoes', quantity: 400, unit: 'g' },
      {
        rawName: 'Borș',
        quantity: 1,
        unit: 'l',
        note: 'or the juice of 2 lemons',
      },
      {
        ingredient: 'lovage',
        quantity: 10,
        unit: 'g',
        note: 'chopped, at the end',
      },
      { ingredient: 'salt', quantity: 10, unit: 'g' },
    ],
    steps: [
      {
        text: 'Simmer the onion, carrot, celeriac and pepper in 2.5 l of water for 15 minutes.',
        timerSeconds: 900,
      },
      {
        text: 'Mix both minces with the rice, the egg and a pinch of salt. Roll into walnut-sized balls with wet hands.',
      },
      {
        text: 'Drop the balls into the simmering soup, add the tomatoes and cook until the rice is soft.',
        timerSeconds: 1_800,
      },
      {
        text: 'Pour in the borș, bring back to a boil once, then take off the heat and add the lovage.',
      },
    ],
  },
  {
    key: 'mamaliga',
    title: 'Mămăligă cu brânză și smântână',
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 25,
    difficulty: 'easy',
    lines: [
      { ingredient: 'cornmeal', quantity: 300, unit: 'g' },
      { ingredient: 'telemea', quantity: 250, unit: 'g', note: 'crumbled' },
      { ingredient: 'sour-cream', quantity: 200, unit: 'g' },
      { ingredient: 'butter', quantity: 40, unit: 'g' },
      { ingredient: 'salt', quantity: 8, unit: 'g' },
      {
        ingredient: 'eggs',
        quantity: 4,
        unit: 'pcs',
        optional: true,
        note: 'fried, on top',
      },
    ],
    steps: [
      {
        text: 'Bring 1.2 l of salted water to the boil and rain in the cornmeal, whisking all the time.',
      },
      {
        text: 'Turn the heat low and stir with a wooden spoon until it pulls away from the pot.',
        timerSeconds: 1_200,
      },
      {
        text: 'Stir in the butter, then serve topped with telemea, sour cream and a fried egg.',
      },
    ],
  },
  {
    key: 'papanasi',
    title: 'Papanași',
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 20,
    difficulty: 'medium',
    lines: [
      { ingredient: 'cottage-cheese', quantity: 500, unit: 'g' },
      { ingredient: 'eggs', quantity: 2, unit: 'pcs' },
      { ingredient: 'flour', quantity: 200, unit: 'g' },
      { ingredient: 'sugar', quantity: 50, unit: 'g' },
      { ingredient: 'vanilla-sugar', quantity: 8, unit: 'g' },
      { ingredient: 'baking-soda', quantity: 3, unit: 'g' },
      { ingredient: 'lemon', quantity: 1, unit: 'pcs', note: 'zest only' },
      {
        ingredient: 'sunflower-oil',
        quantity: 750,
        unit: 'ml',
        note: 'for frying',
      },
      { ingredient: 'sour-cream', quantity: 200, unit: 'g' },
      { ingredient: 'jam', quantity: 150, unit: 'g', note: 'sour cherry' },
    ],
    steps: [
      {
        text: 'Mix the cheese, eggs, sugars, zest and baking soda, then add flour until the dough just stops sticking.',
      },
      { text: 'Shape 4 large rings and 4 small balls.' },
      {
        text: 'Fry in oil at medium heat until deep golden on both sides.',
        timerSeconds: 360,
      },
      {
        text: 'Serve warm: a ring, a spoon of sour cream, jam, and the ball on top.',
      },
    ],
  },
  {
    key: 'paprika-chicken',
    title: 'Paprika chicken with rice',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 40,
    difficulty: 'easy',
    lines: [
      { ingredient: 'chicken-thighs', quantity: 800, unit: 'g' },
      { ingredient: 'rice', quantity: 300, unit: 'g' },
      { ingredient: 'onion', quantity: 1, unit: 'pcs' },
      { ingredient: 'bell-pepper', quantity: 2, unit: 'pcs' },
      { ingredient: 'paprika', quantity: 10, unit: 'g' },
      { ingredient: 'garlic', quantity: 10, unit: 'g' },
      { ingredient: 'sour-cream', quantity: 150, unit: 'g' },
      { ingredient: 'sunflower-oil', quantity: 30, unit: 'ml' },
      { ingredient: 'salt', quantity: 6, unit: 'g' },
    ],
    steps: [
      { text: 'Brown the chicken in the oil, then take it out.' },
      {
        text: 'Soften the onion, pepper and garlic, stir in the paprika, and put the chicken back with a cup of water.',
      },
      { text: 'Cover and simmer while the rice cooks.', timerSeconds: 1_800 },
      {
        text: 'Take off the heat, stir in the sour cream and serve over the rice.',
      },
    ],
  },
  {
    key: 'spaghetti-bacon',
    title: 'Weeknight spaghetti with tomato and bacon',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    difficulty: 'easy',
    lines: [
      { ingredient: 'spaghetti', quantity: 400, unit: 'g' },
      { ingredient: 'bacon', quantity: 150, unit: 'g' },
      { ingredient: 'canned-tomatoes', quantity: 400, unit: 'g' },
      { ingredient: 'garlic', quantity: 10, unit: 'g' },
      { ingredient: 'olive-oil', quantity: 20, unit: 'ml' },
      { ingredient: 'parmesan', quantity: 50, unit: 'g', note: 'grated' },
      { ingredient: 'parsley', quantity: 10, unit: 'g', optional: true },
    ],
    steps: [
      { text: 'Cook the spaghetti in well-salted water.', timerSeconds: 600 },
      {
        text: 'Crisp the bacon in the oil, add the garlic for a minute, then the tomatoes. Simmer while the pasta cooks.',
      },
      {
        text: 'Toss the pasta into the sauce with a splash of pasta water, then finish with parmesan and parsley.',
      },
    ],
  },
  {
    key: 'overnight-oats',
    title: 'Overnight oats with berries',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 0,
    difficulty: 'easy',
    lines: [
      { ingredient: 'oats', quantity: 100, unit: 'g' },
      { ingredient: 'milk', quantity: 200, unit: 'ml' },
      { ingredient: 'greek-yogurt', quantity: 150, unit: 'g' },
      { ingredient: 'frozen-berries', quantity: 150, unit: 'g' },
      { ingredient: 'honey', quantity: 20, unit: 'g' },
    ],
    steps: [
      { text: 'Stir the oats, milk and yogurt together in two jars.' },
      {
        text: 'Top with the berries and honey, close and leave in the fridge overnight.',
      },
    ],
  },
  {
    key: 'clatite',
    title: 'Sunday clătite',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    difficulty: 'easy',
    lines: [
      { ingredient: 'flour', quantity: 250, unit: 'g' },
      { ingredient: 'milk', quantity: 500, unit: 'ml' },
      { ingredient: 'eggs', quantity: 3, unit: 'pcs' },
      { ingredient: 'sugar', quantity: 20, unit: 'g' },
      { ingredient: 'sunflower-oil', quantity: 30, unit: 'ml' },
      { ingredient: 'jam', quantity: 200, unit: 'g' },
    ],
    steps: [
      {
        text: 'Whisk the eggs, milk, sugar and a pinch of salt, then whisk in the flour and oil until smooth. Rest 10 minutes.',
        timerSeconds: 600,
      },
      {
        text: 'Pour a thin layer into a hot oiled pan, cook until the edges lift, flip, and cook a few seconds more.',
      },
      { text: 'Spread with jam and roll up.' },
    ],
  },
];

/** The Catalog Recipe copied into the Family with Add to Family. */
export const DEMO_COPIED_RECIPE = 'potato-puree';

/** The 7-day Meal Plan, starting on the seed day: [breakfast, lunch, dinner] per day. */
export const DEMO_PLAN: Array<
  [DemoSlotRecipe, DemoSlotRecipe, DemoSlotRecipe]
> = [
  [
    { family: 'overnight-oats' },
    { catalog: 'chicken-salad' },
    { family: 'sarmale' },
  ],
  [
    { catalog: 'omelette' },
    { family: 'sarmale' },
    { family: 'spaghetti-bacon' },
  ],
  [
    { family: 'clatite' },
    { family: 'perisoare' },
    { family: 'paprika-chicken' },
  ],
  [
    { family: 'overnight-oats' },
    { family: 'perisoare' },
    { family: 'mamaliga' },
  ],
  [
    { catalog: 'omelette' },
    { catalog: 'chicken-salad' },
    { family: 'sarmale-post' },
  ],
  [
    { family: 'clatite' },
    { copy: DEMO_COPIED_RECIPE },
    { catalog: 'fried-chicken' },
  ],
  [
    { family: 'papanasi' },
    { family: 'perisoare' },
    { family: 'spaghetti-bacon' },
  ],
];
