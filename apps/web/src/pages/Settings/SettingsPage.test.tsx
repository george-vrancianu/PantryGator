import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApplyMemberLocale } from '../../components/ApplyMemberLocale';
import { ApplyMemberTheme } from '../../components/ApplyMemberTheme';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubSystemScheme } from '../../test/viewport';
import { SettingsPage } from './SettingsPage';

function stubSettings(savedLocale: string | null = null, role = 'member') {
  let saved: { locale: string | null; theme: string | null } = {
    locale: savedLocale,
    theme: null,
  };
  const { fetchMock, calls } = stubApi({
    'GET /api/catalog/family': () =>
      Response.json({ ingredients: [], synonyms: [] }),
    'GET /api/settings/preferences': () => Response.json(saved),
    // A save answers with the merged preferences, as the API does.
    'PUT /api/settings/preferences': () => {
      saved = { ...saved, ...(calls.at(-1)?.body as object) };
      return Response.json(saved);
    },
    'POST /api/auth/sign-out': () => Response.json({ success: true }),
    'GET /api/auth/get-session': () =>
      Response.json(
        role === 'admin'
          ? { user: { id: '1', name: 'Ana', email: 'a@b.c', role } }
          : null,
      ),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** Shows where the router is, and lets a test go back a history entry. */
function Harness() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/settings')}>Open settings</button>
      <button onClick={() => navigate(-1)}>Go back</button>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sign-in" element={<p>Sign in page</p>} />
      </Routes>
    </>
  );
}

const storeAppearance = (appearance: { theme: string; matchSystem: boolean }) =>
  localStorage.setItem('pp.appearance', JSON.stringify(appearance));

const themeTiles = async () =>
  within(await screen.findByRole('group', { name: 'Appearance' }));

describe('SettingsPage', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens on the You tab with Appearance first', async () => {
    stubSettings();
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    expect(await screen.findByRole('tab', { name: 'You' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Family' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    const panel = screen.getByRole('tabpanel', { name: 'You' });
    expect(
      within(panel).getByRole('heading', { name: 'Appearance' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Everyone in the family shares these. Any member can change them.',
      ),
    ).toBeNull();
  });

  it('opens on the Family tab for ?tab=family', async () => {
    stubSettings();
    renderWithProviders(<SettingsPage />, { route: '/settings?tab=family' });

    expect(await screen.findByRole('tab', { name: 'Family' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const panel = screen.getByRole('tabpanel', { name: 'Family' });
    expect(
      within(panel).getByText(
        'Everyone in the family shares these. Any member can change them.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Appearance' })).toBeNull();
  });

  it('shows the Family catalog section on the Family tab', async () => {
    stubSettings();
    renderWithProviders(<SettingsPage />, { route: '/settings?tab=family' });

    const panel = await screen.findByRole('tabpanel', { name: 'Family' });
    expect(
      await within(panel).findByRole('heading', { name: 'Family catalog' }),
    ).toBeInTheDocument();
    expect(
      await within(panel).findByText(/Nothing added yet/),
    ).toBeInTheDocument();
  });

  it('exposes the tabs as a named tablist with tab and tabpanel roles', async () => {
    stubSettings();
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    const tablist = await screen.findByRole('tablist', {
      name: 'Settings sections',
    });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['You', 'Family']);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('moves between tabs with the arrow keys', async () => {
    stubSettings();
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    const you = await screen.findByRole('tab', { name: 'You' });
    you.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Family' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Family' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'You' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('replaces the history entry when switching tabs, so Back still leaves Settings', async () => {
    stubSettings();
    const user = userEvent.setup();
    renderWithProviders(<Harness />, { route: '/' });

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(await screen.findByRole('tab', { name: 'Family' }));
    expect(screen.getByTestId('location').textContent).toBe(
      '/settings?tab=family',
    );

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('keeps each tab at its own scroll position while the page is mounted', async () => {
    stubSettings();
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      writable: true,
      value: 240,
    });
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    await user.click(await screen.findByRole('tab', { name: 'Family' }));
    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 0 }),
    );

    window.scrollY = 90;
    await user.click(screen.getByRole('tab', { name: 'You' }));
    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 240 }),
    );

    await user.click(screen.getByRole('tab', { name: 'Family' }));
    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 90 }),
    );
  });

  it('applies a chosen Theme at once, stores it on the device and saves it on the Member', async () => {
    stubSystemScheme(false);
    storeAppearance({ theme: 'light', matchSystem: false });
    const calls = stubSettings('en');
    renderWithProviders(
      <>
        <ApplyMemberTheme />
        <SettingsPage />
      </>,
      { route: '/settings' },
    );

    await userEvent.click(
      (await themeTiles()).getByRole('button', { name: 'Dark' }),
    );

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('pp.appearance') ?? 'null')).toEqual(
      { theme: 'dark', matchSystem: false },
    );
    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          key: 'PUT /api/settings/preferences',
          body: { theme: 'dark' },
        }),
      ),
    );
    expect(
      (await themeTiles()).getByRole('button', { name: 'Dark' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns Match system off when a Theme tile is picked with it on', async () => {
    stubSystemScheme(false);
    storeAppearance({ theme: 'light', matchSystem: true });
    const calls = stubSettings();
    renderWithProviders(
      <>
        <ApplyMemberTheme />
        <SettingsPage />
      </>,
      { route: '/settings' },
    );
    expect(
      await screen.findByRole('switch', { name: 'Match system' }),
    ).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(
      (await themeTiles()).getByRole('button', { name: 'Dark' }),
    );

    expect(
      screen.getByRole('switch', { name: 'Match system' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          key: 'PUT /api/settings/preferences',
          body: { theme: 'dark' },
        }),
      ),
    );
  });

  it('asks for an inline confirm before signing out, with Cancel', async () => {
    const calls = stubSettings();
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    );
    expect(screen.getByText('Sign out of this phone?')).toBeInTheDocument();
    expect(calls.map((c) => c.key)).not.toContain('POST /api/auth/sign-out');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Sign out of this phone?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus();
    expect(calls.map((c) => c.key)).not.toContain('POST /api/auth/sign-out');
  });

  it('signs out on confirm and replaces history to the sign-in page', async () => {
    const calls = stubSettings();
    const user = userEvent.setup();
    renderWithProviders(<Harness />, { route: '/' });
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await vi.waitFor(() =>
      expect(calls.map((c) => c.key)).toContain('POST /api/auth/sign-out'),
    );
    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/sign-in');

    // Replaced, not pushed: Back does not return to Settings.
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('saves the Member locale when the language is switched', async () => {
    const calls = stubSettings();
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Română' }),
    );
    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          key: 'PUT /api/settings/preferences',
          body: { locale: 'ro' },
        }),
      ),
    );
  });

  it('shows the tabs in Danish once Dansk is chosen', async () => {
    const calls = stubSettings();
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    await userEvent.click(await screen.findByRole('button', { name: 'Dansk' }));
    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          key: 'PUT /api/settings/preferences',
          body: { locale: 'da' },
        }),
      ),
    );
    expect(
      await screen.findByRole('tab', { name: 'Familie' }),
    ).toBeInTheDocument();
  });

  it('shows the tabs in Romanian', async () => {
    stubSettings();
    renderWithProviders(<SettingsPage />, {
      route: '/settings?tab=family',
      locale: 'ro',
    });

    expect(await screen.findByRole('tab', { name: 'Familie' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText(
        'Toți din familie împart aceste setări. Orice membru le poate schimba.',
      ),
    ).toBeInTheDocument();
  });

  it('applies the locale saved on the Member when the app loads', async () => {
    stubSettings('ro');
    renderWithProviders(
      <>
        <ApplyMemberLocale />
        <SettingsPage />
      </>,
      { route: '/settings?tab=family' },
    );
    expect(
      await screen.findByRole('tab', { name: 'Familie' }),
    ).toBeInTheDocument();
  });

  it('labels the Admin block as a Catalog region with a heading for Admins', async () => {
    stubSettings(null, 'admin');
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    const heading = await screen.findByRole('heading', { name: 'Catalog' });
    const region = screen.getByRole('region', { name: 'Catalog' });
    expect(region).toContainElement(heading);
    expect(region).toContainElement(
      screen.getByRole('link', { name: /curate the catalog/i }),
    );
  });
});
