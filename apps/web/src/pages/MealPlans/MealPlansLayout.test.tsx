import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderInAppLayout, stubApi } from '../../test/render';
import { MealPlansPage } from './MealPlansPage';
import { NewMealPlanPage } from './MealPlanFormPage';

/** The remaining pages draw their header through `Screen`: the top bar region, not the scrolling sheet. */
describe('Meal Plans pages in the layout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the title in the top bar', async () => {
    const { fetchMock } = stubApi({
      'GET /api/meal-plans': () => Response.json([]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderInAppLayout(<MealPlansPage />, '/meal-plans');
    const topBar = document.querySelector<HTMLElement>(
      '[data-region="top-bar"]',
    )!;
    expect(
      await within(topBar).findByRole('heading', { name: 'Meal plans' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('sheet-content')).queryByRole('heading', {
        level: 1,
      }),
    ).toBeNull();
  });

  it('puts Back in the top bar of the new plan form', async () => {
    const { fetchMock } = stubApi({});
    vi.stubGlobal('fetch', fetchMock);
    renderInAppLayout(<NewMealPlanPage />, '/meal-plans/new');
    const topBar = document.querySelector<HTMLElement>(
      '[data-region="top-bar"]',
    )!;
    expect(
      await within(topBar).findByRole('link', { name: /meal plans/i }),
    ).toHaveAttribute('href', '/meal-plans');
  });
});
