import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeNativeIos, keychain, resetSiriEnvironment } from '../../test/siri';
import { renderWithProviders, stubApi } from '../../test/render';
import { SettingsPage } from './SettingsPage';

function stubServer(options: { failRevoke?: boolean } = {}) {
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
    'DELETE /api/assistant-tokens/app1': () =>
      options.failRevoke
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Response.json({ id: 'app1' }),
    'POST /api/auth/sign-out': () => Response.json({ success: true }),
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
    resetSiriEnvironment();
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
    renderWithProviders(<SettingsPage />);

    await signOut();

    await vi.waitFor(() =>
      expect(keys(calls)).toContain('POST /api/auth/sign-out'),
    );
    const order = keys(calls);
    expect(order.indexOf('DELETE /api/assistant-tokens/app1')).toBeGreaterThan(
      -1,
    );
    expect(order.indexOf('DELETE /api/assistant-tokens/app1')).toBeLessThan(
      order.indexOf('POST /api/auth/sign-out'),
    );
    expect(keychain.item).toBeNull();
  });

  it('still signs out and clears the item when the revoke fails', async () => {
    keychain.item = { ...STORED };
    const calls = stubServer({ failRevoke: true });
    renderWithProviders(<SettingsPage />);

    await signOut();

    await vi.waitFor(() =>
      expect(keys(calls)).toContain('POST /api/auth/sign-out'),
    );
    expect(keychain.item).toBeNull();
  });

  it('with Siri off makes no revoke request', async () => {
    const calls = stubServer();
    renderWithProviders(<SettingsPage />);

    await signOut();

    await vi.waitFor(() =>
      expect(keys(calls)).toContain('POST /api/auth/sign-out'),
    );
    expect(keys(calls)).not.toContain('DELETE /api/assistant-tokens/app1');
  });
});
