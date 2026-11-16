import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Translation parity across en, ro and da. Reads the JSON files directly and
 * collects every problem, so one run lists all of them (locale, namespace, key).
 */

const LOCALES_DIR = join(__dirname, 'locales');
const GLOSSARY = join(__dirname, '../../../../GLOSSARY.md');
const SOURCE = 'en';
const TARGETS = ['ro', 'da'] as const;
const ALL = [SOURCE, ...TARGETS] as const;

/** Plural forms each locale must have, per its own CLDR rules (checked against Intl below). */
const EXPECTED_FORMS: Record<string, string[]> = {
  en: ['one', 'other'],
  da: ['one', 'other'],
  // ro `few`: 0, fractions, and n != 1 with n % 100 in 1..19 (so 2-19 and 101-119; 20, 100, 120 are `other`).
  ro: ['one', 'few', 'other'],
};

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

type Strings = Map<string, string>;

/** `namespace -> flattened "a.b.c_one" -> text` for one locale. */
function load(locale: string): Map<string, Strings> {
  const dir = join(LOCALES_DIR, locale);
  const namespaces = new Map<string, Strings>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const strings: Strings = new Map();
    const walk = (value: unknown, prefix: string) => {
      if (typeof value === 'string') strings.set(prefix, value);
      else if (typeof value === 'object' && value !== null)
        for (const [k, v] of Object.entries(value))
          walk(v, prefix ? `${prefix}.${k}` : k);
    };
    walk(JSON.parse(readFileSync(join(dir, file), 'utf8')), '');
    namespaces.set(file.replace(/\.json$/, ''), strings);
  }
  return namespaces;
}

const localesByCode = Object.fromEntries(ALL.map((l) => [l, load(l)]));

/**
 * Error codes whose name merely ends like a plural form ("..._too_many" is the
 * API code, "not_household_of_one" is the Household of One code). Not plurals.
 */
const NOT_PLURAL = new Set([
  'errors:family.not_household_of_one',
  'errors:recipes.tips_too_many',
  'errors:recipes.tags_too_many',
  'errors:recipes.pairings_too_many',
  'errors:recipes.eating_moments_too_many',
]);

const baseOf = (key: string) => key.replace(PLURAL_SUFFIX, '');
const formOf = (key: string) => PLURAL_SUFFIX.exec(key)?.[1];

/** base key -> forms present (empty set for non-plural keys) and the texts. */
function families(strings: Strings, ns: string) {
  const out = new Map<string, Map<string, string>>();
  for (const [key, text] of strings) {
    const plain = NOT_PLURAL.has(`${ns}:${key}`);
    const base = plain ? key : baseOf(key);
    const family = out.get(base) ?? new Map<string, string>();
    family.set(plain ? '' : (formOf(key) ?? ''), text);
    out.set(base, family);
  }
  return out;
}

/** Variable names in `{{name}}` / `{{name, number}}` / `{{- name}}`. */
const variables = (text: string) =>
  [...text.matchAll(/{{-?\s*([\w.]+)\s*(?:,[^}]*)?}}/g)].map((m) => m[1]);

/**
 * Interpolation rule: a plural family is compared as a whole. The union of
 * variables over all its forms must equal the English family's union, so one
 * form may drop `{{count}}` (ro `_one` "un articol") as long as another keeps it.
 */
const familyVariables = (family: Map<string, string>) =>
  [...new Set([...family.values()].flatMap(variables))].sort();

