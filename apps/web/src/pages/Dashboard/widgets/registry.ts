import type { ComponentType } from 'react';
import type { WidgetType } from '@/lib/dashboard';
import { BudgetWidget, NutritionWidget } from './PlaceholderWidgets';
import { MealPlanWidget } from './MealPlanWidget';
import { PantryStockWidget } from './PantryStockWidget';
import { CookTonightWidget } from './CookTonightWidget';
import { ShoppingWidget } from './ShoppingWidget';
import type { WidgetProps } from './types';
import { SuggestionsWidget } from './SuggestionsWidget';
import { UseSoonWidget } from './UseSoonWidget';

/**
 * Every Widget type and its component. Widgets are independent: each fetches
 * its own data, so adding one is a new component and one entry here.
 */
export const WIDGET_COMPONENTS: Record<
  WidgetType,
  ComponentType<WidgetProps>
> = {
  'use-soon': UseSoonWidget,
  shopping: ShoppingWidget,
  'pantry-stock': PantryStockWidget,
  suggestions: SuggestionsWidget,
  'cook-tonight': CookTonightWidget,
  'meal-plan': MealPlanWidget,
  budget: BudgetWidget,
  nutrition: NutritionWidget,
};
