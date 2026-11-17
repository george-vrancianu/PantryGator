import { z } from 'zod';

export const widgetInstance = z.object({
  /** Client-chosen, unique within the layout, so one type can appear twice. */
  id: z.string().trim().min(1).max(64),
  /** Recipe of the Day arrives in wave 2. */
  type: z.enum([
    'use-soon',
    'shopping',
    'pantry-stock',
    'suggestions',
    'cook-tonight',
    'meal-plan',
    'budget',
    'nutrition',
  ]),
  size: z.enum(['small', 'wide', 'tall']),
});
export type WidgetInstance = z.infer<typeof widgetInstance>;

export const dashboardLayoutBody = z.object({
  widgets: z
    .array(widgetInstance)
    .max(30)
    .refine(
      (widgets) => new Set(widgets.map((w) => w.id)).size === widgets.length,
      { message: 'widget ids must be unique' },
    ),
});
export type DashboardLayoutBody = z.infer<typeof dashboardLayoutBody>;
