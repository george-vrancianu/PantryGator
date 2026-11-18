import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { iso, summary, plan, useFixedToday } from '@/test/mealPlans';
import { MealPlansPage } from './MealPlansPage';

describe('Meal plans list', () => {
  beforeEach(useFixedToday);
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists plans with name or dates and whether each is past, current or upcoming', async () => {
    const { fetchMock } = stubApi({
      'GET /api/meal-plans': () =>
        Response.json({
          mealPlans: [
            summary(plan({ id: 'a', startOffset: 5, days: 3 })),
            summary(
              plan({ id: 'b', name: 'Week away', startOffset: -1, days: 4 }),
            ),
            summary(plan({ id: 'c', startOffset: -10, days: 2 })),
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<MealPlansPage />, { route: '/meal-plans' });

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole('link')).toHaveAccessibleName(
      /^20\D+22 Oct/,
    );
    expect(within(items[0]).getByText('Upcoming')).toBeVisible();
    expect(within(items[1]).getByRole('link')).toHaveAccessibleName(
      /Week away/,
    );
    expect(within(items[1]).getByText('Current')).toBeVisible();
    expect(within(items[2]).getByText('Past')).toBeVisible();
    expect(within(items[2]).getByRole('link')).toHaveAttribute(
      'href',
      '/meal-plans/c',
    );
    expect(iso(5)).toBe('2026-10-20');
  });

  it('offers New plan', async () => {
    const { fetchMock } = stubApi({
      'GET /api/meal-plans': () => Response.json({ mealPlans: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<MealPlansPage />, { route: '/meal-plans' });
    expect(await screen.findByText('No Meal plans yet.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'New plan' })).toHaveAttribute(
      'href',
      '/meal-plans/new',
    );
  });
});
