import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { OpenFoodFactsProduct } from '../barcode/open-food-facts.client';
import type { RecipeDraftContent } from '../recipe-drafts/recipe-drafts.schemas';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
};

export const userRole = pgEnum('user_role', ['admin', 'regular']);
// What a daily cap counts: Scans, Voice Notes, Assistant Requests, Recipe from Link reads or Suggest Guidance requests.
export const usageKind = pgEnum('usage_kind', [
  'scan',
  'voice',
  'assistant',
  'link',
  'guidance',
]);
export const familyRole = pgEnum('family_role', ['owner', 'member']);
// What a Credit entry is: the Welcome Grant, a Credit Grant by hand, a read's spend, or Credits moved between Families.
export const creditEntryKind = pgEnum('credit_entry_kind', [
  'welcome_grant',
  'grant',
  'spend',
  'transfer_in',
  'transfer_out',
  'promo_code',
]);

// A Family owns the Pantry, Shopping List and Family Settings.
// The Invite Code is replaced in place on regeneration, which revokes the old one.
export const family = pgTable('family', {
  id: uuid('id').primaryKey().defaultRandom(),
  inviteCode: text('invite_code').notNull().unique(),
  inviteCodeExpiresAt: timestamp('invite_code_expires_at', {
    withTimezone: true,
  }).notNull(),
  // Family Setting: days before expiry a Batch counts as Expiring Soon.
  staleThresholdDays: integer('stale_threshold_days').notNull().default(3),
  ...timestamps,
});

// Better Auth core tables. User IDs intentionally remain text because Better Auth owns them.
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    role: userRole('role').notNull().default('regular'),
    // Every Member belongs to exactly one Family: never nullable.
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    familyRole: familyRole('family_role').notNull().default('member'),
    // Member Preference: 'en' | 'ro' | 'da' (validated in the API); null until chosen.
    locale: text('locale'),
    // Member Preference (Catalog Language): 'en' | 'ro' | 'da' (validated in the API); null = "Same as UI Language".
    catalogLanguage: text('catalog_language'),
    // Member Preference (Scan Language): 'en' | 'ro' | 'da' (validated in the API); null = "Same as UI Language".
    scanLanguage: text('scan_language'),
    // Member Preference (Spoken Language): 'en' | 'ro' | 'da' (validated in the API); null = "Same as UI Language".
    spokenLanguage: text('spoken_language'),
    // Member Preference: 'light' | 'dark' ('warm' and 'minimal' read as 'light'; validated in the API); null until chosen.
    theme: text('theme'),
    // Member Preference: leave out Recipes with the Member's own or Family Allergies (#359); off by default.
    hideRecipesWithAllergies: boolean('hide_recipes_with_allergies')
      .notNull()
      .default(false),
    // When the Member was done with the Intro (reached the Dashboard from it); null = not yet. First time wins.
    introDoneAt: timestamp('intro_done_at', { withTimezone: true }),
    // When the Member received their Welcome Grant (ADR 0032): once in their life, so it is kept on the Member
    // and not as a ledger row, which goes with its Family. Null = not yet received.
    welcomeGrantAt: timestamp('welcome_grant_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('user_family_id_idx').on(table.familyId),
    // A Family has a single Owner.
    uniqueIndex('user_family_owner_idx')
      .on(table.familyId)
      .where(sql`${table.familyRole} = 'owner'`),
  ],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_idx').on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// Catalog: two-level Categories, Ingredients, and translated names/Synonyms.
export const storageLocation = pgEnum('storage_location', [
  'fridge',
  'freezer',
  'cupboard',
  'spices',
]);

export const ingredientUnit = pgEnum('ingredient_unit', [
  'g',
  'kg',
  'ml',
  'l',
  'pcs',
]);

// How much of an Ingredient a Member usually buys at once. Null reads as medium.
export const amountScale = pgEnum('amount_scale', ['low', 'medium', 'large']);

export const catalogEntityType = pgEnum('catalog_entity_type', [
  'aisle',
  'parent_category',
  'leaf_category',
  'ingredient',
  'eating_moment',
  'allergen',
  'tag_group',
  'tag',
]);

export const translationKind = pgEnum('translation_kind', ['name', 'synonym']);

// An Aisle is an ordered shop section; several Parent Categories may share one.
// `name` is the canonical English name; display names live in catalog_translations.
export const aisles = pgTable(
  'aisles',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('aisles_normalized_name_idx').on(table.normalizedName),
    uniqueIndex('aisles_sort_order_idx').on(table.sortOrder),
  ],
);

// `name` is the canonical English name; `normalizedName` is its matching key.
// A Parent Category belongs to an Aisle; the Aisle carries the shop-walk sort order.
export const parentCategories = pgTable(
  'parent_categories',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    aisleId: uuid('aisle_id')
      .notNull()
      .references(() => aisles.id),
    defaultExpiryDays: integer('default_expiry_days'),
    defaultLocation: storageLocation('default_location'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('parent_categories_normalized_name_idx').on(
      table.normalizedName,
    ),
    index('parent_categories_aisle_idx').on(table.aisleId),
  ],
);

