import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplyMemberTheme } from '../../components/ApplyMemberTheme';
import { renderWithProviders, stubApi } from '../../test/render';
import { stubSystemScheme } from '../../test/viewport';
import { SettingsPage } from './SettingsPage';

type Stored = { theme: string; matchSystem: boolean };

function store(appearance: Stored) {
  localStorage.setItem('pp.appearance', JSON.stringify(appearance));
}

const stored = (): Stored =>
  JSON.parse(localStorage.getItem('pp.appearance') ?? 'null');

const rootTheme = () => document.documentElement.dataset.theme;

/** The API with this Member's saved preferences; a save echoes the merged result. */
function stubPreferences(
  saved: { locale: string | null; theme: string | null },
  /** While `online` is false, saves fail as they do offline. */
  network = { online: true },
  /** The signed-in Member; the session answers with it. */
  member: { id: string } | null = null,
) {
  let current = { ...saved };
  const { fetchMock, calls } = stubApi({
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    'GET /api/settings/categories': () => Response.json({ parents: [] }),
    'GET /api/auth/get-session': () =>
      Response.json(
        member && {
          user: { id: member.id, name: member.id, email: `${member.id}@x.io` },
        },
      ),
    'POST /api/auth/sign-out': () => Response.json({ success: true }),
    'GET /api/settings/preferences': () => Response.json(current),
    'PUT /api/settings/preferences': () => Response.json(current),
  });
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT' && !network.online) {
      calls.push({
        key: 'PUT /api/settings/preferences (failed)',
        search: '',
        body: JSON.parse(String(init.body)),
      });
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (init?.method === 'PUT' && typeof init.body === 'string') {
      current = { ...current, ...JSON.parse(init.body) };
    }
    return fetchMock(input, init);
  });
  return calls;
}

function renderSettings() {
  return renderWithProviders(
    <>
      <ApplyMemberTheme />
      <SettingsPage />
    </>,
  );
}

/** Sign out is a two-step inline confirm: ask, then confirm. */
async function signOutInline() {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Sign out' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
}

const themeTiles = async () =>
  within(await screen.findByRole('group', { name: 'Appearance' }));

