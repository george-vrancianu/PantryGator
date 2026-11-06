import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Capacitor } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unmatchedQueueQueryKey } from '../../lib/unmatched';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubSystemScheme } from '../../test/viewport';
import { SettingsPage } from './SettingsPage';

type Member = { role: 'admin' | 'member'; name?: string; email?: string };

function stubYou(
  member: Member = { role: 'member' },
  saveLocale: { ok: boolean } = { ok: true },
) {
  let calls: ReturnType<typeof stubApi>['calls'];
  let catalogLanguage: string | null = null;
  const api = stubApi({
    'GET /api/auth/get-session': () =>
      Response.json({
        user: {
          id: 'u1',
          name: member.name ?? 'Ana Pop',
          email: member.email ?? 'ana@example.com',
          role: member.role,
        },
      }),
    // Like the API with nothing stored: English everywhere.
    'GET /api/settings/preferences': () =>
      Response.json({
        locale: null,
        catalogLanguage: null,
        effectiveCatalogLanguage: 'en',
        scanLanguage: null,
        effectiveScanLanguage: 'en',
        spokenLanguage: null,
        effectiveSpokenLanguage: 'en',
        theme: null,
      }),
    // Allergen names come back in the saved Catalog Language, like the API.
    'GET /api/settings/allergies': () =>
      Response.json({
        allergens: [
          { id: 'a-milk', name: catalogLanguage === 'ro' ? 'Lapte' : 'Milk' },
        ],
        allergenIds: [],
      }),
    'PUT /api/settings/preferences': () => {
      const body = calls.at(-1)?.body as Record<string, unknown>;
      if ('catalogLanguage' in body) {
        catalogLanguage = body.catalogLanguage as string | null;
      }
      const uiLanguage = 'en';
      return saveLocale.ok
        ? Response.json(
            'locale' in body
              ? {
                  locale: 'ro',
                  catalogLanguage: null,
                  effectiveCatalogLanguage: 'ro',
                  scanLanguage: null,
                  effectiveScanLanguage: 'ro',
                  spokenLanguage: null,
                  effectiveSpokenLanguage: 'ro',
                  theme: null,
                }
              : {
                  locale: null,
                  catalogLanguage: body.catalogLanguage ?? null,
                  effectiveCatalogLanguage: body.catalogLanguage ?? uiLanguage,
                  scanLanguage: body.scanLanguage ?? null,
                  effectiveScanLanguage: body.scanLanguage ?? uiLanguage,
                  spokenLanguage: body.spokenLanguage ?? null,
                  effectiveSpokenLanguage: body.spokenLanguage ?? uiLanguage,
                  theme: null,
                },
          )
        : Response.json({ code: 'server_error', params: {} }, { status: 500 });
    },
    'GET /api/admin/unmatched': () =>
      Response.json({ entries: [], nextCursor: null }),
  });
  calls = api.calls;
  vi.stubGlobal('fetch', api.fetchMock);
  return calls;
}