// Null Default Expiry / default Location fall back to the Parent Category.
export const leafCategories = pgTable(
  'leaf_categories',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => parentCategories.id),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    defaultExpiryDays: integer('default_expiry_days'),
    defaultLocation: storageLocation('default_location'),
    // Marks the Parent's catch-all "Other" Leaf that receives Unmatched Batches.
    // Structural, so renaming a Leaf never breaks the lookup.
    isOther: boolean('is_other').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('leaf_categories_normalized_name_idx').on(table.normalizedName),
    index('leaf_categories_parent_idx').on(table.parentId),
    // At most one "Other" Leaf per Parent.
    uniqueIndex('leaf_categories_one_other_per_parent_idx')
      .on(table.parentId)
      .where(sql`${table.isOther}`),
  ],
);

export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid('id').primaryKey(),
    leafCategoryId: uuid('leaf_category_id')
      .notNull()
      .references(() => leafCategories.id),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    defaultUnit: ingredientUnit('default_unit').notNull(),
    // Water, salt, pepper: Recipe matching always counts them as covered.
    pantryBasic: boolean('pantry_basic').notNull().default(false),
    // Null reads as medium. Backfilled from the Parent Category by migration 0021.
    amountScale: amountScale('amount_scale'),
    // Null = shared Catalog row; set = a Family Ingredient only that Family sees (ADR 0011).
    ownerFamilyId: uuid('owner_family_id').references(() => family.id, {
      onDelete: 'cascade',
    }),
    // The Member who added a Family Ingredient; kept as null if they leave.
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    // The locale a Family Ingredient's name was typed in: 'en' | 'ro' | 'da'.
    nameLocale: text('name_locale'),
    // A Member has tagged a Family Ingredient's Allergens (ticking "None" counts).
    // A shared Ingredient counts as checked too, except one promoted from Family copies none of
    // which were checked: that stays Unchecked (false here plus allergens_review_pending below)
    // until an Admin saves its Allergens (ADR 0014). On a seed Ingredient it records that the
    // seed's tags were applied once. Do not reuse false on a shared row as a "flagged for
    // review" marker: the seed would re-apply its tags to it.
    allergensChecked: boolean('allergens_checked').notNull().default(false),
    // Promoting or merging a Family Ingredient carried Member-entered tags onto a shared row
    // (ADR 0011, 0014). The Admin reviews them; saving the Ingredient's Allergens clears this.
    // A separate column from allergens_checked, which the seed reads (see above). While set on
    // a shared row that is not checked, no Member has tagged it: its lines read as Unchecked.
    allergensReviewPending: boolean('allergens_review_pending')
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    // Shared names are unique among shared rows; a Family's own names among that Family's.
    uniqueIndex('ingredients_normalized_name_idx')
      .on(table.normalizedName)
      .where(sql`${table.ownerFamilyId} IS NULL`),
    uniqueIndex('ingredients_family_normalized_name_idx')
      .on(table.ownerFamilyId, table.normalizedName)
      .where(sql`${table.ownerFamilyId} IS NOT NULL`),
    index('ingredients_leaf_category_idx').on(table.leafCategoryId),
  ],
);

// An Allergen is an Admin-curated, ordered, translated list entry (names in
// catalog_translations, entity type `allergen`). Seeded with the EU's 14 (ADR 0014).
export const allergens = pgTable(
  'allergens',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    // Retired by an Admin: hidden from the pickers, kept on every tag and Allergy so a
    // Recipe containing it is still warned about (never deleted, like Eating Moments).
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('allergens_normalized_name_idx').on(table.normalizedName),
  ],
);

// "This Ingredient contains this Allergen", for shared and Family Ingredients alike.
// An Allergen in use cannot be deleted: dropping a tag would read as "contains none".
export const ingredientAllergens = pgTable(
  'ingredient_allergens',
  {
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    allergenId: uuid('allergen_id')
      .notNull()
      .references(() => allergens.id),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.ingredientId, table.allergenId] }),
    index('ingredient_allergens_allergen_idx').on(table.allergenId),
  ],
);

// An Allergy: "this Member must avoid this Allergen". Keyed to the Member, not their
// Family, so it goes with them when they leave a Family or join another. An Allergen in
// use cannot be deleted: dropping an Allergy would silently stop warning.
export const memberAllergies = pgTable(
  'member_allergies',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    allergenId: uuid('allergen_id')
      .notNull()
      .references(() => allergens.id),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.allergenId] }),
    index('member_allergies_allergen_idx').on(table.allergenId),
  ],
);

// An Assistant Token (ADR 0019): a named, revocable secret a Member creates so a voice
// assistant can make Assistant Requests for them. Keyed to the Member, not their Family,
// so it keeps working across Family changes, and deleted with the Member. Only the SHA-256
// hash of the secret is stored; `prefix` is the short display start of the secret.
export const assistantTokens = pgTable(
  'assistant_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    secretHash: text('secret_hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('assistant_tokens_user_id_idx').on(table.userId)],
);

