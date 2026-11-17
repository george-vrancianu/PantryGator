import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { renderWithProviders, stubApi } from './test/render';

const member = () =>
  Response.json({ user: { id: '1', name: 'Ana', email: 'ana@example.com' } });

function stubSession(signedIn: boolean) {
  const { fetchMock } = stubApi({
    'GET /api/auth/get-session': () =>
      signedIn ? member() : new Response('null'),
    'GET /api/settings/preferences': () =>
      Response.json({ introDone: true, theme: null, locale: null }),
    'GET /api/dashboard-layout': () => Response.json({ widgets: [] }),
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('App shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps Members without the Admin role out of /admin', async () => {
    stubSession(true);
    renderWithProviders(<App />, { route: '/admin' });
    expect(
      await screen.findByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).toBeNull();
  });

  it('lets Admins into /admin', async () => {
    const { fetchMock } = stubApi({
      'GET /api/auth/get-session': () =>
        Response.json({
          user: { id: '1', name: 'Ana', email: 'a@x.com', role: 'admin' },
        }),
      'GET /api/settings/preferences': () =>
        Response.json({ introDone: true, theme: null, locale: null }),
      'GET /api/admin/catalog': () =>
        Response.json({
          aisles: [],
          tags: [],
          parentCategories: [],
          leafCategories: [],
          ingredients: [],
          allergens: [],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<App />, { route: '/admin/ingredients' });
    expect(
      await screen.findByRole('button', { name: 'New Ingredient' }),
    ).toBeInTheDocument();
  });

  it('opens Launch for signed-out visitors, whatever route they asked for', async () => {
    stubSession(false);
    renderWithProviders(<App />, { route: '/pantry' });
    expect(
      await screen.findByRole('heading', { name: 'PantryGator' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'I already have an account' }),
    ).toBeInTheDocument();
  });

  it('shows signed-in Members the dashboard with the Dock in the handoff order', async () => {
    stubSession(true);
    renderWithProviders(<App />, { route: '/' });

    const dock = await screen.findByRole('navigation', { name: 'Main' });
    const links = within(dock).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'Shopping',
      '',
      'Pantry',
      'Recipes',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/shopping',
      '/scan',
      '/pantry',
      '/recipes',
    ]);
    expect(within(dock).getByRole('link', { name: 'Camera' })).toHaveAttribute(
      'href',
      '/scan',
    );
    // The link sits under the Widgets, so it shows once the layout has loaded.
    expect(
      await screen.findByRole('link', { name: 'Customise dashboard' }),
    ).toHaveAttribute('href', '/customise');
  });

  it('marks the current section in the Dock', async () => {
    stubSession(true);
    renderWithProviders(<App />, { route: '/pantry' });

    const dock = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(dock).getByRole('link', { name: 'Pantry' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('heading', { name: 'Pantry', level: 1 }),
    ).toBeInTheDocument();
    // The Dock's Home tab is the only way back to the Dashboard (ADR 0027).
    expect(screen.getAllByRole('link', { name: 'Home' })).toHaveLength(1);
    expect(within(dock).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('has no Dock while customising the dashboard', async () => {
    stubSession(true);
    renderWithProviders(<App />, { route: '/customise' });
    expect(
      await screen.findByRole('heading', { name: 'Customise' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Main' }),
    ).not.toBeInTheDocument();
  });

  it.each(['/shopping', '/scan', '/recipes', '/settings', '/family', '/admin'])(
    'renders %s as a screen with a header',
    async (route) => {
      stubSession(true);
      renderWithProviders(<App />, { route });
      expect(
        await screen.findByRole('heading', { level: 1 }),
      ).toBeInTheDocument();
    },
  );

  it('translates the Dock when the locale is Romanian', async () => {
    stubSession(true);
    renderWithProviders(<App />, { route: '/', locale: 'ro' });
    const dock = await screen.findByRole('navigation', { name: 'Principal' });
    expect(
      within(dock).getByRole('link', { name: 'Cămară' }),
    ).toBeInTheDocument();
  });
});