function parityProblems(): string[] {
  const problems: string[] = [];
  const en = localesByCode[SOURCE];
  for (const locale of TARGETS) {
    const other = localesByCode[locale];
    for (const ns of en.keys())
      if (!other.has(ns)) problems.push(`${locale}: missing namespace "${ns}"`);
    for (const ns of other.keys())
      if (!en.has(ns)) problems.push(`${locale}: extra namespace "${ns}"`);
    for (const [ns, enStrings] of en) {
      const localeStrings = other.get(ns);
      if (!localeStrings) continue;
      const enFamilies = families(enStrings, ns);
      const localeFamilies = families(localeStrings, ns);
      const isPlural = (family: Map<string, string>) =>
        [...family.keys()].some((form) => form !== '');
      for (const [base, enFamily] of enFamilies) {
        const family = localeFamilies.get(base);
        if (!family) problems.push(`${locale} ${ns}: missing key "${base}"`);
        else if (isPlural(enFamily) !== isPlural(family))
          problems.push(
            `${locale} ${ns}: "${base}" is ${isPlural(family) ? 'plural' : 'plain'} but en is ${isPlural(enFamily) ? 'plural' : 'plain'}`,
          );
      }
      for (const base of localeFamilies.keys())
        if (!enFamilies.has(base))
          problems.push(`${locale} ${ns}: extra key "${base}" (not in en)`);
    }
  }
  return problems;
}

function pluralProblems(): string[] {
  const problems: string[] = [];
  for (const locale of ALL) {
    const required = EXPECTED_FORMS[locale];
    for (const [ns, strings] of localesByCode[locale]) {
      for (const [base, family] of families(strings, ns)) {
        const forms = [...family.keys()].filter((f) => f !== '');
        if (forms.length === 0) continue;
        for (const form of required)
          if (!family.has(form))
            problems.push(`${locale} ${ns}: "${base}" lacks _${form}`);
        for (const form of forms)
          if (!required.includes(form))
            problems.push(`${locale} ${ns}: "${base}" has unexpected _${form}`);
        if (family.has(''))
          problems.push(
            `${locale} ${ns}: "${base}" mixes plural and plain forms`,
          );
      }
    }
  }
  return problems;
}

function interpolationProblems(): string[] {
  const problems: string[] = [];
  for (const locale of TARGETS) {
    for (const [ns, enStrings] of localesByCode[SOURCE]) {
      const localeStrings = localesByCode[locale].get(ns);
      if (!localeStrings) continue;
      const localeFamilies = families(localeStrings, ns);
      for (const [base, enFamily] of families(enStrings, ns)) {
        const family = localeFamilies.get(base);
        if (!family) continue;
        const want = familyVariables(enFamily);
        const got = familyVariables(family);
        if (want.join() !== got.join())
          problems.push(
            `${locale} ${ns}: "${base}" variables {${got}} should be {${want}}`,
          );
      }
    }
  }
  return problems;
}