// A Family Allergy: "someone in this Family without an account must avoid this
// Allergen", with an optional label such as "Mia". Several rows may share an Allergen
// with different labels. Owned by the Family and deleted with it (ADR 0001).
export const familyAllergies = pgTable(
  'family_allergies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    allergenId: uuid('allergen_id')
      .notNull()
      .references(() => allergens.id),
    label: text('label'),
    ...timestamps,
  },
  (table) => [
    // The same Allergen and label twice would only repeat itself.
    uniqueIndex('family_allergies_unique_idx').on(
      table.familyId,
      table.allergenId,
      sql`coalesce(${table.label}, '')`,
    ),
    index('family_allergies_allergen_idx').on(table.allergenId),
  ],
);

// Display names and Synonyms per entity and locale. `entityId` is polymorphic
// (selected by `entityType`), so it carries no foreign key.
export const catalogTranslations = pgTable(
  'catalog_translations',
  {
    id: uuid('id').primaryKey(),
    entityType: catalogEntityType('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    locale: text('locale').notNull(),
    kind: translationKind('kind').notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    // Set only on a Family Synonym; NULL = shared. Names are always shared.
    ownerFamilyId: uuid('owner_family_id').references(() => family.id, {
      onDelete: 'cascade',
    }),
    ...timestamps,
  },
  (table) => [
    // One display name per entity and locale, unique within the locale.
    uniqueIndex('catalog_translations_display_entity_idx')
      .on(table.entityType, table.entityId, table.locale)
      .where(sql`${table.kind} = 'name'`),
    uniqueIndex('catalog_translations_display_value_idx')
      .on(table.entityType, table.locale, table.normalizedValue)
      .where(sql`${table.kind} = 'name'`),
    uniqueIndex('catalog_translations_synonym_idx')
      .on(table.entityType, table.entityId, table.locale, table.normalizedValue)
      .where(sql`${table.kind} = 'synonym' AND ${table.ownerFamilyId} IS NULL`),
    uniqueIndex('catalog_translations_family_synonym_idx')
      .on(
        table.entityType,
        table.entityId,
        table.ownerFamilyId,
        table.locale,
        table.normalizedValue,
      )
      .where(
        sql`${table.kind} = 'synonym' AND ${table.ownerFamilyId} IS NOT NULL`,
      ),
    index('catalog_translations_lookup_idx').on(table.normalizedValue),
  ],
);

// Shopping: one active Shopping List per Family (Finish Shopping archives the old one).
export const shoppingListStatus = pgEnum('shopping_list_status', [
  'active',
  'archived',
]);

export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    status: shoppingListStatus('status').notNull().default('active'),
    ...timestamps,
  },
  (table) => [
    // Exactly one active list per Family.
    uniqueIndex('shopping_lists_active_family_idx')
      .on(table.familyId)
      .where(sql`${table.status} = 'active'`),
  ],
);

// A matched Shopping Item points at an Ingredient; an Unmatched one has no
// `ingredientId` and keeps the typed `name` (with its matching key).
export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id').references(() => ingredients.id),
    name: text('name'),
    normalizedName: text('normalized_name'),
    quantity: numeric('quantity', { precision: 12, scale: 3 }),
    unit: ingredientUnit('unit'),
    checked: boolean('checked').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('shopping_items_list_idx').on(table.listId),
    check(
      'shopping_items_matched_or_named',
      sql`(${table.ingredientId} IS NOT NULL) <> (${table.name} IS NOT NULL)`,
    ),
  ],
);

// Which Recipes added a Shopping Item (its Source Recipes). Recipes are never
// hard-deleted; the cascade only matters when a Family (and its Family Recipes) goes.
export const shoppingItemSourceRecipes = pgTable(
  'shopping_item_source_recipes',
  {
    shoppingItemId: uuid('shopping_item_id')
      .notNull()
      .references(() => shoppingItems.id, { onDelete: 'cascade' }),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.shoppingItemId, table.recipeId] })],
);

// Shopping Templates: named, reusable lists a Family applies to its Shopping List.
// A line has the shape of a Shopping Item: an Ingredient (which it keeps in use) or an
// Unmatched `name`, with an optional quantity and unit. `position` keeps the saved order.
export const shoppingTemplates = pgTable(
  'shopping_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [index('shopping_templates_family_idx').on(table.familyId)],
);

export const shoppingTemplateLines = pgTable(
  'shopping_template_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => shoppingTemplates.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    ingredientId: uuid('ingredient_id').references(() => ingredients.id),
    name: text('name'),
    normalizedName: text('normalized_name'),
    quantity: numeric('quantity', { precision: 12, scale: 3 }),
    unit: ingredientUnit('unit'),
    ...timestamps,
  },
  (table) => [
    index('shopping_template_lines_template_idx').on(table.templateId),
    index('shopping_template_lines_ingredient_idx').on(table.ingredientId),
    check(
      'shopping_template_lines_matched_or_named',
      sql`(${table.ingredientId} IS NOT NULL) <> (${table.name} IS NOT NULL)`,
    ),
  ],
);