/** Lets timers (React Query hands results to observers on one) and their follow-up renders run. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('Settings Appearance', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-theme');
    vi.unstubAllGlobals();
  });

  it('offers Light and Dark as tiles, with the chosen one pressed', async () => {
    stubSystemScheme(false);
    store({ theme: 'dark', matchSystem: false });
    stubPreferences({ locale: null, theme: 'dark' });
    renderSettings();

    const tiles = await themeTiles();
    expect(tiles.getAllByRole('button').map((r) => r.textContent)).toEqual([
      'Light',
      'Dark',
    ]);
    expect(tiles.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(tiles.getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it.each([
    { theme: 'light', matchSystem: false, systemDark: true, root: 'light' },
    { theme: 'dark', matchSystem: false, systemDark: false, root: 'dark' },
  ])(
    'tapping $theme with Match system on in system dark $systemDark shows $root, turns Match system off and saves it',
    async ({ theme, matchSystem, systemDark, root }) => {
      stubSystemScheme(systemDark);
      store({ theme: 'light', matchSystem: true });
      const calls = stubPreferences({ locale: null, theme: 'light' });
      renderSettings();

      await userEvent.click(
        (await themeTiles()).getByRole('button', {
          name: theme === 'dark' ? 'Dark' : 'Light',
        }),
      );

      expect(rootTheme()).toBe(root);
      expect(stored()).toEqual({ theme, matchSystem });
      expect(
        screen.getByRole('switch', { name: 'Match system' }),
      ).toHaveAttribute('aria-checked', 'false');
      await vi.waitFor(() =>
        expect(calls).toContainEqual(
          expect.objectContaining({ body: { theme } }),
        ),
      );
    },
  );

  it('selects the tile of the Theme in use while Match system is on', async () => {
    const system = stubSystemScheme(true);
    store({ theme: 'light', matchSystem: true });
    stubPreferences({ locale: null, theme: 'light' });
    renderSettings();

    const tiles = await themeTiles();
    expect(rootTheme()).toBe('dark');
    expect(tiles.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(tiles.getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    act(() => system.setDark(false));
    expect(tiles.getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('follows the device: Dark in system dark, Light otherwise, with Match system turned on', async () => {
    stubSystemScheme(true);
    store({ theme: 'light', matchSystem: false });
    stubPreferences({ locale: null, theme: 'light' });
    renderSettings();
    await themeTiles();
    expect(rootTheme()).toBe('light');

    await userEvent.click(screen.getByRole('switch', { name: 'Match system' }));

    expect(rootTheme()).toBe('dark');
    expect(stored()).toEqual({ theme: 'light', matchSystem: true });
  });

  it('keeps Match system on the device: toggling it saves nothing on the Member', async () => {
    stubSystemScheme(false);
    store({ theme: 'light', matchSystem: true });
    const calls = stubPreferences({ locale: null, theme: 'light' });
    renderSettings();

    const toggle = await screen.findByRole('switch', { name: 'Match system' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleDescription(
      'Dark when the phone is in dark mode, Light otherwise',
    );
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(stored()).toEqual({ theme: 'light', matchSystem: false });
    expect(calls.map((c) => c.key)).not.toContain(
      'PUT /api/settings/preferences',
    );
  });

  it('follows a system dark/light change while open, with Match system on', async () => {
    const system = stubSystemScheme(false);
    store({ theme: 'light', matchSystem: true });
    stubPreferences({ locale: null, theme: 'light' });
    renderSettings();
    await themeTiles();
    expect(rootTheme()).toBe('light');

    act(() => system.setDark(true));
    expect(rootTheme()).toBe('dark');
    act(() => system.setDark(false));
    expect(rootTheme()).toBe('light');
  });

  it('applies a different Theme saved on the Member when preferences load', async () => {
    stubSystemScheme(false);
    store({ theme: 'light', matchSystem: false });
    stubPreferences({ locale: null, theme: 'dark' });
    renderSettings();

    await vi.waitFor(() => expect(rootTheme()).toBe('dark'));
    expect(stored()).toEqual({ theme: 'dark', matchSystem: false });
  });

  it.each(['warm', 'minimal'])(
    'reads a %s Theme saved on the Member as Light',
    async (savedTheme) => {
      stubSystemScheme(false);
      store({ theme: 'dark', matchSystem: false });
      stubPreferences({ locale: null, theme: savedTheme });
      renderSettings();

      await vi.waitFor(() => expect(rootTheme()).toBe('light'));
      expect(stored()).toEqual({ theme: 'light', matchSystem: false });
    },
  );

  it('falls back to the default Theme when the Member never chose one', async () => {
    stubSystemScheme(false);
    store({ theme: 'dark', matchSystem: false });
    stubPreferences({ locale: null, theme: null });
    renderSettings();

    await vi.waitFor(() => expect(rootTheme()).toBe('light'));
    expect(stored()).toEqual({ theme: 'light', matchSystem: false });
  });

  describe('saving', () => {
    it('shows a sync toast and keeps the chosen Theme on screen when the save fails', async () => {
      stubSystemScheme(false);
      store({ theme: 'light', matchSystem: false });
      stubPreferences({ locale: null, theme: 'light' }, { online: false });
      renderSettings();

      await userEvent.click(
        (await themeTiles()).getByRole('button', { name: 'Dark' }),
      );

      expect(
        await screen.findByText(
          "Theme saved on this phone. We'll sync it when you're online.",
        ),
      ).toBeInTheDocument();
      expect(
        (await themeTiles()).getByRole('button', { name: 'Dark' }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(rootTheme()).toBe('dark');
    });
  });

  describe('a Theme chosen offline or before preferences load', () => {
    const saves = (calls: Array<{ key: string; body: unknown }>) =>
      calls.filter((c) => c.key === 'PUT /api/settings/preferences');

    it('keeps an unsaved device choice over the server value on the next load, and re-sends it', async () => {
      stubSystemScheme(false);
      store({ theme: 'light', matchSystem: false });
      const network = { online: false };
      const calls = stubPreferences({ locale: null, theme: 'light' }, network);
      const { unmount } = renderSettings();

      await userEvent.click(
        (await themeTiles()).getByRole('button', { name: 'Dark' }),
      );
      await vi.waitFor(() =>
        expect(calls.map((c) => c.key)).toContain(
          'PUT /api/settings/preferences (failed)',
        ),
      );
      expect(rootTheme()).toBe('dark');
      unmount();
      network.online = true;

      // The next load: the server still says Warm, but the device's unsynced choice wins and is re-sent.
      renderSettings();
      await themeTiles();
      await vi.waitFor(() =>
        expect(saves(calls)).toEqual([
          expect.objectContaining({ body: { theme: 'dark' } }),
        ]),
      );
      expect(rootTheme()).toBe('dark');
      expect(stored()).toEqual({ theme: 'dark', matchSystem: false });
    });

    it('re-sends a failed save when the device comes back online, and then follows the server again', async () => {
      stubSystemScheme(false);
      store({ theme: 'light', matchSystem: false });
      const network = { online: false };
      const calls = stubPreferences({ locale: null, theme: 'light' }, network);
      const { unmount } = renderSettings();
      await userEvent.click(
        (await themeTiles()).getByRole('button', { name: 'Dark' }),
      );
      await vi.waitFor(() =>
        expect(calls.map((c) => c.key)).toContain(
          'PUT /api/settings/preferences (failed)',
        ),
      );
      // Let any retry from the preferences read settle while still offline.
      await advance(50);
      expect(saves(calls)).toEqual([]);

      network.online = true;
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      await vi.waitFor(() =>
        expect(saves(calls)).toEqual([
          expect.objectContaining({ body: { theme: 'dark' } }),
        ]),
      );
      unmount();

      // Synced, so the Member's Theme from another device applies on the next load.
      stubPreferences({ locale: null, theme: 'dark' });
      renderSettings();
      await vi.waitFor(() => expect(rootTheme()).toBe('dark'));
    });

    it('does not carry an unsynced Theme over to the next Member after sign-out', async () => {
      stubSystemScheme(false);
      store({ theme: 'light', matchSystem: false });
      const network = { online: false };
      const calls = stubPreferences({ locale: null, theme: 'light' }, network, {
        id: 'member-a',
      });
      const first = renderSettings();
      await userEvent.click(
        (await themeTiles()).getByRole('button', { name: 'Dark' }),
      );
      await vi.waitFor(() =>
        expect(calls.map((c) => c.key)).toContain(
          'PUT /api/settings/preferences (failed)',
        ),
      );
      await signOutInline();
      await vi.waitFor(() =>
        expect(calls.map((c) => c.key)).toContain('POST /api/auth/sign-out'),
      );
      first.unmount();

      network.online = true;
      const second = stubPreferences({ locale: null, theme: 'dark' }, network, {
        id: 'member-b',
      });
      renderSettings();
      await vi.waitFor(() => expect(rootTheme()).toBe('dark'));
      await advance(50);
      expect(saves(second)).toEqual([]);
      expect(stored()).toEqual({ theme: 'dark', matchSystem: false });
    });

    it('ignores an unsynced Theme that another Member chose on this device', async () => {
      stubSystemScheme(false);
      store({ theme: 'dark', matchSystem: false });
      localStorage.setItem(
        'pp.appearance.unsynced',
        JSON.stringify({ memberId: 'member-a', theme: 'dark' }),
      );
      const calls = stubPreferences(
        { locale: null, theme: 'dark' },
        { online: true },
        { id: 'member-b' },
      );
      renderSettings();

      await vi.waitFor(() => expect(rootTheme()).toBe('dark'));
      await advance(50);
      expect(saves(calls)).toEqual([]);
    });

    it('sends a newer choice made while a failing save was in flight', async () => {
      stubSystemScheme(false);
      store({ theme: 'light', matchSystem: false });
      const calls = stubPreferences({ locale: null, theme: 'light' });
      const stubbed = globalThis.fetch;
      let puts = 0;
      let failFirst = () => {};
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method !== 'PUT') return stubbed(input, init);
        puts += 1;
        if (puts > 1) return stubbed(input, init);
        return new Promise<Response>((_, reject) => {
          failFirst = () => reject(new TypeError('Server error'));
        });
      });
      renderSettings();

      const tiles = await themeTiles();
      await userEvent.click(tiles.getByRole('button', { name: 'Dark' }));
      await vi.waitFor(() => expect(puts).toBe(1));
      await userEvent.click(tiles.getByRole('button', { name: 'Light' }));
      await act(async () => failFirst());

      await vi.waitFor(() =>
        expect(saves(calls)).toContainEqual(
          expect.objectContaining({ body: { theme: 'light' } }),
        ),
      );
    });

    it('drops a save that settles after sign-out instead of writing it to the next session', async () => {
      stubSystemScheme(false);
      store({ theme: 'light', matchSystem: false });
      const calls = stubPreferences(
        { locale: null, theme: 'light' },
        undefined,
        {
          id: 'member-a',
        },
      );
      const stubbed = globalThis.fetch;
      let settlePut = () => {};
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method !== 'PUT') return stubbed(input, init);
        return new Promise<Response>((resolve) => {
          settlePut = () =>
            resolve(Response.json({ locale: 'ro', theme: 'dark' }));
        });
      });
      const { queryClient, i18n } = renderSettings();

      await userEvent.click(
        (await themeTiles()).getByRole('button', { name: 'Dark' }),
      );
      await signOutInline();
      await vi.waitFor(() =>
        expect(calls.map((c) => c.key)).toContain('POST /api/auth/sign-out'),
      );
      // Member B signs in on the device and picks the same Theme before A's save settles.
      localStorage.setItem(
        'pp.appearance.unsynced',
        JSON.stringify({ memberId: 'member-b', theme: 'dark' }),
      );
      queryClient.setQueryData(['session'], {
        user: { id: 'member-b', name: 'b', email: 'b@x.io' },
      });
      await act(async () => {
        settlePut();
        await vi.advanceTimersByTimeAsync(50);
      });

      // The mounted You tab may read preferences again for the new session; A's answer is not it.
      expect(
        queryClient.getQueryData(['settings', 'preferences']),
      ).not.toMatchObject({ locale: 'ro', theme: 'dark' });
      expect(i18n.language).not.toBe('ro');
    });

    it('keeps a Theme chosen before preferences load when they arrive with the old value', async () => {
      stubSystemScheme(false);
      store({ theme: 'light', matchSystem: false });
      const calls = stubPreferences({ locale: null, theme: 'light' });
      const stubbed = globalThis.fetch;
      let loadPreferences = () => {};
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        const read =
          String(input).endsWith('/api/settings/preferences') &&
          (init?.method ?? 'GET') === 'GET';
        if (!read) return stubbed(input, init);
        // Answers with what the server held before the save below.
        return new Promise<Response>((resolve) => {
          loadPreferences = () =>
            resolve(Response.json({ locale: null, theme: 'light' }));
        });
      });
      renderSettings();

      await userEvent.click(
        (await themeTiles()).getByRole('button', { name: 'Dark' }),
      );
      await vi.waitFor(() => expect(saves(calls)).toHaveLength(1));
      await act(async () => {
        loadPreferences();
        // React Query hands the result to observers on a timer.
        await vi.advanceTimersByTimeAsync(50);
      });

      expect(rootTheme()).toBe('dark');
      expect(stored()).toEqual({ theme: 'dark', matchSystem: false });
    });
  });
});
