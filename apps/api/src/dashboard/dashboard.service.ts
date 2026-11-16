import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.types';
import { dashboardLayouts } from '../database/schema';
import {
  widgetInstance,
  type DashboardLayoutBody,
  type WidgetInstance,
} from './dashboard.schemas';

/**
 * Pantry Stock, Shopping, Meal plan, Use soon (Pantry Health lives in the header, not a Widget). Saved layouts are never migrated.
 * Fixed ids keep the default layout identical across fetches until the Member first saves.
 */
const DEFAULT_LAYOUT: WidgetInstance[] = [
  { id: 'default-pantry-stock', type: 'pantry-stock', size: 'small' },
  { id: 'default-shopping', type: 'shopping', size: 'small' },
  { id: 'default-meal-plan', type: 'meal-plan', size: 'wide' },
  { id: 'default-use-soon', type: 'use-soon', size: 'wide' },
];

@Injectable()
export class DashboardService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /** The Member's saved layout, or the default one until they first save. Widgets that no longer validate, such as a retired type, are dropped. */
  async get(memberId: string): Promise<DashboardLayoutBody> {
    const [row] = await this.database
      .select({ widgets: dashboardLayouts.widgets })
      .from(dashboardLayouts)
      .where(eq(dashboardLayouts.userId, memberId));
    if (row)
      return {
        widgets: (row.widgets as unknown[]).filter(
          (widget): widget is WidgetInstance =>
            widgetInstance.safeParse(widget).success,
        ),
      };
    return { widgets: DEFAULT_LAYOUT };
  }

  async replace(
    memberId: string,
    layout: DashboardLayoutBody,
  ): Promise<DashboardLayoutBody> {
    await this.database
      .insert(dashboardLayouts)
      .values({ userId: memberId, widgets: layout.widgets })
      .onConflictDoUpdate({
        target: dashboardLayouts.userId,
        set: { widgets: layout.widgets, updatedAt: new Date() },
      });
    return layout;
  }
}