// Pantry: one Batch is one purchase of one Ingredient, owned by a Family (not a Member).
// An Unmatched Batch has no Ingredient: it keeps the typed `rawName` and sits under an
// "Other" Leaf Category (`leafCategoryId` is always set so Admin curation can find it).
export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id').references(() => ingredients.id),
    leafCategoryId: uuid('leaf_category_id')
      .notNull()
      .references(() => leafCategories.id),
    unmatched: boolean('unmatched').notNull().default(false),
    rawName: text('raw_name'),
    quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }),
    unit: ingredientUnit('unit'),
    location: storageLocation('location').notNull(),
    expiryDate: date('expiry_date', { mode: 'string' }),
    productDescription: text('product_description'),
    ...timestamps,
  },
  (table) => [
    index('batches_family_idx').on(table.familyId),
    check(
      'batches_unit_with_quantity',
      sql`${table.quantity} IS NULL OR ${table.unit} IS NOT NULL`,
    ),
    check(
      'batches_quantity_positive',
      sql`${table.quantity} IS NULL OR ${table.quantity} > 0`,
    ),
    check(
      'batches_match_state',
      sql`(${table.unmatched} AND ${table.ingredientId} IS NULL AND ${table.rawName} IS NOT NULL) OR (NOT ${table.unmatched} AND ${table.ingredientId} IS NOT NULL)`,
    ),
  ],
);

// Where an Unmatched name was saved from: a Scan Mode, a typed entry, a Voice Note, or Finish Shopping.
export const unmatchedSource = pgEnum('unmatched_source', [
  'product',
  'receipt',
  'plate',
  'ingredients',
  'manual',
  'finish_shopping',
  'recipe',
  'voice',
]);

// The Admin review queue: one row per Unmatched Batch or Shopping Item, recording the
// raw text, its locale and source. `rawName` is UI-locale text (the AI's fallback name or
// what the Member typed); `sourceText` is the text as printed, read in `sourceLanguage`
// (a Scan Language). The queue groups rows by `normalizedName`.
// Resolving a name deletes its rows; dismissing keeps them with `dismissedAt` set.
// Rows vanish with the Batch or Shopping Item they were saved on.
export const unmatchedEntries = pgTable(
  'unmatched_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    normalizedName: text('normalized_name').notNull(),
    rawName: text('raw_name').notNull(),
    locale: text('locale').notNull(),
    sourceText: text('source_text'),
    sourceLanguage: text('source_language'),
    source: unmatchedSource('source').notNull(),
    batchId: uuid('batch_id').references(() => batches.id, {
      onDelete: 'cascade',
    }),
    shoppingItemId: uuid('shopping_item_id').references(
      () => shoppingItems.id,
      {
        onDelete: 'cascade',
      },
    ),
    // A Family Recipe's Unmatched Ingredient Line (source `recipe`).
    ingredientLineId: uuid('ingredient_line_id').references(
      () => recipeIngredientLines.id,
      { onDelete: 'cascade' },
    ),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('unmatched_entries_name_recency_idx').on(
      table.normalizedName,
      table.createdAt.desc(),
    ),
    uniqueIndex('unmatched_entries_batch_idx')
      .on(table.batchId)
      .where(sql`${table.batchId} IS NOT NULL`),
    uniqueIndex('unmatched_entries_shopping_item_idx')
      .on(table.shoppingItemId)
      .where(sql`${table.shoppingItemId} IS NOT NULL`),
    uniqueIndex('unmatched_entries_ingredient_line_idx')
      .on(table.ingredientLineId)
      .where(sql`${table.ingredientLineId} IS NOT NULL`),
    check(
      'unmatched_entries_one_target',
      sql`num_nonnulls(${table.batchId}, ${table.shoppingItemId}, ${table.ingredientLineId}) = 1`,
    ),
  ],
);

// The Credit ledger: signed entries per Family. The Credit Balance is their sum, never stored.
// Entries go with their Family; the Member is cleared when deleted (history shows a former Member).
// A spend is negative and names the kind of read; a grant is positive and names its reason.
export const creditEntry = pgTable(
  'credit_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    memberId: text('member_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    kind: creditEntryKind('kind').notNull(),
    // For a spend: the kind of read (scan, voice, assistant, link-page, link-text, guidance).
    readKind: text('read_kind'),
    // For a grant: why it was given.
    reason: text('reason'),
    // For a Promo Code redemption: the code redeemed. Never shown in the history.
    promoCodeId: uuid('promo_code_id').references(() => promoCode.id, {
      onDelete: 'set null',
    }),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('credit_entry_family_id_idx').on(table.familyId, table.createdAt),
    // A 0-Credit Promo Code still writes its entry, so the history shows it. The `::text` keeps Postgres from
    // parsing the literal as the enum: the migration adds that value in the same transaction (see 0052).
    check(
      'credit_entry_amount_not_zero',
      sql`${table.amount} <> 0 or ${table.kind}::text = 'promo_code'`,
    ),
    // A Family is given one Welcome Grant, ever: the rollout is safe to repeat.
    uniqueIndex('credit_entry_welcome_grant_idx')
      .on(table.familyId)
      .where(sql`${table.kind} = 'welcome_grant'`),
  ],
);

