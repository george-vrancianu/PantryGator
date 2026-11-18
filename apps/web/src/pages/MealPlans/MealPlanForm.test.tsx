import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { iso, plan, slot, useFixedToday } from '@/test/mealPlans';
import { EditMealPlanPage, NewMealPlanPage } from './MealPlanFormPage';

const family = {
  id: 'f',
  inviteCode: 'x',
  inviteCodeExpiresAt: '2027-01-01T00:00:00Z',
  members: [
    { id: 'm1', name: 'A', isOwner: true },
    { id: 'm2', name: 'B', isOwner: false },
    { id: 'm3', name: 'C', isOwner: false },
  ],
  currentMemberIsOwner: true,
};

const routes = (
  <Routes>
    <Route path="/meal-plans" element={<p>Plan list</p>} />
    <Route path="/meal-plans/new" element={<NewMealPlanPage />} />
    <Route path="/meal-plans/:id" element={<p>Plan page</p>} />
    <Route path="/meal-plans/:id/edit" element={<EditMealPlanPage />} />
  </Routes>
);

const conflict = (code: string, params: Record<string, unknown>) =>
  Response.json({ code, params }, { status: 409 });

describe('Meal plan form', () => {
  beforeEach(useFixedToday);
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('creates a plan from the name, start date, days and Servings', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/family': () => Response.json(family),
      'POST /api/meal-plans': () =>
        Response.json(plan({ id: 'made' }), { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/new' });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Name/), 'Holiday');
    await user.click(screen.getByRole('button', { name: /^Starts/ }));
    await user.click(
      screen.getByRole('button', { name: /Saturday, October 17/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // 7 days by default; two fewer.
    await user.click(screen.getByRole('button', { name: 'Fewer days' }));
    await user.click(screen.getByRole('button', { name: 'Fewer days' }));
    expect(await screen.findByText('3 Servings')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'More Servings' }));
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(await screen.findByText('Plan page')).toBeVisible();
    expect(calls.find((c) => c.key === 'POST /api/meal-plans')?.body).toEqual({
      name: 'Holiday',
      startDate: iso(2),
      days: 5,
      servings: 4,
    });
  });

  it('only offers start dates from today to 14 days ahead', async () => {
    const { fetchMock } = stubApi({
      'GET /api/family': () => Response.json(family),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/new' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^Starts/ }));
    expect(
      screen.getByRole('button', { name: /Thursday, October 15/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Thursday, October 29/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Friday, October 30/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Wednesday, October 14/ }),
    ).toBeDisabled();
  });

  it('pre-fills the start date from the deep link', async () => {
    const { fetchMock, calls } = stubApi({
      'GET /api/family': () => Response.json(family),
      'POST /api/meal-plans': () =>
        Response.json(plan({ id: 'made' }), { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: `/meal-plans/new?start=${iso(4)}` });
    const user = userEvent.setup();

    expect(
      await screen.findByRole('button', { name: /^Starts.*October 19/ }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create plan' }));
    await screen.findByText('Plan page');
    expect(calls.find((c) => c.key === 'POST /api/meal-plans')?.body).toEqual({
      name: null,
      startDate: iso(4),
      days: 7,
    });
  });

  it('names the other plan when the dates overlap', async () => {
    const { fetchMock } = stubApi({
      'GET /api/family': () => Response.json(family),
      'POST /api/meal-plans': () =>
        conflict('meal_plan.overlap', {
          id: 'p9',
          name: 'Week away',
          startDate: iso(1),
          days: 4,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/new' });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Create plan' }),
    );
    expect(
      await screen.findByText(/These dates overlap Week away \(16\D+19 Oct\)/),
    ).toBeVisible();
  });

  it('does not repeat the dates when the other plan has no name', async () => {
    const { fetchMock } = stubApi({
      'GET /api/family': () => Response.json(family),
      'POST /api/meal-plans': () =>
        conflict('meal_plan.overlap', {
          id: 'p9',
          name: null,
          startDate: iso(1),
          days: 4,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/new' });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Create plan' }),
    );
    expect(
      await screen.findByText(/^These dates overlap 16\D+19 Oct\. Pick/),
    ).toBeVisible();
  });

  it('says the cap is reached', async () => {
    const { fetchMock } = stubApi({
      'GET /api/family': () => Response.json(family),
      'POST /api/meal-plans': () =>
        conflict('meal_plan.cap_reached', { cap: 5 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/new' });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Create plan' }),
    );
    expect(await screen.findByText(/can have 5 Meal plans/)).toBeVisible();
  });

  it('edits only what changed', async () => {
    const existing = plan({ id: 'p1', name: 'Old', days: 3 });
    const { fetchMock, calls } = stubApi({
      'GET /api/family': () => Response.json(family),
      'GET /api/meal-plans/p1': () => Response.json(existing),
      'PATCH /api/meal-plans/p1': () => Response.json(existing),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/p1/edit' });
    const user = userEvent.setup();

    const name = await screen.findByLabelText(/Name/);
    expect(name).toHaveValue('Old');
    await user.clear(name);
    await user.type(name, 'New');
    await user.click(screen.getByRole('button', { name: 'More days' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Plan page')).toBeVisible();
    expect(
      calls.find((c) => c.key === 'PATCH /api/meal-plans/p1')?.body,
    ).toEqual({ name: 'New', days: 4 });
  });

  it('asks before shortening drops days that have Recipes', async () => {
    const existing = plan({
      id: 'p1',
      days: 3,
      slots: [slot(0, 2, 'dinner'), slot(0, 2, 'lunch'), slot(0, 0, 'dinner')],
    });
    const { fetchMock, calls } = stubApi({
      'GET /api/family': () => Response.json(family),
      'GET /api/meal-plans/p1': () => Response.json(existing),
      'PATCH /api/meal-plans/p1': () => Response.json(existing),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/p1/edit' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Fewer days' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'Shortening to 2 days removes 2 planned Recipes. Continue?',
      ),
    ).toBeVisible();
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByText('Plan page');
    expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({
      days: 2,
    });
  });

  it('asks again when the days change after the prompt', async () => {
    const existing = plan({
      id: 'p1',
      days: 3,
      slots: [slot(0, 2, 'dinner'), slot(0, 1, 'lunch')],
    });
    const { fetchMock, calls } = stubApi({
      'GET /api/family': () => Response.json(family),
      'GET /api/meal-plans/p1': () => Response.json(existing),
      'PATCH /api/meal-plans/p1': () => Response.json(existing),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/p1/edit' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Fewer days' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/to 2 days removes 1 planned Recipe\./),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Fewer days' }));
    expect(screen.queryByText(/Shortening to/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/to 1 days removes 2 planned Recipes\./),
    ).toBeVisible();
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false);
  });

  it('shows the start of a plan that has begun as text, not a picker', async () => {
    const existing = plan({ id: 'p1', startOffset: -2, days: 5 });
    const { fetchMock, calls } = stubApi({
      'GET /api/family': () => Response.json(family),
      'GET /api/meal-plans/p1': () => Response.json(existing),
      'PATCH /api/meal-plans/p1': () => Response.json(existing),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/p1/edit' });
    const user = userEvent.setup();

    expect(await screen.findByText('Tuesday 13 October')).toBeVisible();
    expect(screen.getByText(/already begun/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Starts/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'More days' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Plan page');
    expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toEqual({
      days: 6,
    });
  });

  it('does not ask when the dropped days are empty', async () => {
    const existing = plan({ id: 'p1', days: 3, slots: [slot(0, 0, 'dinner')] });
    const { fetchMock } = stubApi({
      'GET /api/family': () => Response.json(family),
      'GET /api/meal-plans/p1': () => Response.json(existing),
      'PATCH /api/meal-plans/p1': () => Response.json(existing),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/p1/edit' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Fewer days' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Plan page')).toBeVisible();
  });

  it('deletes a plan after confirming', async () => {
    const existing = plan({ id: 'p1' });
    const { fetchMock, calls } = stubApi({
      'GET /api/family': () => Response.json(family),
      'GET /api/meal-plans/p1': () => Response.json(existing),
      'DELETE /api/meal-plans/p1': () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(routes, { route: '/meal-plans/p1/edit' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Plan list')).toBeVisible();
    await waitFor(() =>
      expect(calls.some((c) => c.key === 'DELETE /api/meal-plans/p1')).toBe(
        true,
      ),
    );
  });
});
