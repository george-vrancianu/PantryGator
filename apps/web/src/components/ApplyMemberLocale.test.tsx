import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeLocale } from '../i18n';
import { useSaveLocale } from '../lib/settings';
import { renderWithProviders, stubApi } from '../test/render';
import { ApplyMemberLocale } from './ApplyMemberLocale';
import { LanguageSwitcher } from '@/components/auth/LanguageSwitcher/LanguageSwitcher';

function stubPreferences(stored: 'en' | 'ro' | 'da' | null) {
  const preferences = {
    locale: stored,
    catalogLanguage: null,
    effectiveCatalogLanguage: stored ?? 'en',
    scanLanguage: null,
    effectiveScanLanguage: stored ?? 'en',
    spokenLanguage: null,
    effectiveSpokenLanguage: stored ?? 'en',
    theme: null,
    hideRecipesWithAllergies: false,
  };
  const { fetchMock, calls } = stubApi({
    'GET /api/settings/preferences': () => Response.json(preferences),
    // Like the API: the saved UI Language is what names come back in.
    'PUT /api/settings/preferences': () => {
      const body = calls.at(-1)?.body as { locale: 'en' | 'ro' | 'da' };
      return Response.json({
        ...preferences,
        ...body,
        effectiveCatalogLanguage: body.locale,
      });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const saves = (calls: ReturnType<typeof stubPreferences>) =>
  calls.filter((call) => call.key === 'PUT /api/settings/preferences');

// The You tab's language picker, saving through the real hook.
function YouTabLanguage() {
  const save = useSaveLocale();
  return <LanguageSwitcher onChange={(locale) => save.mutate(locale)} />;
}

describe('ApplyMemberLocale', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves the UI Language the app shows when none is stored', async () => {
    const calls = stubPreferences(null);
    renderWithProviders(<ApplyMemberLocale />, { locale: 'ro' });

    await waitFor(() => expect(saves(calls)).toHaveLength(1));
    expect(saves(calls)[0]?.body).toEqual({ locale: 'ro' });
  });

  it('refetches the Catalog names the save changed', async () => {
    stubPreferences(null);
    const { queryClient } = renderWithProviders(<ApplyMemberLocale />, {
      locale: 'ro',
    });
    queryClient.setQueryData(['pantry'], { batches: [], runningLow: [] });

    await waitFor(() =>
      expect(queryClient.getQueryState(['pantry'])?.isInvalidated).toBe(true),
    );
  });

  it('saves it once, not on every load', async () => {
    const calls = stubPreferences(null);
    const { queryClient } = renderWithProviders(<ApplyMemberLocale />, {
      locale: 'da',
    });
    await waitFor(() => expect(saves(calls)).toHaveLength(1));

    await queryClient.invalidateQueries({
      queryKey: ['settings', 'preferences'],
    });
    await queryClient.invalidateQueries({
      queryKey: ['settings', 'preferences'],
    });
    expect(saves(calls)).toHaveLength(1);
  });

  it('saves nothing when a UI Language is already stored', async () => {
    const calls = stubPreferences('ro');
    const { queryClient } = renderWithProviders(<ApplyMemberLocale />, {
      locale: 'en',
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData(['settings', 'preferences']),
      ).toBeDefined(),
    );
    await act(async () => {});
    expect(saves(calls)).toHaveLength(0);
  });

  it('does not switch the UI back when the Member picked another language while the save was in flight', async () => {
    const preferences = {
      locale: null,
      catalogLanguage: null,
      effectiveCatalogLanguage: 'en',
      scanLanguage: null,
      effectiveScanLanguage: 'en',
      spokenLanguage: null,
      effectiveSpokenLanguage: 'en',
      theme: null,
      hideRecipesWithAllergies: false,
    };
    let reply!: () => void;
    const gate = new Promise<void>((resolve) => (reply = resolve));
    const { fetchMock, calls } = stubApi({
      'GET /api/settings/preferences': () => Response.json(preferences),
      'PUT /api/settings/preferences': async () => {
        await gate;
        return Response.json({
          ...preferences,
          locale: 'ro',
          effectiveCatalogLanguage: 'ro',
        });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient, i18n } = renderWithProviders(<ApplyMemberLocale />, {
      locale: 'ro',
    });
    await waitFor(() => expect(saves(calls)).toHaveLength(1));

    // The Member picks Danish on the You tab; that save lands first.
    queryClient.setQueryData(['settings', 'preferences'], {
      ...preferences,
      locale: 'da',
      effectiveCatalogLanguage: 'da',
    });
    await act(async () => changeLocale(i18n, 'da'));
    reply();

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(i18n.language).toBe('da');
    expect(
      (
        queryClient.getQueryData([
          'settings',
          'preferences',
        ]) as typeof preferences
      ).locale,
    ).toBe('da');
  });

  it('keeps the newly picked UI Language when the sign-in save replies first', async () => {
    const preferences = {
      locale: null,
      catalogLanguage: null,
      effectiveCatalogLanguage: 'en',
      scanLanguage: null,
      effectiveScanLanguage: 'en',
      spokenLanguage: null,
      effectiveSpokenLanguage: 'en',
      theme: null,
      hideRecipesWithAllergies: false,
    };
    const gates = new Map<string, () => void>();
    const { fetchMock, calls } = stubApi({
      'GET /api/settings/preferences': () => Response.json(preferences),
      'PUT /api/settings/preferences': async () => {
        const body = calls.at(-1)?.body as { locale: 'ro' | 'da' };
        const { locale } = body;
        await new Promise<void>((resolve) => gates.set(locale, resolve));
        return Response.json({
          ...preferences,
          locale,
          effectiveCatalogLanguage: locale,
        });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { queryClient, i18n } = renderWithProviders(
      <>
        <ApplyMemberLocale />
        <YouTabLanguage />
      </>,
      { locale: 'ro' },
    );
    await waitFor(() => expect(gates.has('ro')).toBe(true));

    // The Member picks Danish on the You tab; both saves are now in flight.
    await user.click(await screen.findByRole('button', { name: 'DA' }));
    await waitFor(() => expect(gates.has('da')).toBe(true));
    expect(i18n.language).toBe('da');

    // The older sign-in save replies first: it must not put Romanian back.
    await act(async () => gates.get('ro')?.());
    await act(async () => {});
    expect(i18n.language).toBe('da');
    expect(
      (
        queryClient.getQueryData([
          'settings',
          'preferences',
        ]) as typeof preferences
      ).locale,
    ).not.toBe('ro');

    await act(async () => gates.get('da')?.());
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(i18n.language).toBe('da');
  });
});