// A Promo Code (ADR 0034): single use, worth `credits`. Status is derived: revoked if `revoked_at`, redeemed if
// `redeemed_at`, else unused. Not Family-owned: `redeemed_family_id` is a plain uuid with NO foreign key (ADR 0001
// needs every FK to `family` to cascade, and deleting a Family must not erase which code it used). The redeemer's
// name and email are snapshotted because the Member may be deleted later. `code` is stored normalised (no dash).
export const promoCode = pgTable(
  'promo_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    credits: integer('credits').notNull(),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    redeemedBy: text('redeemed_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    redeemedByName: text('redeemed_by_name'),
    redeemedByEmail: text('redeemed_by_email'),
    redeemedFamilyId: uuid('redeemed_family_id'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('promo_code_created_at_idx').on(table.createdAt, table.id),
    check(
      'promo_code_credits_range',
      sql`${table.credits} between 0 and 10000`,
    ),
    check(
      'promo_code_redeemed_xor_revoked',
      sql`${table.redeemedAt} is null or ${table.revokedAt} is null`,
    ),
  ],
);

// One row per call to an AI provider (ADR 0032). Never shown to Members. The Member and the Family
// are cleared, not cascaded, when deleted, so the accounting survives them. `kind` is the kind of
// read (scan, voice, assistant, link-page, link-text, plate-recipe, guidance, guidance-admin); a Voice Note leaves
// two rows, told apart by `step`: `transcription` or `reading` (every other call is `reading`).
// `kind` is null for a provider call made outside any read. A token or seconds column is null when the
// provider did not report it; `cost_usd` is null when the cost is unknown (an unpriced model or no usage)
// and is frozen at write time.
export const usageRecord = pgTable(
  'usage_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind'),
    step: text('step').notNull().default('reading'),
    memberId: text('member_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    familyId: uuid('family_id').references(() => family.id, {
      onDelete: 'set null',
    }),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cachedTokens: integer('cached_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    audioSeconds: numeric('audio_seconds', { precision: 12, scale: 3 }),
    success: boolean('success').notNull(),
    providerRequestId: text('provider_request_id'),
    costUsd: numeric('cost_usd', { precision: 14, scale: 8 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('usage_record_created_at_idx').on(table.createdAt)],
);

// Daily cap bookkeeping: one row per Member per UTC day per kind, counting Scans (`scan`)
// or Voice Notes (`voice`) that reached the provider.
export const scanUsage = pgTable(
  'scan_usage',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    kind: usageKind('kind').notNull().default('scan'),
    count: integer('count').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.memberId, table.day, table.kind] }),
    check('scan_usage_count_non_negative', sql`${table.count} >= 0`),
  ],
);
// Dashboard: a Member's own layout, an ordered list of Widget instances (type and size).
// No row means the Member never customised it and gets the default layout.
export const dashboardLayouts = pgTable('dashboard_layouts', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  widgets: jsonb('widgets')
    .$type<Array<{ id: string; type: string; size: string }>>()
    .notNull(),
  ...timestamps,
});

// Family Settings: a Default Expiry override per Category. `entityId` is a Parent or
// Leaf Category id (selected by `entityType`), so it carries no foreign key.
export const familyExpiryOverrides = pgTable(
  'family_expiry_overrides',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    entityType: catalogEntityType('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    days: integer('days').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.familyId, table.entityType, table.entityId] }),
    check(
      'family_expiry_overrides_category',
      sql`${table.entityType} IN ('parent_category', 'leaf_category')`,
    ),
    check(
      'family_expiry_overrides_days',
      sql`${table.days} BETWEEN 1 AND 3650`,
    ),
  ],
);

// Quick List: an Ingredient the Family always wants in stock, with an optional preferred
// quantity and unit. The foreign key has no cascade, so a Staple keeps its Ingredient in use.
export const staples = pgTable(
  'staples',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    quantity: numeric('quantity', { precision: 12, scale: 3, mode: 'number' }),
    unit: ingredientUnit('unit'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('staples_family_ingredient_idx').on(
      table.familyId,
      table.ingredientId,
    ),
    check(
      'staples_unit_with_quantity',
      sql`${table.quantity} IS NULL OR ${table.unit} IS NOT NULL`,
    ),
    check(
      'staples_quantity_positive',
      sql`${table.quantity} IS NULL OR ${table.quantity} > 0`,
    ),
  ],
);

// A Family's manual "Running low" flag on an Ingredient. Row existence means on; no row
// means off, as for Staples. Set and cleared from the Pantry toggle, never from quantities.
export const runningLow = pgTable(
  'running_low',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.familyId, table.ingredientId] })],
);

// A dismissed Suggestion, hidden for the whole Family. Creating any Batch of the
// Ingredient deletes the row. Not tied to Staples, so Used Up Suggestions can share it.
export const suggestionDismissals = pgTable(
  'suggestion_dismissals',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.familyId, table.ingredientId] })],
);

