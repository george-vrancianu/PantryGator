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
import type { WidgetSize, WidgetType } from '../../../lib/dashboard';
import { BudgetWidget, NutritionWidget } from './PlaceholderWidgets';
import { MealPlanWidget } from './MealPlanWidget';
import { PantryStockWidget } from './PantryStockWidget';
import { CookTonightWidget } from './CookTonightWidget';
import { ShoppingWidget } from './ShoppingWidget';
import type { WidgetProps } from './types';
import { SuggestionsWidget } from './SuggestionsWidget';
import { UseSoonWidget } from './UseSoonWidget';

export type WidgetDefinition = {
  component: ComponentType<WidgetProps>;
  /** Translation key (`dashboard` namespace) of the Widget's name, for the customise screen. */
  nameKey: string;
  /** The Widget's icon, shown beside its name on the customise screen. */
  icon: ComponentType<{ size?: number }>;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
};

/**
 * Every Widget type and its component. Widgets are independent: each fetches
 * its own data, so adding one is a new component and one entry here.
 */
export const WIDGET_REGISTRY: Record<WidgetType, WidgetDefinition> = {
  'use-soon': {
    component: UseSoonWidget,
    nameKey: 'widgets.useSoon.title',
    icon: ClockIcon,
    sizes: ['small', 'wide', 'tall'],
    defaultSize: 'wide',
  },
  shopping: {
    component: ShoppingWidget,
    nameKey: 'widgets.shopping.title',
    icon: ShoppingIcon,
    sizes: ['small', 'wide'],
    defaultSize: 'small',
  },
  'pantry-stock': {
    component: PantryStockWidget,
    nameKey: 'widgets.pantryStock.title',
    icon: PantryIcon,
    sizes: ['small', 'wide'],
    defaultSize: 'small',
  },
  suggestions: {
    component: SuggestionsWidget,
    nameKey: 'widgets.suggestions.title',
    icon: ShoppingIcon,
    sizes: ['small', 'wide'],
    defaultSize: 'small',
  },
  'cook-tonight': {
    component: CookTonightWidget,
    nameKey: 'widgets.cookTonight.title',
    icon: RecipesIcon,
    sizes: ['small', 'wide', 'tall'],
    defaultSize: 'wide',
  },
  'meal-plan': {
    component: MealPlanWidget,
    nameKey: 'widgets.mealPlan.title',
    icon: CalendarIcon,
    sizes: ['wide'],
    defaultSize: 'wide',
  },
  budget: {
    component: BudgetWidget,
    nameKey: 'widgets.budget.title',
    icon: BudgetIcon,
    sizes: ['small', 'wide'],
    defaultSize: 'small',
  },
  nutrition: {
    component: NutritionWidget,
    nameKey: 'widgets.nutrition.title',
    icon: NutritionIcon,
    sizes: ['small', 'wide'],
    defaultSize: 'small',
  },
};
