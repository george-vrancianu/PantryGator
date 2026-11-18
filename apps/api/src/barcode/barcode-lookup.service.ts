import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.types';
import { ingredientAllergens, openFoodFactsCache } from '../database/schema';
import type { ExpiryOverride } from '../catalog/catalog-defaults';
import { catalogScope } from '../catalog/catalog-scope';
import { CatalogSearchService } from '../catalog/catalog-search.service';
import { seedId } from '../catalog/seed/seed-ids';
import type {
  CatalogAllergen,
  CatalogLocale,
  CatalogSearchResult,
} from '../catalog/catalog.schemas';
import { SettingsService } from '../settings/settings.service';
import type { BarcodeLookupResponse } from './barcode.schemas';
import { allergenSlugsOf } from './open-food-facts-allergens';
import { findKnownBarcode } from './known-barcodes';
import {
  BarcodeRateLimitedException,
  OpenFoodFactsThrottle,
} from './open-food-facts-throttle';
import { parseNetQuantity } from './net-quantity';
import {
  InjectOpenFoodFacts,
  type OpenFoodFactsClient,
  type OpenFoodFactsProduct,
} from './open-food-facts.client';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the shared cache keeps a product, and a "not found". */
const HIT_TTL_MS = 30 * DAY_MS;
const NOT_FOUND_TTL_MS = DAY_MS;
/** Lazy sweep of expired cache rows: at most one per interval, at most this many rows each. */
const SWEEP_INTERVAL_MS = 60 * 1000;
const SWEEP_BATCH = 100;
/** The Batch's Product Description limit (pantry.schemas). */
const DESCRIPTION_MAX = 200;

/**
 * Barcode Lookup (ADR 0013): a barcode as a Prefill proposal. Not a Scan, so
 * it never touches the Scan Cap, and there is no AI call: the Ingredient is
 * matched by exact name or Synonym, then by the Catalog search.
 */
@Injectable()
export class BarcodeLookupService {
  private readonly logger = new Logger(BarcodeLookupService.name);
  private lastSweepAt = 0;
  /** The sweep in flight, so overlapping lookups start only one. */
  private sweeping: Promise<void> | null = null;

  /** Open Food Facts calls in flight, by barcode (single-flight). */
  private readonly fetching = new Map<
    string,
    Promise<OpenFoodFactsProduct | null>
  >();