// One row per Family and Ingredient: when it was last stocked and when its last Batch
// was removed (null while stocked or after a dismissal). Written only by the Pantry
// service's Batch create and delete paths. See ADR 0005.
export const ingredientStockHistory = pgTable(
  'ingredient_stock_history',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    lastStockedAt: timestamp('last_stocked_at', {
      withTimezone: true,
    }).notNull(),
    usedUpAt: timestamp('used_up_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.familyId, table.ingredientId] })],
);

// Tags (ADR 0033). A Tag Group is an Admin-ordered heading Catalog Tags are listed under; its
// display names live in catalog_translations (entity type `tag_group`).
export const tagGroups = pgTable(
  'tag_groups',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('tag_groups_normalized_name_idx').on(table.normalizedName),
  ],
);

// A Tag: a Catalog Tag (`familyId` null, always in a group; display names in catalog_translations
// under entity type `tag`) or a Family Tag (`familyId` set, no group, never translated).
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    familyId: uuid('family_id').references(() => family.id, {
      onDelete: 'cascade',
    }),
    groupId: uuid('group_id').references(() => tagGroups.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('tags_catalog_normalized_name_idx')
      .on(table.normalizedName)
      .where(sql`${table.familyId} IS NULL`),
    uniqueIndex('tags_family_normalized_name_idx')
      .on(table.familyId, table.normalizedName)
      .where(sql`${table.familyId} IS NOT NULL`),
    index('tags_group_idx').on(table.groupId),
    check(
      'tags_group_iff_catalog',
      sql`(${table.familyId} IS NULL) = (${table.groupId} IS NOT NULL)`,
    ),
  ],
);

export const recipeDifficulty = pgEnum('recipe_difficulty', [
  'easy',
  'medium',
  'hard',
]);

// A Recipe: Catalog-owned (`familyId` null) or Family-owned. `parentId` makes it a
// Variant of a Base Recipe (a Recipe without a parent); it is set at creation and
// never changes. `title` is the source text; translations live in recipe_translations.
// Never hard-deleted: `archivedAt` hides it.
export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => recipes.id),
    familyId: uuid('family_id').references(() => family.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    servings: integer('servings').notNull(),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    difficulty: recipeDifficulty('difficulty'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // Recipe guidance: one general-direction note, at most 500 characters (checked in the service).
    nutritionNote: text('nutrition_note'),
    // Recipe from Link: the normalised page the Recipe was read from. Family Recipes only; never copied to a Variant.
    sourceLink: text('source_link'),
    // Recipe from Link: the page's detected language, only when the Recipe was translated out of it. Never copied to a Variant.
    sourceLanguage: text('source_language'),
    // Add to Family: the Catalog Recipe this Family Recipe was Copied From (ADR 0029). Set only on Family copies.
    copiedFromId: uuid('copied_from_id').references(
      (): AnyPgColumn => recipes.id,
    ),
    ...timestamps,
  },
  (table) => [
    index('recipes_parent_idx').on(table.parentId),
    index('recipes_family_idx').on(table.familyId),
    // "Already in your Recipes": the Family's Recipe for a Source Link.
    index('recipes_family_source_link_idx')
      .on(table.familyId, table.sourceLink)
      .where(sql`${table.sourceLink} IS NOT NULL`),
    // At most one live copy of a Catalog Recipe per Family; an archived copy frees the slot.
    uniqueIndex('recipes_family_copied_from_live_idx')
      .on(table.familyId, table.copiedFromId)
      .where(
        sql`${table.copiedFromId} IS NOT NULL AND ${table.archivedAt} IS NULL`,
      ),
    check('recipes_servings_positive', sql`${table.servings} > 0`),
    check(
      'recipes_minutes_non_negative',
      sql`(${table.prepMinutes} IS NULL OR ${table.prepMinutes} >= 0) AND (${table.cookMinutes} IS NULL OR ${table.cookMinutes} >= 0)`,
    ),
  ],
);

// The Tags on a Recipe. Catalog Recipes carry only Catalog Tags.
export const recipeTags = pgTable(
  'recipe_tags',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.tagId] }),
    index('recipe_tags_tag_idx').on(table.tagId),
  ],
);

// An Ingredient Line: a Catalog Ingredient, or (Family Recipes only) an Unmatched name.
// Quantity and unit are both set or both null. `note` is the preparation note.
export const recipeIngredientLines = pgTable(
  'recipe_ingredient_lines',
  {
    id: uuid('id').primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    ingredientId: uuid('ingredient_id').references(() => ingredients.id),
    rawName: text('raw_name'),
    normalizedName: text('normalized_name'),
    quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }),
    unit: ingredientUnit('unit'),
    optional: boolean('optional').notNull().default(false),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    index('recipe_ingredient_lines_recipe_idx').on(table.recipeId),
    index('recipe_ingredient_lines_ingredient_idx').on(table.ingredientId),
    index('recipe_ingredient_lines_name_idx').on(table.normalizedName),
    check(
      'recipe_ingredient_lines_quantity_with_unit',
      sql`(${table.quantity} IS NULL) = (${table.unit} IS NULL)`,
    ),
    check(
      'recipe_ingredient_lines_quantity_positive',
      sql`${table.quantity} IS NULL OR ${table.quantity} > 0`,
    ),
    check(
      'recipe_ingredient_lines_matched_or_named',
      sql`(${table.ingredientId} IS NOT NULL) <> (${table.rawName} IS NOT NULL AND ${table.normalizedName} IS NOT NULL)`,
    ),
  ],
);

