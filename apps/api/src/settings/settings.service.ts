import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  resolveCatalogDefaults,
  type ExpiryOverride,
} from '../catalog/catalog-defaults';
import { catalogScope, type CatalogScope } from '../catalog/catalog-scope';
import {
  CATALOG_LOCALES,
  type CatalogLocale,
} from '../catalog/catalog.schemas';
import { loadDisplayNames } from '../catalog/display-names';
import { ApiException } from '../common/api-exception';
import {
  asScanLanguage,
  resolveLanguage,
} from '../member-language/member-language';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.types';
import {
  allergens,
  family,
  familyAllergies,
  familyExpiryOverrides,
  leafCategories,
  memberAllergies,
  parentCategories,
  user,
} from '../database/schema';
import {
  loadFamilyAllergies,
  loadOtherMemberAllergies,
} from './family-allergies';
import { loadMemberAllergenIds } from './member-allergies';
import {
  normalizeTheme,
  type AllergiesView,
  type CategoryOptionsView,
  type ExpiryOverrideView,
  type FamilyAllergiesView,
  type FamilyAllergyView,
  type FamilySettingsView,
  type PreferencesView,
  type UpdatePreferencesBody,
} from './settings.schemas';

/** Family Settings (shared by every Member of a Family) and Member Preferences (private). */
@Injectable()
export class SettingsService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async familyIdOf(memberId: string): Promise<string> {
    const [self] = await this.database
      .select({ familyId: user.familyId })
      .from(user)
      .where(eq(user.id, memberId))
      .limit(1);
    if (!self) throw new ApiException(401, 'auth.unauthenticated');
    return self.familyId;
  }

  /** The Catalog scope of a Member's Family. */
  async catalogScopeForMember(memberId: string): Promise<CatalogScope> {
    return catalogScope(await this.familyIdOf(memberId));
  }

  expiryOverridesForMember(memberId: string): Promise<ExpiryOverride[]> {
    return this.familyIdOf(memberId).then((id) => this.expiryOverridesOf(id));
  }

  /** The Family's Default Expiry overrides, for resolving a Category's expiry. */
  async expiryOverridesOf(familyId: string): Promise<ExpiryOverride[]> {
    return this.database
      .select({
        entityType: familyExpiryOverrides.entityType,
        entityId: familyExpiryOverrides.entityId,
        days: familyExpiryOverrides.days,
      })
      .from(familyExpiryOverrides)
      .where(eq(familyExpiryOverrides.familyId, familyId));
  }

  async staleThresholdOf(familyId: string): Promise<number> {
    const [row] = await this.database
      .select({ days: family.staleThresholdDays })
      .from(family)
      .where(eq(family.id, familyId))
      .limit(1);
    return row?.days ?? 3;
  }

  async getFamilySettings(
    memberId: string,
    locale: CatalogLocale,
  ): Promise<FamilySettingsView> {
    const familyId = await this.familyIdOf(memberId);
    const overrides = await this.expiryOverridesOf(familyId);
    const names = await loadDisplayNames(
      this.database,
      catalogScope(familyId),
      locale,
      overrides.map((o) => o.entityId),
    );
    const canonical = await this.canonicalNames(
      overrides.map((o) => o.entityId),
    );
    const views: ExpiryOverrideView[] = overrides.map((o) => ({
      categoryId: o.entityId,
      name: names.pick(
        o.entityType,
        o.entityId,
        canonical.get(o.entityId) ?? '',
      ),
      days: o.days,
    }));
    views.sort((a, b) => a.name.localeCompare(b.name, locale));
    return {
      staleThresholdDays: await this.staleThresholdOf(familyId),
      expiryOverrides: views,
    };
  }

  async setStaleThreshold(memberId: string, days: number): Promise<void> {
    const familyId = await this.familyIdOf(memberId);
    await this.database
      .update(family)
      .set({ staleThresholdDays: days })
      .where(eq(family.id, familyId));
  }

  async setExpiryOverride(
    memberId: string,
    categoryId: string,
    days: number,
  ): Promise<void> {
    const familyId = await this.familyIdOf(memberId);
    const entityType = await this.categoryType(categoryId);
    await this.database
      .insert(familyExpiryOverrides)
      .values({ familyId, entityType, entityId: categoryId, days })
      .onConflictDoUpdate({
        target: [
          familyExpiryOverrides.familyId,
          familyExpiryOverrides.entityType,
          familyExpiryOverrides.entityId,
        ],
        set: { days, updatedAt: new Date() },
      });
  }

  async removeExpiryOverride(
    memberId: string,
    categoryId: string,
  ): Promise<void> {
    const familyId = await this.familyIdOf(memberId);
    await this.database
      .delete(familyExpiryOverrides)
      .where(
        and(
          eq(familyExpiryOverrides.familyId, familyId),
          eq(familyExpiryOverrides.entityId, categoryId),
        ),
      );
  }

  /**
   * Parent Categories with their Leaf Categories: what an override can target, each with its
   * Catalog Default Expiry (`catalogDays`; a Leaf without its own uses its Parent's).
   */
  async categoryOptions(
    memberId: string,
    locale: CatalogLocale,
  ): Promise<CategoryOptionsView> {
    const scope = await this.catalogScopeForMember(memberId);
    const parents = await this.database
      .select()
      .from(parentCategories)
      .orderBy(asc(parentCategories.normalizedName));
    const leaves = await this.database
      .select()
      .from(leafCategories)
      .orderBy(asc(leafCategories.normalizedName));
    const names = await loadDisplayNames(this.database, scope, locale, [
      ...parents.map((p) => p.id),
      ...leaves.map((l) => l.id),
    ]);
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name, locale);
    return {
      parents: parents
        .map((parent) => ({
          id: parent.id,
          name: names.pick('parent_category', parent.id, parent.name),
          catalogDays: parent.defaultExpiryDays,
          leaves: leaves
            .filter((leaf) => leaf.parentId === parent.id)
            .map((leaf) => ({
              id: leaf.id,
              name: names.pick('leaf_category', leaf.id, leaf.name),
              catalogDays: resolveCatalogDefaults(leaf, parent).expiryDays,
            }))
            .sort(byName),
        }))
        .sort(byName),
    };
  }

  async getPreferences(memberId: string): Promise<PreferencesView> {
    const [row] = await this.database
      .select({
        locale: user.locale,
        catalogLanguage: user.catalogLanguage,
        scanLanguage: user.scanLanguage,
        spokenLanguage: user.spokenLanguage,
        theme: user.theme,
        hideRecipesWithAllergies: user.hideRecipesWithAllergies,
        introDoneAt: user.introDoneAt,
      })
      .from(user)
      .where(eq(user.id, memberId))
      .limit(1);
    if (!row) throw new ApiException(401, 'auth.unauthenticated');
    const locale = CATALOG_LOCALES.find((l) => l === row.locale) ?? null;
    const theme = normalizeTheme(row.theme);
    return {
      locale,
      catalogLanguage:
        CATALOG_LOCALES.find((l) => l === row.catalogLanguage) ?? null,
      effectiveCatalogLanguage: resolveLanguage('catalog', row),
      scanLanguage: asScanLanguage(row.scanLanguage),
      effectiveScanLanguage: resolveLanguage('scan', row),
      spokenLanguage: asScanLanguage(row.spokenLanguage),
      effectiveSpokenLanguage: resolveLanguage('spoken', row),
      theme,
      hideRecipesWithAllergies: row.hideRecipesWithAllergies,
      introDone: row.introDoneAt !== null,
    };
  }

  /** Saves only the given preferences; the others keep their stored value. */
  async setPreferences(
    memberId: string,
    preferences: UpdatePreferencesBody,
  ): Promise<void> {
    await this.database
      .update(user)
      .set({
        locale: preferences.locale,
        catalogLanguage: preferences.catalogLanguage,
        scanLanguage: preferences.scanLanguage,
        spokenLanguage: preferences.spokenLanguage,
        theme: preferences.theme,
        hideRecipesWithAllergies: preferences.hideRecipesWithAllergies,
        // First time wins: a later call keeps the stored timestamp.
        introDoneAt: preferences.introDone
          ? sql`coalesce(${user.introDoneAt}, now())`
          : undefined,
      })
      .where(eq(user.id, memberId));
  }

  /** The Allergen list in its curated order, named in `locale`, and the Member's own Allergies. */
  async getAllergies(
    memberId: string,
    locale: CatalogLocale,
  ): Promise<AllergiesView> {
    const scope = await this.catalogScopeForMember(memberId);
    const [all, own] = await Promise.all([
      this.database
        .select()
        .from(allergens)
        .orderBy(asc(allergens.sortOrder), asc(allergens.name)),
      loadMemberAllergenIds(this.database, memberId),
    ]);
    // A retired Allergen leaves the picker, unless the Member already has it.
    const rows = all.filter((row) => !row.archivedAt || own.includes(row.id));
    const names = await loadDisplayNames(
      this.database,
      scope,
      locale,
      rows.map((row) => row.id),
    );
    const ownIds = new Set(own);
    return {
      allergens: rows.map((row) => ({
        id: row.id,
        name: names.pick('allergen', row.id, row.name),
      })),
      // In the Allergen list's order, so the response is stable.
      allergenIds: rows.map((row) => row.id).filter((id) => ownIds.has(id)),
    };
  }

  /** Replaces the Member's own Allergies; they belong to the Member, not their Family. */
  async setAllergies(memberId: string, allergenIds: string[]): Promise<void> {
    const wanted = [...new Set(allergenIds)];
    await this.database.transaction(async (tx) => {
      if (wanted.length > 0) {
        const known = await tx
          .select({ id: allergens.id, archivedAt: allergens.archivedAt })
          .from(allergens)
          .where(inArray(allergens.id, wanted));
        if (known.length !== wanted.length) {
          throw new ApiException(404, 'settings.allergen_not_found');
        }
        // A retired Allergen can be kept but not newly picked.
        const held = new Set(await loadMemberAllergenIds(tx, memberId));
        if (known.some((row) => row.archivedAt && !held.has(row.id))) {
          throw new ApiException(409, 'settings.allergen_retired');
        }
      }
      await tx
        .delete(memberAllergies)
        .where(eq(memberAllergies.userId, memberId));
      if (wanted.length > 0) {
        await tx
          .insert(memberAllergies)
          .values(
            wanted.map((allergenId) => ({ userId: memberId, allergenId })),
          );
      }
    });
  }

  /**
   * The Family tab's Allergies: the Allergen list, the Family Allergies, and the other
   * Members' Allergies (read-only). Everything is scoped to the caller's Family.
   */
  async getFamilyAllergies(
    memberId: string,
    locale: CatalogLocale,
  ): Promise<FamilyAllergiesView> {
    const familyId = await this.familyIdOf(memberId);
    const scope = catalogScope(familyId);
    const [rows, family, others, members] = await Promise.all([
      this.database
        .select()
        .from(allergens)
        .orderBy(asc(allergens.sortOrder), asc(allergens.name)),
      loadFamilyAllergies(this.database, familyId),
      loadOtherMemberAllergies(this.database, familyId, memberId),
      this.database
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(and(eq(user.familyId, familyId), ne(user.id, memberId)))
        .orderBy(asc(user.name), asc(user.id)),
    ]);
    const names = await loadDisplayNames(
      this.database,
      scope,
      locale,
      rows.map((row) => row.id),
    );
    const allergen = (id: string) => ({
      id,
      name: names.pick(
        'allergen',
        id,
        rows.find((r) => r.id === id)?.name ?? '',
      ),
    });
    const order = new Map(rows.map((row, index) => [row.id, index]));
    const byOrder = (a: string, b: string) =>
      (order.get(a) ?? 0) - (order.get(b) ?? 0);
    return {
      // A retired Allergen leaves the picker: a new Family Allergy cannot use it, and
      // existing ones already carry their name.
      allergens: rows
        .filter((row) => !row.archivedAt)
        .map((row) => allergen(row.id)),
      familyAllergies: family.map((row) => ({
        id: row.id,
        allergen: allergen(row.allergenId),
        label: row.label,
      })),
      members: members.map((member) => ({
        ...member,
        allergens: others
          .filter((row) => row.memberId === member.id)
          .map((row) => row.allergenId)
          .sort(byOrder)
          .map(allergen),
      })),
    };
  }

  /** Any Member adds a Family Allergy; the same Allergen and label twice is rejected. */
  async addFamilyAllergy(
    memberId: string,
    allergenId: string,
    label: string | null | undefined,
    locale: CatalogLocale,
  ): Promise<FamilyAllergyView> {
    const familyId = await this.familyIdOf(memberId);
    const [known] = await this.database
      .select({
        id: allergens.id,
        name: allergens.name,
        archivedAt: allergens.archivedAt,
      })
      .from(allergens)
      .where(eq(allergens.id, allergenId))
      .limit(1);
    if (!known) throw new ApiException(404, 'settings.allergen_not_found');
    if (known.archivedAt) {
      throw new ApiException(409, 'settings.allergen_retired');
    }
    const [created] = await this.database
      .insert(familyAllergies)
      .values({ familyId, allergenId, label: label?.trim() || null })
      .onConflictDoNothing()
      .returning();
    if (!created) throw new ApiException(409, 'settings.family_allergy_exists');
    const names = await loadDisplayNames(
      this.database,
      catalogScope(familyId),
      locale,
      [allergenId],
    );
    return {
      id: created.id,
      allergen: {
        id: allergenId,
        name: names.pick('allergen', allergenId, known.name),
      },
      label: created.label,
    };
  }

  /** Any Member removes a Family Allergy of their own Family; another Family's is not found. */
  async removeFamilyAllergy(memberId: string, id: string): Promise<void> {
    const familyId = await this.familyIdOf(memberId);
    const removed = await this.database
      .delete(familyAllergies)
      .where(
        and(eq(familyAllergies.id, id), eq(familyAllergies.familyId, familyId)),
      )
      .returning({ id: familyAllergies.id });
    if (removed.length === 0) {
      throw new ApiException(404, 'settings.family_allergy_not_found');
    }
  }

  private async categoryType(
    categoryId: string,
  ): Promise<'parent_category' | 'leaf_category'> {
    const [leaf] = await this.database
      .select({ id: leafCategories.id })
      .from(leafCategories)
      .where(eq(leafCategories.id, categoryId))
      .limit(1);
    if (leaf) return 'leaf_category';
    const [parent] = await this.database
      .select({ id: parentCategories.id })
      .from(parentCategories)
      .where(eq(parentCategories.id, categoryId))
      .limit(1);
    if (parent) return 'parent_category';
    throw new ApiException(404, 'settings.category_not_found');
  }

  private async canonicalNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const [leaves, parents] = await Promise.all([
      this.database
        .select({ id: leafCategories.id, name: leafCategories.name })
        .from(leafCategories)
        .where(inArray(leafCategories.id, ids)),
      this.database
        .select({ id: parentCategories.id, name: parentCategories.name })
        .from(parentCategories)
        .where(inArray(parentCategories.id, ids)),
    ]);
    return new Map([...leaves, ...parents].map((c) => [c.id, c.name]));
  }
}
