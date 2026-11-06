import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeNativeIos, keychain, resetSiriEnvironment } from '../../test/siri';
import { renderWithProviders, stubApi } from '../../test/render';
import { SettingsPage } from './SettingsPage';

function App() {
  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/sign-in" element={<p>Sign in page</p>} />
    </Routes>
  );
}

/** What happened, in order: the revoke, the sign-out request and the Keychain clear. */
let events: string[] = [];

function stubServer(
  options: {
    failRevoke?: boolean;
    offline?: boolean;
    signOutStatus?: number;
  } = {},
) {
  const { fetchMock, calls } = stubApi({
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
    'GET /api/settings/categories': () => Response.json({ parents: [] }),
    'GET /api/settings/preferences': () =>
      Response.json({ locale: null, theme: null }),
    'GET /api/auth/get-session': () =>
      Response.json({ user: { id: 'm1', name: 'Ana', email: 'a@b.c' } }),
    'GET /api/assistant-tokens': () =>
      Response.json([
        {
          id: 'app1',
          name: 'PantryGator app (iPhone)',
          prefix: 'pp_App1',
          createdAt: '2030-03-10T12:00:00.000Z',
          lastUsedAt: null,
        },
      ]),
    'DELETE /api/assistant-tokens/app1': () => {
      events.push('revoke');
      return options.failRevoke || options.offline
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Response.json({ id: 'app1' });
    },
    'POST /api/auth/sign-out': () => {
      events.push('sign-out');
      if (options.signOutStatus) {
        return Response.json(
          { code: 'error' },
          { status: options.signOutStatus },
        );
      }
      return options.offline
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Response.json({ success: true });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

/** Sign out is a two-step inline confirm: ask, then confirm. */
async function signOut() {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Sign out' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
}

const keys = (calls: { key: string }[]) => calls.map((c) => c.key);

describe('Signing out of the iPhone app with Siri', () => {
  beforeEach(() => {
    events = [];
    resetSiriEnvironment();
    const clear = keychain.clear.getMockImplementation()!;
    keychain.clear.mockImplementation(async () => {
      events.push('clear');
      return clear();
    });
    fakeNativeIos();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const STORED = {
    secret: 's',
    tokenId: 'app1',
    memberId: 'm1',
    apiOrigin: '',
  };

  it('with Siri on revokes the token, then clears the item, then signs out', async () => {
    keychain.item = { ...STORED };
    const calls = stubServer();
    renderWithProviders(<App />, { route: '/settings' });

    await signOut();

    await vi.waitFor(() =>
      expect(keys(calls)).toContain('POST /api/auth/sign-out'),
    );
    expect(events).toEqual(['revoke', 'clear', 'sign-out']);
    expect(keychain.item).toBeNull();
  });

  it('still signs out and clears the item when the revoke fails', async () => {
    keychain.item = { ...STORED };
    const calls = stubServer({ failRevoke: true });
    renderWithProviders(<App />, { route: '/settings' });

    await signOut();

    await vi.waitFor(() =>
      expect(keys(calls)).toContain('POST /api/auth/sign-out'),
    );
    expect(keychain.item).toBeNull();
  });

  it('offline, the Member still reaches sign-in and the item is cleared', async () => {
    keychain.item = { ...STORED };
    stubServer({ offline: true });
    renderWithProviders(<App />, { route: '/settings' });

    await signOut();

    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(keychain.item).toBeNull();
  });

  it('a 401 on sign-out counts as signed out and the item is cleared', async () => {
    keychain.item = { ...STORED };
    stubServer({ signOutStatus: 401 });
    renderWithProviders(<App />, { route: '/settings' });

    await signOut();

    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(keychain.item).toBeNull();
  });

  it('a server error on sign-out after a good revoke keeps the Member signed in with Siri off', async () => {
    keychain.item = { ...STORED };
    stubServer({ signOutStatus: 500 });
    renderWithProviders(<App />, { route: '/settings' });

    await signOut();

    await vi.waitFor(() =>
      expect(events).toEqual(['revoke', 'clear', 'sign-out']),
    );
    expect(keychain.item).toBeNull();
    // Still on Settings, still signed in: the Member can try again.
    expect(screen.queryByText('Sign in page')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Sign out' }),
    ).toBeEnabled();
  });

  it('does not revoke another Member token, but still clears the item', async () => {
    keychain.item = { ...STORED, memberId: 'someone-else' };
    const calls = stubServer();
    const read = keychain.get.getMockImplementation()!;
    keychain.get.mockImplementationOnce(() => new Promise(() => undefined));
    keychain.get.mockImplementation(read);
    renderWithProviders(<App />, { route: '/settings' });
    // The page's own check of the phone never answers, so only sign-out acts on the item.
    // The session has to be known before signing out.
    await vi.waitFor(() =>
      expect(keys(calls)).toContain('GET /api/auth/get-session'),
    );

    await signOut();

    // Signed out, not just asked to: the response has been handled.
    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(keys(calls)).not.toContain('DELETE /api/assistant-tokens/app1');
    expect(keychain.item).toBeNull();
  });

  it('with Siri off makes no revoke request', async () => {
    const calls = stubServer();
    renderWithProviders(<App />, { route: '/settings' });

    await signOut();

    await vi.waitFor(() =>
      expect(keys(calls)).toContain('POST /api/auth/sign-out'),
    );
    expect(keys(calls)).not.toContain('DELETE /api/assistant-tokens/app1');
  });
});

describe('Signing out on the web while offline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('still fails: only the apps count offline as signed out', async () => {
    events = [];
    resetSiriEnvironment();
    stubServer({ offline: true });
    renderWithProviders(<App />, { route: '/settings' });

    await signOut();

    await vi.waitFor(() => expect(events).toEqual(['sign-out']));
    expect(screen.queryByText('Sign in page')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Sign out' }),
    ).toBeEnabled();
  });
});