  constructor(
    @InjectOpenFoodFacts() private readonly openFoodFacts: OpenFoodFactsClient,
    private readonly catalogSearch: CatalogSearchService,
    private readonly settings: SettingsService,
    private readonly throttle: OpenFoodFactsThrottle,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

  async lookup(
    memberId: string,
    barcode: string,
    locale: CatalogLocale,
  ): Promise<BarcodeLookupResponse> {
    // The resolution order of ADR 0013 starts here. The Family's Known Barcode
    // is checked first and returns before this; the shared cache of
    // Open Food Facts results (#347) wraps `product` so a hit skips the client.
    this.sweepExpiredInBackground();
    const familyId = await this.settings.familyIdOf(memberId);
    const scope = catalogScope(familyId);
    const known = await this.knownBarcode(familyId, barcode, locale, scope);
    if (known) return known;
    const product = await this.product(memberId, barcode);
    if (!product) return { found: false };

    const names = candidateNames(product, locale);
    if (names.length === 0) return { found: false };
    const overrides = await this.settings.expiryOverridesForMember(memberId);
    const match = await this.confidentMatch(scope, names, locale, overrides);
    const listed = await this.listedAllergens(scope, locale, product);
    return {
      found: true,
      source: 'open_food_facts',
      match,
      lowConfidence: false,
      allergens: listed,
      missingAllergens: await this.untaggedOn(match, listed),
      productDescription: names[0].slice(0, DESCRIPTION_MAX),
      ...parseNetQuantity(product.quantity),
    };
  }

  /**
   * Expiry is lazy (no scheduler, like Recipe Drafts): a lookup starts a bounded delete of
   * expired cache rows without waiting for it. At most one runs at a time and one per
   * interval; a failure is logged and never reaches the lookup.
   */
  private sweepExpiredInBackground(): void {
    const now = Date.now();
    if (this.sweeping || now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    this.sweeping = this.deleteExpired(now)
      .catch((error: unknown) => {
        this.logger.warn(
          `Open Food Facts cache sweep failed: ${String(error)}`,
        );
      })
      .finally(() => {
        this.sweeping = null;
      });
  }

  /** Deletes up to SWEEP_BATCH rows past their TTL (a hit 30 days, a "not found" 1 day). */
  private async deleteExpired(now: number): Promise<void> {
    const expired = and(
      or(
        and(
          isNull(openFoodFactsCache.product),
          lt(openFoodFactsCache.fetchedAt, new Date(now - NOT_FOUND_TTL_MS)),
        ),
        lt(openFoodFactsCache.fetchedAt, new Date(now - HIT_TTL_MS)),
      ),
    );
    const batch = this.database
      .select({ barcode: openFoodFactsCache.barcode })
      .from(openFoodFactsCache)
      .where(expired)
      .limit(SWEEP_BATCH);
    await this.database
      .delete(openFoodFactsCache)
      .where(and(expired, inArray(openFoodFactsCache.barcode, batch)));
  }

  /** What the Family last saved this barcode as, exactly, or null. No Open Food Facts credit. */
  private async knownBarcode(
    familyId: string,
    barcode: string,
    locale: CatalogLocale,
    scope: ReturnType<typeof catalogScope>,
  ): Promise<BarcodeLookupResponse | null> {
    const known = await findKnownBarcode(this.database, familyId, barcode);
    if (!known) return null;
    // Known Barcodes keep no allergens: re-read them from the shared cache, never fetching.
    const listed = await this.listedAllergens(
      scope,
      locale,
      (await this.freshCached(barcode))?.product ?? null,
    );
    const base = {
      found: true,
      source: 'known_barcode',
      lowConfidence: false,
      allergens: listed,
      productDescription: (known.productDescription ?? '').slice(
        0,
        DESCRIPTION_MAX,
      ),
      quantity: null,
      unit: null,
    } as const;
    if (known.ingredientId === null) {
      return {
        ...base,
        match: null,
        missingAllergens: [],
        unmatchedName: known.rawName ?? '',
      };
    }
    const overrides = await this.settings.expiryOverridesOf(familyId);
    const [match] = await this.catalogSearch.findByIds(
      catalogScope(familyId),
      [known.ingredientId],
      locale,
      overrides,
    );
    // Not in the Family's scope any more: let Open Food Facts answer instead.
    if (!match) return null;
    return {
      ...base,
      match,
      missingAllergens: await this.untaggedOn(match, listed),
    };
  }

  /** The shared cache row for a barcode while it is fresh, or null. A cached "not found" has a null product. */
  private async freshCached(barcode: string) {
    const [cached] = await this.database
      .select()
      .from(openFoodFactsCache)
      .where(eq(openFoodFactsCache.barcode, barcode));
    if (!cached) return null;
    const ttl = cached.product ? HIT_TTL_MS : NOT_FOUND_TTL_MS;
    return Date.now() - cached.fetchedAt.getTime() < ttl ? cached : null;
  }

  /** The product's mapped Allergens that are still active, named in `locale`, in list order. */
  private async listedAllergens(
    scope: ReturnType<typeof catalogScope>,
    locale: CatalogLocale,
    product: OpenFoodFactsProduct | null,
  ): Promise<CatalogAllergen[]> {
    const ids = new Set(
      allergenSlugsOf(product?.allergenTags).map((slug) =>
        seedId.allergen(slug),
      ),
    );
    if (ids.size === 0) return [];
    // listAllergens leaves out retired Allergens, which are never proposed or noted.
    return (await this.catalogSearch.listAllergens(scope, locale)).filter(
      (allergen) => ids.has(allergen.id),
    );
  }

  /** The `listed` Allergens the matched Ingredient is not tagged with. */
  private async untaggedOn(
    match: CatalogSearchResult | null,
    listed: CatalogAllergen[],
  ): Promise<CatalogAllergen[]> {
    if (!match || listed.length === 0) return [];
    const tagged = new Set(
      (
        await this.database
          .select({ id: ingredientAllergens.allergenId })
          .from(ingredientAllergens)
          .where(eq(ingredientAllergens.ingredientId, match.id))
      ).map((row) => row.id),
    );
    return listed.filter((allergen) => !tagged.has(allergen.id));
  }

  /**
   * The product as Open Food Facts has it, or null. Served from the shared
   * cache while fresh; a failure throws and is never cached. A call that goes out is rate limited.
   */
  private async product(
    memberId: string,
    barcode: string,
  ): Promise<OpenFoodFactsProduct | null> {
    const cached = await this.freshCached(barcode);
    if (cached) return cached.product;
    // Lookups of the same uncached code that overlap share one call and one charge.
    const pending = this.fetching.get(barcode);
    if (pending) {
      try {
        return await pending;
      } catch (error) {
        // The 429 was the caller who paid for the call, not this one's: try again on this
        // Member's own charge (the failed call is gone from `fetching` by now).
        if (error instanceof BarcodeRateLimitedException) {
          return this.product(memberId, barcode);
        }
        throw error;
      }
    }
    const fetching = this.fetchAndCache(memberId, barcode).finally(() =>
      this.fetching.delete(barcode),
    );
    this.fetching.set(barcode, fetching);
    return fetching;
  }

  private async fetchAndCache(
    memberId: string,
    barcode: string,
  ): Promise<OpenFoodFactsProduct | null> {
    // Only a call that really goes out is charged against the limits (#416).
    this.throttle.charge(memberId);
    const fetched = await this.openFoodFacts.fetchProduct(barcode);
    // A product with no usable name cannot prefill anything: it is a not found.
    const product = fetched && hasName(fetched) ? fetched : null;
    const fetchedAt = new Date(Date.now());
    await this.database
      .insert(openFoodFactsCache)
      .values({ barcode, product, fetchedAt })
      .onConflictDoUpdate({
        target: openFoodFactsCache.barcode,
        set: { product, fetchedAt },
      });
    return product;
  }

  private async confidentMatch(
    scope: ReturnType<typeof catalogScope>,
    names: string[],
    locale: CatalogLocale,
    overrides: ExpiryOverride[],
  ): Promise<CatalogSearchResult | null> {
    // Exact name or Synonym first; the Family's entries win (ADR 0011).
    const exact = await this.catalogSearch.findExact(
      scope,
      names,
      locale,
      overrides,
    );
    for (const name of names) {
      const hit = exact.get(name);
      if (hit) return hit;
    }
    // Then the Catalog search; only an unambiguous hit (one Ingredient) is confident.
    for (const name of names) {
      // Limit 2 is only to detect ambiguity: exactly one hit is confident.
      const hits = await this.catalogSearch.search(
        scope,
        name,
        locale,
        2,
        overrides,
      );
      if (hits.length === 1) return hits[0];
    }
    return null;
  }
}

/**
 * The names to try, best first: the product name in the Member's Catalog Language, then
 * the generic name, then English, then whatever Open Food Facts calls it.
 */
function candidateNames(
  product: OpenFoodFactsProduct,
  locale: CatalogLocale,
): string[] {
  const ordered = [
    product.productNames[locale],
    product.genericNames[locale],
    product.genericName,
    product.productNames.en,
    product.genericNames.en,
    product.productName,
  ];
  return [
    ...new Set(ordered.filter((name): name is string => Boolean(name?.trim()))),
  ];
}

function hasName(product: OpenFoodFactsProduct): boolean {
  return [
    product.productName,
    product.genericName,
    ...Object.values(product.productNames),
    ...Object.values(product.genericNames),
  ].some((name) => Boolean(name?.trim()));
}
