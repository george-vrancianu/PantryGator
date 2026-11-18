import {
  BudgetIcon,
  CalendarIcon,
  ClockIcon,
  NutritionIcon,
  PantryIcon,
  RecipesIcon,
  ShoppingIcon,
} from '@pocket-pantry/ui';
import type { ComponentType } from 'react';
import type { WidgetType } from '@/lib/dashboard';

export type WidgetCatalogEntry = {
  /** Translation key (`dashboard` namespace) of the Widget's name, for the customise screen. */
  nameKey: string;
  /** The Widget's icon, shown beside its name on the customise screen. */
  icon: ComponentType<{ size?: number }>;
};

/** Every Widget type's name and icon. Adding a Widget type is one entry here, plus one in `WIDGET_SIZES` (lib/dashboard) and `WIDGET_COMPONENTS` (pages/Dashboard); the type checker flags a missing one. */
export const WIDGET_CATALOG: Record<WidgetType, WidgetCatalogEntry> = {
  'use-soon': { nameKey: 'widgets.useSoon.title', icon: ClockIcon },
  shopping: { nameKey: 'widgets.shopping.title', icon: ShoppingIcon },
  'pantry-stock': { nameKey: 'widgets.pantryStock.title', icon: PantryIcon },
  suggestions: { nameKey: 'widgets.suggestions.title', icon: ShoppingIcon },
  'cook-tonight': { nameKey: 'widgets.cookTonight.title', icon: RecipesIcon },
  'meal-plan': { nameKey: 'widgets.mealPlan.title', icon: CalendarIcon },
  budget: { nameKey: 'widgets.budget.title', icon: BudgetIcon },
  nutrition: { nameKey: 'widgets.nutrition.title', icon: NutritionIcon },
};