/** Terms listed on `_Avoid_:` lines. Splits on top-level commas, drops "(qualifiers)". */
function avoidedTerms(): string[] {
  const terms = new Set<string>();
  for (const line of readFileSync(GLOSSARY, 'utf8').split('\n')) {
    const match = /^_Avoid_:\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    let depth = 0;
    let current = '';
    const parts: string[] = [];
    for (const ch of match[1]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else if (depth === 0 && ch !== ')') current += ch;
    }
    parts.push(current);
    for (const part of parts) {
      const term = part.replace(/\(.*$/, '').trim().replace(/\.$/, '');
      if (term) terms.add(term);
    }
  }
  return [...terms].sort();
}

/** Bold headings of GLOSSARY.md: the canonical terms. */
function canonicalTerms(): Set<string> {
  const terms = new Set<string>();
  for (const line of readFileSync(GLOSSARY, 'utf8').split('\n')) {
    const m = /^\*\*(.+?)\*\*:/.exec(line);
    if (m) terms.add(m[1].toLowerCase());
  }
  return terms;
}

/**
 * Avoided terms that are ordinary English words. GLOSSARY.md avoids each only
 * as the name of one specific concept (e.g. "item" for an Ingredient, "line"
 * for a Shopping Item), but the UI legitimately uses the plain word, so they
 * are allowed everywhere in en. Key is the lower-case term.
 */
const PLAIN_WORDS: Record<string, string> = {
  item: 'generic count noun ("3 items"); the concept is clear from the screen',
  line: 'receipt, Template or Ingredient Line rows ("3 lines"), not a Shopping Item',
  category:
    'Leaf Category shown to Members as just "category"; avoided for Recipe grouping',
  check:
    'plain verb ("Check your connection"); avoided only as a Health Factor noun',
  meal: 'everyday word in Meal Plan copy; avoided only as the name of a Plan Slot or Eating Moment',
  note: 'plain word; Voice Note and Nutrition Note are canonical and not matched',
  product: 'packaged goods in Product Scan copy, not an Ingredient',
  save: 'plain verb for keeping a form ("Save Recipe"); avoided only as the name of Add to Family',
};

/** Exceptions found when the broad whitelist was narrowed: term, reason, keys. */
const WORD_EXCEPTIONS: [term: string, reason: string, keys: string[]][] = [
  [
    'brand',
    'a product maker named as an example in the Note hint (Add to Pantry), not a Brand Ingredient',
    ['pantry:form.addNote', 'pantry:form.descriptionPlaceholder'],
  ],
  [
    'label',
    'the printed label of a product the camera reads, not a Product Description',
    ['scan:readingLabel', 'scan:labelFailed'],
  ],
  [
    'type',
    'the verb "type it" (enter by hand) in the Add to Pantry camera, not a Category',
    ['scan:typeIt', 'scan:labelFailed', 'scan:labelCap'],
  ],
  [
    'type',
    'the verb "Type" (enter text) in the Tag field placeholder, not a Category',
    ['recipes:tags.fieldPlaceholder'],
  ],
  [
    'type',
    'the verb "Type" (enter by hand) on the Empty Pantry banner, not a Category',
    ['pantry:empty.type'],
  ],
  [
    'token',
    'the Assistant Token (GLOSSARY), shortened to "token" in the Siri section; not the Invite Code',
    [
      'errors:assistantTokens.not_found',
      'siri:create',
      'siri:hint',
      'siri:empty',
      'siri:loadFailed',
      'siri:nameLabel',
      'siri:reveal.copied',
      'siri:reveal.secretLabel',
      'siri:reveal.title',
      'siri:revoked',
      'siri:setup.create',
      'siri:setup.paste',
    ],
  ],
  [
    'account',
    'the sign-in account (and people without one), not a Member',
    [
      'errors:auth.user_already_exists',
      'errors:auth.user_already_exists_use_another_email',
      'settings:account',
      'settings:allergies.noAccount',
      'onboarding:launch.haveAccount',
      'settings:familyAllergies.hint',
      'signUp:haveAccount',
      'signUp:submit',
      'signUp:submitting',
      'signUp:title',
    ],
  ],
  [
    'available',
    'a service, camera, Recipe or voice target that is no longer available, not the Can Make state',
    [
      'dashboard:mealPlan.status.unavailable',
      'errors:scan.provider_unavailable',
      'errors:voice.provider_unavailable',
      'mealPlans:detail.unavailable',
      'scan:noCamera',
      'scan:overlay.noCamera',
      'voice:skipReason.pantry.category_not_found',
      'voice:skipReason.pantry.ingredient_not_found',
      'voice:skipReason.shopping.ingredient_not_found',
      'voice:unavailable',
    ],
  ],
  [
    'direction',
    'plain word ("a general direction") in a Nutrition Note hint, not a cooking instruction',
    ['admin:recipe.guidance.nutrition.helper'],
  ],
  [
    'dish',
    'a dish on a plate Scan, not a Recipe or Meal',
    ['errors:scan.plate_token_invalid', 'review:overview.pickDish'],
  ],
  [
    'entry',
    'a Catalog or voice-review entry as a plain word, not a Template Line or Batch',
    [
      'errors:catalog.canonical_name_managed',
      'errors:catalog.not_found',
      'errors:catalog.translation_exists',
      'voice:review.hide',
    ],
  ],
  [
    'food',
    'plain adjective, a Pairing kind or the Open Food Facts brand, not an Ingredient',
    [
      'admin:recipe.guidance.pairings.kindFood',
      'pantry:form.prefill.credit',
      'recipes:pairingKind.food',
      'review:excluded.hint',
      'review:excluded.reason.not_food',
    ],
  ],
  [
    'label',
    'a Pairing label, a product label or a Family Allergy label, not a Product Description label',
    [
      'admin:recipe.guidance.pairings.invalid',
      'admin:recipe.guidance.pairings.label',
      'admin:recipe.translations.pairingIncomplete',
      'admin:recipe.translations.pairingLabel',
      'errors:settings.family_allergy_exists',
      'recipes:allergens.reminder',
      'settings:familyAllergies.label',
    ],
  ],
  [
    'mode',
    'the camera mode slider, not a Theme',
    ['scan:info.intro', 'scan:slider.announce'],
  ],
  [
    'mode',
    "the phone's OS dark/light mode (Match system), not a Theme",
    ['settings:appearance.matchSystemHint'],
  ],
  [
    'old',
    'age of a Batch ("3 d old"); copy drift for Forgotten, flag',
    ['dashboard:health.line.age'],
  ],
  [
    'place',
    'asks for a storage place; copy drift for Location, flag',
    [
      'voice:review.detail.noPlace',
      'voice:review.edit.locationDefault',
      'voice:review.footer.pickPlace',
    ],
  ],
  [
    'queue',
    'the Admin Unmatched review list as a plain word, not a Scan queue',
    [
      'admin:unmatched.statusLabel',
      'errors:family_ingredients.not_found',
      'errors:family_synonyms.not_found',
      'errors:unmatched.not_found',
    ],
  ],
  [
    'section',
    'a group of tabs or Catalog areas, not a Receipt Section or Aisle',
    ['admin:sections', 'settings:tabs.label'],
  ],
  [
    'settings',
    'the Settings page title, not a name for Member Preferences',
    [
      'settings:tabs.label',
      'settings:title',
      'onboarding:languages.abroad',
      'onboarding:setup.languagesNotSaved',
    ],
  ],
  ['side', '"on our side", an apology', ['errors:internal_server_error']],
  [
    'type',
    'plain verb ("Type an ingredient"), not a Category type',
    [
      'catalog:catalogAdd.typeToSearch',
      'catalog:search.placeholder',
      'catalog:search.placeholderAdd',
    ],
  ],
  [
    'unknown',
    'plain adjective; copy drift for an Unmatched name, flag',
    ['admin:recipe.lines.unknown', 'dashboard:mealPlan.line.unknown'],
  ],
  [
    'import',
    'Shopping Template import action (copy drift, flag)',
    [
      'shopping:empty.importTitle',
      'shopping:import.button',
      'shopping:import.title',
      'shopping:import.tickLabel',
      'shopping:import.confirm_one',
      'shopping:import.confirm_other',
    ],
  ],
  [
    'move to pantry',
    'the Finish Shopping action named "Move to Pantry" (copy drift, flag)',
    [
      'shopping:summary.moveToPantry_one',
      'shopping:summary.moveToPantry_other',
    ],
  ],
  [
    'point',
    'the verb "point" (aim the camera, a Tip pointing at a Step) or "a starting point", not a Credit',
    [
      'admin:recipe.variant.hint',
      'errors:recipes.bad_step_anchor',
      'scan:info.barcode',
      'scan:overlay.pointAtBarcode',
    ],
  ],
  [
    'fee',
    'a fee printed on a receipt, left out in Review, not a Credit Price',
    ['review:excluded.reason.fee'],
  ],
  [
    'log',
    'the sign-in action "Log in", not a Usage Record',
    ['signIn:submit', 'signUp:signIn'],
  ],
];

/**
 * Specific legitimate uses, as "namespace:key|term" (term in lower case).
 * Each reason says why the word is not the avoided concept.
 */
const GLOSSARY_EXCEPTIONS: Record<string, string> = {
  ...Object.fromEntries(
    WORD_EXCEPTIONS.flatMap(([term, reason, keys]) =>
      keys.map((id) => [`${id}|${term}`, reason]),
    ),
  ),
  ...Object.fromEntries(
    [
      'admin:ingredient.pantryBasicHint|stock',
      'admin:ingredient.pantryBasicHint|in stock',
      'dashboard:widgets.pantryStock.itemsInStock_one|stock',
      'dashboard:widgets.pantryStock.itemsInStock_one|in stock',
      'dashboard:widgets.pantryStock.itemsInStock_other|stock',
      'dashboard:widgets.pantryStock.itemsInStock_other|in stock',
      'staples:hint|stock',
      'staples:hint|in stock',
      'voice:listening.toShopping|stock',
    ].map((id) => [
      id,
      'plain "in stock" availability phrase, not the Pantry noun',
    ]),
  ),
  'voice:teach.line|fridge':
    'the example sentence a Member can say (design copy); the Location is Fridge, spoken in lower case',
  'recipes:recipeDraft.saved|draft':
    'the status "Draft saved" in the Recipe Draft form header; the exact copy of the ticket, next to the Recipe form it belongs to',
  'recipes:family.newRecipeHint|draft':
    'the editor hint of design v3, the exact copy of ticket #587: "Kept as your draft until you save it as one of your family\'s Recipes."',
  'recipes:family.tabs.details|details':
    "the editor's first tab, named Details by design v3 (ticket #587); a tab, not the glossary's metadata term",
  'recipes:drafts.entry|draft':
    'the Recipes page entry "Drafts (N)", the exact copy of ticket #547; it opens the list titled "Recipe Drafts"',
  'recipes:drafts.discard|draft':
    'the action "Discard draft", the exact copy of ticket #547, on a Recipe Draft row and in its form',
  'recipes:drafts.continueTitle|draft':
    'the prompt "Continue your draft?", the exact copy of ticket #548, shown over the unfinished Recipe Drafts it lists',
  'scan:import.label|import':
    "the Scan screen's Import button adds photos to the Scan Session; it is not the Shopping Template action",
  'scan:noCamera|import':
    "tells a Member without a camera to use the Scan screen's Import button; it is not the Shopping Template action",
  'common:locations.fridge|fridge':
    'Fridge is a Location value, not a name for the Pantry',
  'pantry:empty.shelf.fridge|fridge':
    'Fridge is a Location value, not a name for the Pantry',
  'voice:intro.examples.shopping.three.say|fridge':
    'example of what a Member says out loud',
  'voice:intro.examples.pantry.one.say|fridge':
    'example of what a Member says out loud',
  'voice:intro.examples.pantry.two.say|finished':
    'example of what a Member says out loud',
  'shopping:finish.empty|finished':
    'the Finish Shopping action in plain past tense, not Used Up',
  'common:unverified_one|unverified':
    'Unmatched names after a Review Save, not the Allergen "Unchecked" state (copy drift, flag)',
  'common:unverified_other|unverified': 'same as unverified_one',
  'shopping:suggestions.goneNone|run out':
    'Used Up / expired Suggestions empty state, plain verb (copy drift, flag)',
  'screenHeader:home|home':
    'aria label of the button that leads to the Dashboard',
  'dock:home|home': 'label of the Dock tab that leads to the Dashboard',
  'review:overview.fixValues|card':
    'a Review row card in the Review UI, not a Dashboard Widget',
  'settings:allergies.hint|intolerance':
    'explains that intolerances count as Allergies',
  'errors:recipes.source_locale|source language':
    'a Recipe language, not the Scan Language',
  'screenHeader:settings|settings': 'header link to Settings',
  'voice:blocked.safariStep2|settings': 'Safari "Website Settings" menu name',
  'onboarding:languages.app|app language':
    'the first-screen name for the UI Language, before the Member has any Preferences (design handoff)',
  'onboarding:languages.receipts.label|label':
    'the printed labels the camera reads (the Scan Language row), not a Product Description',
  'onboarding:languages.abroad|label':
    'the printed labels the camera reads (the Scan Language row), not a Product Description',
  'onboarding:snap.bubble.ingredients|food':
    "Gator's line from the design handoff: loose food on the counter, before it is anything in the Pantry",
  'onboarding:snap.callout.body|menu':
    'the design handoff calls the Dock "the menu"; it is not a Meal Plan',
  'onboarding:allSet.tipMic|menu':
    'the design handoff calls the Dock "the menu"; it is not a Meal Plan',
};

const escape = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
const wholeWord = (alternatives: string[], flags: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternatives.map(escape).join('|')})(?:e?s)?(?![\\p{L}\\p{N}])`,
    flags,
  );

const canonical = canonicalTerms();
const canonicalRegex = wholeWord(
  [...canonical].sort((a, b) => b.length - a.length),
  'giu',
);
const avoidedPatterns = avoidedTerms()
  .filter((term) => !canonical.has(term.toLowerCase()))
  .map((term) => ({ term, regex: wholeWord([term], 'giu') }));

/**
 * Interpolation variables are dropped before matching, so "Move {{count}} to
 * Pantry" reads as the avoided "Move to pantry" (it is listed as an exception).
 * A variable never separates words: that keeps the check strict.
 */
const withoutVariables = (text: string) => text.replace(/{{[^}]*}}/g, '');

function glossaryProblems(): string[] {
  const problems: string[] = [];
  for (const [ns, strings] of localesByCode[SOURCE])
    for (const [key, text] of strings) {
      const copy = withoutVariables(text);
      // A hit inside a canonical term is that term, not the avoided word:
      // "Voice Note" is not the avoided "note".
      const canonicalSpans = [...copy.matchAll(canonicalRegex)].map((m) => [
        m.index,
        m.index + m[0].length,
      ]);
      for (const { term, regex } of avoidedPatterns) {
        const lower = term.toLowerCase();
        if (
          lower in PLAIN_WORDS ||
          `${ns}:${key}|${lower}` in GLOSSARY_EXCEPTIONS
        )
          continue;
        const hit = [...copy.matchAll(regex)].some((m) => {
          const [start, end] = [m.index, m.index + m[0].length];
          return !canonicalSpans.some(([s, e]) => s <= start && end <= e);
        });
        if (hit)
          problems.push(
            `en ${ns}: "${key}" uses avoided term "${term}": ${text}`,
          );
      }
    }
  return problems;
}

describe('translation parity', () => {
  it('ro and da have exactly the namespaces and keys of en', () => {
    expect(parityProblems()).toEqual([]);
  });

  it.each(ALL)('%s plural categories come from Intl.PluralRules', (locale) => {
    const categories = new Intl.PluralRules(locale).resolvedOptions()
      .pluralCategories;
    expect([...categories].sort()).toEqual([...EXPECTED_FORMS[locale]].sort());
  });

  it('every plural family has the forms its locale needs', () => {
    expect(pluralProblems()).toEqual([]);
  });

  it('interpolation variables match en, family by family', () => {
    expect(interpolationProblems()).toEqual([]);
  });

  it('en copy avoids the terms GLOSSARY.md lists under _Avoid_', () => {
    expect(avoidedTerms()).toContain('Household');
    expect(glossaryProblems()).toEqual([]);
  });

  it('every glossary exception still refers to existing copy', () => {
    const terms = avoidedTerms().map((t) => t.toLowerCase());
    const stale = [
      ...Object.keys(GLOSSARY_EXCEPTIONS).filter((id) => {
        const [path, term] = id.split('|');
        const colon = path.indexOf(':');
        const text = localesByCode[SOURCE].get(path.slice(0, colon))?.get(
          path.slice(colon + 1),
        );
        // The key must exist and its current copy must still contain the term.
        return (
          text === undefined ||
          !terms.includes(term) ||
          !wholeWord([term], 'iu').test(withoutVariables(text))
        );
      }),
      ...Object.keys(PLAIN_WORDS).filter((term) => !terms.includes(term)),
    ];
    expect(stale).toEqual([]);
  });
});