export const recipeSteps = pgTable(
  'recipe_steps',
  {
    id: uuid('id').primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    timerSeconds: integer('timer_seconds'),
    ...timestamps,
  },
  (table) => [
    index('recipe_steps_recipe_idx').on(table.recipeId),
    check(
      'recipe_steps_timer_non_negative',
      sql`${table.timerSeconds} IS NULL OR ${table.timerSeconds} >= 0`,
    ),
  ],
);

// A Tip is on the Recipe (stepId null) or on one of its Steps. Step Tips are never inherited.
export const recipeTips = pgTable(
  'recipe_tips',
  {
    id: uuid('id').primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id').references(() => recipeSteps.id, {
      onDelete: 'cascade',
    }),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    ...timestamps,
  },
  (table) => [
    index('recipe_tips_recipe_idx').on(table.recipeId),
    index('recipe_tips_step_idx').on(table.stepId),
  ],
);

// A Variant hides base Recipe-level Tips it does not want to inherit.
export const recipeHiddenTips = pgTable(
  'recipe_hidden_tips',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tipId: uuid('tip_id')
      .notNull()
      .references(() => recipeTips.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.tipId] })],
);

// Translations of Catalog Recipe text, one table per translated field group; the
// source text lives on the row itself and is the fallback. They cascade with their row.
export const recipeTranslations = pgTable(
  'recipe_translations',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.locale] })],
);

export const recipeStepTranslations = pgTable(
  'recipe_step_translations',
  {
    stepId: uuid('step_id')
      .notNull()
      .references(() => recipeSteps.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    text: text('text').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.stepId, table.locale] })],
);

export const recipeIngredientLineTranslations = pgTable(
  'recipe_ingredient_line_translations',
  {
    lineId: uuid('line_id')
      .notNull()
      .references(() => recipeIngredientLines.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    note: text('note').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.lineId, table.locale] })],
);

export const recipeTipTranslations = pgTable(
  'recipe_tip_translations',
  {
    tipId: uuid('tip_id')
      .notNull()
      .references(() => recipeTips.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    text: text('text').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tipId, table.locale] })],
);

// Recipe guidance (ADR 0008). Pairings and Eating Moment uses are ordered by
// `position` (array order, no unique index). Source text is English on the row;
// translations (Catalog Recipes only) live in their own tables and cascade.
export const pairingKind = pgEnum('pairing_kind', ['food', 'drink']);
export const pairingPrinciple = pgEnum('pairing_principle', [
  'acid_cuts_fat',
  'salt_balances_sweet',
  'fat_carries_flavour',
  'contrast_texture',
  'complement_flavour',
  'bitter_balances_rich',
  'cleanses_palate',
  'regional_tradition',
]);
export const eatingMomentPolarity = pgEnum('eating_moment_polarity', [
  'good_for',
  'avoid',
]);

export const recipeNutritionNoteTranslations = pgTable(
  'recipe_nutrition_note_translations',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    nutritionNote: text('nutrition_note').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.locale] })],
);

// A Pairing links at most one Catalog Ingredient or one Recipe. A deleted Recipe
// (never done in practice) just loses the link; an Ingredient in use cannot be deleted.
export const recipePairings = pgTable(
  'recipe_pairings',
  {
    id: uuid('id').primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: pairingKind('kind').notNull(),
    label: text('label').notNull(),
    reason: text('reason').notNull(),
    principle: pairingPrinciple('principle'),
    linkedIngredientId: uuid('linked_ingredient_id').references(
      () => ingredients.id,
    ),
    linkedRecipeId: uuid('linked_recipe_id').references(() => recipes.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('recipe_pairings_recipe_idx').on(table.recipeId),
    index('recipe_pairings_linked_recipe_idx').on(table.linkedRecipeId),
    index('recipe_pairings_linked_ingredient_idx').on(table.linkedIngredientId),
    check(
      'recipe_pairings_one_link',
      sql`num_nonnulls(${table.linkedIngredientId}, ${table.linkedRecipeId}) <= 1`,
    ),
  ],
);

export const recipePairingTranslations = pgTable(
  'recipe_pairing_translations',
  {
    pairingId: uuid('pairing_id')
      .notNull()
      .references(() => recipePairings.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    label: text('label').notNull(),
    reason: text('reason').notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.pairingId, table.locale] })],
);

// An Eating Moment is an Admin-curated, ordered, translated list entry like an
// Aisle (names in catalog_translations, entity type `eating_moment`). Archived
// moments are hidden from the picker and from display but stay on Recipes.
export const eatingMoments = pgTable(
  'eating_moments',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('eating_moments_normalized_name_idx').on(table.normalizedName),
  ],
);