describe('Settings You tab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-theme');
  });

  describe('Siri section by platform', () => {
    it.each([
      ['the web', false, 'web', true],
      ['the iOS app', true, 'ios', true],
      ['the Android app', true, 'android', false],
    ])('on %s', async (_name, native, platform, shown) => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(native);
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(platform);
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      await screen.findByRole('group', { name: 'Language' });
      const siri = screen.queryByRole('heading', { name: 'Siri' });
      if (shown) expect(siri).toBeInTheDocument();
      else expect(siri).not.toBeInTheDocument();
    });
  });

  describe('Language', () => {
    it('shows each language in its own name', async () => {
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', { name: 'Language' });
      expect(
        within(control).getByRole('button', { name: 'English' }),
      ).toBeInTheDocument();
      expect(
        within(control).getByRole('button', { name: 'Română' }),
      ).toBeInTheDocument();
      expect(
        within(control).getByRole('button', { name: 'Dansk' }),
      ).toBeInTheDocument();
    });

    it('marks each language name with its own language', async () => {
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', { name: 'Language' });
      expect(
        within(control).getByRole('button', { name: 'Română' }),
      ).toHaveAttribute('lang', 'ro');
      expect(
        within(control).getByRole('button', { name: 'Dansk' }),
      ).toHaveAttribute('lang', 'da');
    });

    it('saves at once and shows "Language saved" in the new language', async () => {
      stubSystemScheme(false);
      const calls = stubYou();
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
      expect(
        await screen.findByText('Limba a fost salvată'),
      ).toBeInTheDocument();
    });

    it('shows an error under the control when the language save fails', async () => {
      stubSystemScheme(false);
      stubYou({ role: 'member' }, { ok: false });
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      await userEvent.click(
        await screen.findByRole('button', { name: 'Dansk' }),
      );

      expect(
        await screen.findByText('Dit sprog kunne ikke gemmes. Prøv igen.'),
      ).toBeInTheDocument();
    });
  });

  it('shows each language Preference caption above its picker, naming it', async () => {
    stubSystemScheme(false);
    stubYou();
    renderWithProviders(<SettingsPage />, { route: '/settings' });

    for (const name of [
      'Catalog Language',
      'Scan Language',
      'Spoken Language',
    ]) {
      const control = await screen.findByRole('group', { name });
      const caption = screen.getByText(name);
      expect(caption).toBeVisible();
      expect(control).toHaveAttribute('aria-labelledby', caption.id);
      expect(
        caption.compareDocumentPosition(control) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  describe('Catalog Language', () => {
    it('offers "Same as UI Language" first, selected until one is chosen', async () => {
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Catalog Language',
      });
      const buttons = within(control).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual([
        'Same as UI Language',
        'English',
        'Română',
        'Dansk',
      ]);
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(/Shown in English/)).toBeInTheDocument();
    });

    it('updates the hint when the UI Language is switched', async () => {
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      expect(await screen.findByText(/Shown in English/)).toBeInTheDocument();
      const language = screen.getByRole('group', { name: 'Language' });
      await userEvent.click(
        within(language).getByRole('button', { name: 'Română' }),
      );

      expect(await screen.findByText(/Afișate în Română/)).toBeInTheDocument();
    });

    it('saves a chosen language and shows it as the effective one', async () => {
      stubSystemScheme(false);
      const calls = stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Catalog Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Română' }),
      );

      await vi.waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({
            key: 'PUT /api/settings/preferences',
            body: { catalogLanguage: 'ro' },
          }),
        ),
      );
      expect(await screen.findByText(/Shown in Română/)).toBeInTheDocument();
      expect(
        within(control).getByRole('button', { name: 'Română' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Catalog Language saved')).toBeInTheDocument();
    });

    it('refetches the Allergen names in the new Catalog Language after a save', async () => {
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      expect(await screen.findByText('Milk')).toBeInTheDocument();
      const control = await screen.findByRole('group', {
        name: 'Catalog Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Română' }),
      );

      expect(await screen.findByText('Lapte')).toBeInTheDocument();
      expect(screen.queryByText('Milk')).toBeNull();
    });

    it('goes back to "Same as UI Language" by saving an empty language', async () => {
      stubSystemScheme(false);
      const calls = stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Catalog Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Dansk' }),
      );
      await userEvent.click(
        within(control).getByRole('button', { name: 'Same as UI Language' }),
      );

      await vi.waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({ body: { catalogLanguage: null } }),
        ),
      );
    });

    it('shows an error when the save fails', async () => {
      stubSystemScheme(false);
      stubYou({ role: 'member' }, { ok: false });
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Catalog Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Dansk' }),
      );

      expect(
        await screen.findByText(
          'Could not save your Catalog Language. Try again.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Scan Language', () => {
    it('offers "Same as UI Language" first, selected until one is chosen', async () => {
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Scan Language',
      });
      const buttons = within(control).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual([
        'Same as UI Language',
        'English',
        'Română',
        'Dansk',
      ]);
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(/Reading in English/)).toBeInTheDocument();
    });

    it('updates the hint when the UI Language is switched', async () => {
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      expect(await screen.findByText(/Reading in English/)).toBeInTheDocument();
      const language = screen.getByRole('group', { name: 'Language' });
      await userEvent.click(
        within(language).getByRole('button', { name: 'Română' }),
      );

      expect(
        await screen.findByText(/Se citește în Română/),
      ).toBeInTheDocument();
    });

    it('saves a chosen language and shows it as the effective one', async () => {
      stubSystemScheme(false);
      const calls = stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Scan Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Română' }),
      );

      await vi.waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({
            key: 'PUT /api/settings/preferences',
            body: { scanLanguage: 'ro' },
          }),
        ),
      );
      expect(await screen.findByText(/Reading in Română/)).toBeInTheDocument();
      expect(
        within(control).getByRole('button', { name: 'Română' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Scan Language saved')).toBeInTheDocument();
    });

    it('goes back to "Same as UI Language" by saving an empty language', async () => {
      stubSystemScheme(false);
      const calls = stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Scan Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Dansk' }),
      );
      await userEvent.click(
        within(control).getByRole('button', { name: 'Same as UI Language' }),
      );

      await vi.waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({ body: { scanLanguage: null } }),
        ),
      );
    });

    it('shows an error when the save fails', async () => {
      stubSystemScheme(false);
      stubYou({ role: 'member' }, { ok: false });
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Scan Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Dansk' }),
      );

      expect(
        await screen.findByText(
          'Could not save your Scan Language. Try again.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Spoken Language', () => {
    it('comes after the Scan Language, with "Same as UI Language" first and selected', async () => {
      stubSystemScheme(false);
      stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Spoken Language',
      });
      const scan = screen.getByRole('group', { name: 'Scan Language' });
      expect(
        scan.compareDocumentPosition(control) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const buttons = within(control).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual([
        'Same as UI Language',
        'English',
        'Română',
        'Dansk',
      ]);
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(/Listening in English/)).toBeInTheDocument();
    });

    it('saves a chosen language, shows it as the effective one and leaves the Scan Language alone', async () => {
      stubSystemScheme(false);
      const calls = stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Spoken Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Română' }),
      );

      await vi.waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({
            key: 'PUT /api/settings/preferences',
            body: { spokenLanguage: 'ro' },
          }),
        ),
      );
      expect(
        await screen.findByText(/Listening in Română/),
      ).toBeInTheDocument();
      expect(
        within(control).getByRole('button', { name: 'Română' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Spoken Language saved')).toBeInTheDocument();
      expect(screen.getByText(/Reading in English/)).toBeInTheDocument();
    });

    it('goes back to "Same as UI Language" by saving an empty language', async () => {
      stubSystemScheme(false);
      const calls = stubYou();
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Spoken Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Dansk' }),
      );
      await userEvent.click(
        within(control).getByRole('button', { name: 'Same as UI Language' }),
      );

      await vi.waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({ body: { spokenLanguage: null } }),
        ),
      );
    });

    it('shows an error when the save fails', async () => {
      stubSystemScheme(false);
      stubYou({ role: 'member' }, { ok: false });
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const control = await screen.findByRole('group', {
        name: 'Spoken Language',
      });
      await userEvent.click(
        within(control).getByRole('button', { name: 'Dansk' }),
      );

      expect(
        await screen.findByText(
          'Could not save your Spoken Language. Try again.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Catalog', () => {
    it('is absent for a member', async () => {
      stubSystemScheme(false);
      stubYou({ role: 'member' });
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      await screen.findByRole('heading', { name: 'Account' });
      expect(screen.queryByRole('region', { name: 'Catalog' })).toBeNull();
    });

    it('links to the admin catalog page and shows the Admins scope', async () => {
      stubSystemScheme(false);
      stubYou({ role: 'admin' });
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const region = await screen.findByRole('region', { name: 'Catalog' });
      expect(
        within(region).getByRole('link', { name: /curate the catalog/i }),
      ).toHaveAttribute('href', '/admin');
      expect(within(region).getByText('Admins')).toBeInTheDocument();
    });

    it('shows no unmatched count when the queue has not loaded, and makes no request for it', async () => {
      stubSystemScheme(false);
      const calls = stubYou({ role: 'admin' });
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const region = await screen.findByRole('region', { name: 'Catalog' });
      expect(within(region).queryByText(/unmatched/)).toBeNull();
      expect(calls.map((c) => c.key)).not.toContain('GET /api/admin/unmatched');
    });

    it('shows the unmatched count when the open queue is already loaded', async () => {
      stubSystemScheme(false);
      stubYou({ role: 'admin' });
      const { queryClient } = renderWithProviders(<SettingsPage />, {
        route: '/settings',
      });
      queryClient.setQueryData(unmatchedQueueQueryKey('open'), {
        pages: [
          {
            entries: [{ normalizedName: 'a' }, { normalizedName: 'b' }],
            nextCursor: null,
          },
        ],
        pageParams: [undefined],
      });

      const region = await screen.findByRole('region', { name: 'Catalog' });
      expect(
        await within(region).findByText('2 unmatched names waiting'),
      ).toBeInTheDocument();
    });
  });

  describe('Account', () => {
    it('shows the avatar initials, name and email', async () => {
      stubSystemScheme(false);
      stubYou({ role: 'member', name: 'Ana Pop', email: 'ana@example.com' });
      renderWithProviders(<SettingsPage />, { route: '/settings' });

      const region = await screen.findByRole('region', { name: 'Account' });
      expect(await within(region).findByText('AP')).toBeInTheDocument();
      expect(within(region).getByText('Ana Pop')).toBeInTheDocument();
      expect(within(region).getByText('ana@example.com')).toBeInTheDocument();
    });
  });
});
