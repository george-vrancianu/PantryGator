import { fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderInAppLayout,
  renderWithProviders,
  stubApi,
} from '../test/render';
import { DashboardPage } from './Dashboard/DashboardPage';
import { FamilyPage } from './Family/FamilyPage';
import { NewMealPlanPage } from './MealPlans/MealPlanFormPage';
import { PantryPage } from './Pantry/PantryPage';
import { ExplorePage } from './Recipes/ExplorePage';
import { RecipesPage } from './Recipes/RecipesPage';
import { SettingsPage } from './Settings/SettingsPage';
import { ShoppingPage } from './Shopping/ShoppingPage';

afterEach(() => vi.unstubAllGlobals());

const stub = (extra = {}) =>
  vi.stubGlobal('fetch', stubApi({ ...extra }).fetchMock);

/** The top bar's controls, by visible text or accessible name. */
const topBar = () =>
  within(
    document.querySelector<HTMLElement>(
      '[data-region="top-bar"]',
    ) as HTMLElement,
  );
const names = (els: HTMLElement[]) =>
  els.map((el) => el.textContent || el.getAttribute('aria-label'));

describe('Top-bar actions (ADR 0042)', () => {
  it('Shopping: Import, then the Add items key', () => {
    stub();
    renderInAppLayout(<ShoppingPage />, '/shopping');
    expect(names([...topBar().getAllByRole('button')])).toEqual([
      'Import',
      'Add items',
    ]);
  });

  it('Pantry: the Add key only, with no secondary action and no Match items', () => {
    stub();
    renderInAppLayout(<PantryPage />, '/pantry');
    expect(names(topBar().getAllByRole('button'))).toEqual(['Add batch']);
    expect(topBar().queryByRole('link')).toBeNull();
    expect(topBar().queryByText(/match items/i)).toBeNull();
  });

  it('Recipes: Explore, then the Add a Recipe key', () => {
    stub();
    renderInAppLayout(<RecipesPage />, '/recipes');
    expect(topBar().getByRole('link', { name: 'Explore' })).toHaveAttribute(
      'href',
      '/recipes/explore',
    );
    expect(topBar().getByRole('button', { name: 'Add a Recipe' })).toBeTruthy();
  });

  it('Explore: Back and no other action', () => {
    stub();
    renderInAppLayout(<ExplorePage />, '/recipes/explore');
    expect(topBar().getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/recipes',
    );
    expect(topBar().queryAllByRole('button')).toHaveLength(0);
  });

  it('Settings and Family: icon-only Back named "Back"', () => {
    stub();
    const { unmount } = renderInAppLayout(<SettingsPage />, '/settings');
    const back = topBar().getByRole('link', { name: 'Back' });
    expect(back.textContent).toBe('');
    expect(back).toHaveAttribute('href', '/');
    unmount();
    renderInAppLayout(<FamilyPage />, '/family');
    expect(topBar().getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('New meal plan: Back and a labelled Create plan key', () => {
    stub();
    renderInAppLayout(<NewMealPlanPage />, '/meal-plans/new');
    expect(topBar().getByRole('link', { name: 'Back' })).toBeTruthy();
    expect(topBar().getByRole('button', { name: 'Create plan' })).toBeTruthy();
  });

  it('no top bar renders a logo or a Refresh button', () => {
    stub();
    renderInAppLayout(<PantryPage />, '/pantry');
    expect(topBar().queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });
});

describe('Customise dashboard link', () => {
  it('sits under the Widgets and opens the Customise page', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/dashboard-layout': () =>
          Response.json({
            widgets: [{ id: 'a', type: 'budget', size: 'small' }],
          }),
      }).fetchMock,
    );
    renderWithProviders(
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customise" element={<p>Customise page</p>} />
      </Routes>,
      { route: '/' },
    );
    fireEvent.click(
      await screen.findByRole('link', { name: 'Customise dashboard' }),
    );
    expect(await screen.findByText('Customise page')).toBeTruthy();
  });
});