export const recipeEatingMoments = pgTable(
  'recipe_eating_moments',
  {
    id: uuid('id').primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    eatingMomentId: uuid('eating_moment_id')
      .notNull()
      .references(() => eatingMoments.id),
    position: integer('position').notNull(),
    polarity: eatingMomentPolarity('polarity').notNull(),
    reason: text('reason'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('recipe_eating_moments_recipe_moment_idx').on(
      table.recipeId,
      table.eatingMomentId,
    ),
    index('recipe_eating_moments_moment_idx').on(table.eatingMomentId),
  ],
);

export const recipeEatingMomentTranslations = pgTable(
  'recipe_eating_moment_translations',
  {
    recipeEatingMomentId: uuid('recipe_eating_moment_id')
      .notNull()
      .references(() => recipeEatingMoments.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    reason: text('reason').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.recipeEatingMomentId, table.locale] }),
  ],
);

// Meal Plans: a Family's saved schedule of Recipes over 1-7 consecutive days from `startDate`.
// Plans of one Family never overlap and are capped (both enforced in the service under the
// Family lock). `servings` is the plan default; a Plan Slot may override it.
export const mealtime = pgEnum('mealtime', ['breakfast', 'lunch', 'dinner']);

export const mealPlans = pgTable(
  'meal_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    name: text('name'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    days: integer('days').notNull(),
    servings: integer('servings').notNull(),
    ...timestamps,
  },
  (table) => [
    index('meal_plans_family_start_idx').on(table.familyId, table.startDate),
    check('meal_plans_days_range', sql`${table.days} BETWEEN 1 AND 7`),
    check(
      'meal_plans_servings_range',
      sql`${table.servings} BETWEEN 1 AND 1000`,
    ),
  ],
);

// A filled Plan Slot; an empty slot is no row. Its date is the plan's `startDate` plus
// `dayIndex` (the service keeps `dayIndex` below the plan's `days`). A null `servings`
// follows the plan. Recipes are archived, never deleted, so `recipeId` has no cascade.
export const mealPlanSlots = pgTable(
  'meal_plan_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mealPlanId: uuid('meal_plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    dayIndex: integer('day_index').notNull(),
    mealtime: mealtime('mealtime').notNull(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id),
    servings: integer('servings'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('meal_plan_slots_plan_day_mealtime_idx').on(
      table.mealPlanId,
      table.dayIndex,
      table.mealtime,
    ),
    index('meal_plan_slots_recipe_idx').on(table.recipeId),
    check('meal_plan_slots_day_range', sql`${table.dayIndex} BETWEEN 0 AND 6`),
    check(
      'meal_plan_slots_servings_range',
      sql`${table.servings} BETWEEN 1 AND 1000`,
    ),
  ],
);

// A Family's Known Barcode (ADR 0013): what the Family last saved a barcode as, an
// Ingredient or an Unmatched raw name (the same match-state rule as a Batch), plus the
// Product Description. Written when a Batch is created with a `barcode`; the latest
// save wins. Deleting the Ingredient deletes the row; an Admin merge re-points it.
export const knownBarcodes = pgTable(
  'known_barcodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    barcode: text('barcode').notNull(),
    ingredientId: uuid('ingredient_id').references(() => ingredients.id, {
      onDelete: 'cascade',
    }),
    rawName: text('raw_name'),
    // The matching key of `rawName`, so a Family Ingredient, Synonym or Admin resolve can relink it.
    normalizedName: text('normalized_name'),
    productDescription: text('product_description'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('known_barcodes_family_barcode_idx').on(
      table.familyId,
      table.barcode,
    ),
    index('known_barcodes_ingredient_idx').on(table.ingredientId),
    index('known_barcodes_normalized_name_idx').on(table.normalizedName),
    check(
      'known_barcodes_match_state',
      sql`(${table.ingredientId} IS NOT NULL AND ${table.rawName} IS NULL) OR (${table.ingredientId} IS NULL AND ${table.rawName} IS NOT NULL)`,
    ),
  ],
);

// Open Food Facts cache (ADR 0013): shared by every Family, keyed by barcode.
// Holds only Open Food Facts data, never Family data. A null payload is a
// "not found". Entries are kept 30 days (hit) or 1 day (not found) from `fetchedAt`.
export const openFoodFactsCache = pgTable('open_food_facts_cache', {
  barcode: text('barcode').primaryKey(),
  product: jsonb('product').$type<OpenFoodFactsProduct | null>(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
});

// Recipe Draft (ADR 0028): a Member's unsaved New Recipe or new Variant, kept on the server.
// Private to its Member and never a Recipe. `content` is the form state as typed (half-typed
// values included). Deleted lazily 30 days after `updatedAt`, with the Member's other
// Recipe Drafts when they leave the Family.
export const recipeDraftKind = pgEnum('recipe_draft_kind', [
  'new_recipe',
  'variant',
]);

export const recipeDrafts = pgTable(
  'recipe_drafts',
  {
    id: uuid('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id, { onDelete: 'cascade' }),
    kind: recipeDraftKind('kind').notNull(),
    // Set to none when the base Recipe is deleted.
    baseRecipeId: uuid('base_recipe_id').references(() => recipes.id, {
      onDelete: 'set null',
    }),
    content: jsonb('content').$type<RecipeDraftContent>().notNull(),
    // Optimistic concurrency: the client sends the version it last saw.
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('recipe_drafts_member_updated_idx').on(
      table.memberId,
      table.updatedAt,
    ),
  ],
);
