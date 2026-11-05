import { Capacitor } from '@capacitor/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '../../test/render';
import { SiriSection } from './components/SiriSection';

// The Keychain plugin, faked at its registration boundary.
const keychain = vi.hoisted(() => ({
  item: null as null | {
    secret: string;
    tokenId: string;
    memberId: string;
    apiOrigin: string;
  },
  set: vi.fn(),
  clear: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@capacitor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  registerPlugin: () => keychain,
}));

type Row = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const APP_TOKEN: Row = {
  id: 'app1',
  name: 'PantryGator app (iPhone)',
  prefix: 'pp_App1',
  createdAt: '2030-03-10T12:00:00.000Z',
  lastUsedAt: null,
};

function stubServer(options: { failCreate?: boolean; failRevoke?: boolean }) {
  let rows: Row[] = [];
  const { fetchMock, calls } = stubApi({
    'GET /api/auth/get-session': () =>
      Response.json({ user: { id: 'm1', name: 'Ana', email: 'a@b.c' } }),
    'GET /api/assistant-tokens': () => Response.json(rows),
    'POST /api/assistant-tokens': () => {
      if (options.failCreate)
        return Response.json({ code: 'boom', params: {} }, { status: 500 });
      rows = [APP_TOKEN];
      return Response.json(
        { ...APP_TOKEN, secret: 'pp_App1-THE-WHOLE-SECRET' },
        { status: 201 },
      );
    },
    'DELETE /api/assistant-tokens/app1': () => {
      if (options.failRevoke)
        return Response.json({ code: 'boom', params: {} }, { status: 500 });
      rows = [];
      return Response.json({ id: 'app1' });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function nativeIos() {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
}

describe('Use Siri switch in the iPhone app', () => {
  beforeEach(() => {
    keychain.item = null;
    keychain.set.mockReset().mockImplementation(async (item) => {
      keychain.item = item;
    });
    keychain.clear.mockReset().mockImplementation(async () => {
      keychain.item = null;
    });
    keychain.get.mockReset().mockImplementation(async () => ({
      tokenId: keychain.item?.tokenId,
      memberId: keychain.item?.memberId,
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the switch off, with the phrase to say', async () => {
    nativeIos();
    stubServer({});
    renderWithProviders(<SiriSection />);

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Hey Siri, PantryGator needs')).toBeInTheDocument();
  });

  it('is not offered in a browser', () => {
    stubServer({});
    renderWithProviders(<SiriSection />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('turning it on stores the token on the phone and lists it, without showing the secret', async () => {
    nativeIos();
    const calls = stubServer({});
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    await vi.waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'true'),
    );
    expect(
      calls.find((c) => c.key === 'POST /api/assistant-tokens')?.body,
    ).toEqual({
      name: 'PantryGator app (iPhone)',
    });
    expect(keychain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'pp_App1-THE-WHOLE-SECRET',
        tokenId: 'app1',
        memberId: 'm1',
      }),
    );
    expect(
      await screen.findByText('PantryGator app (iPhone)'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/THE-WHOLE-SECRET/)).not.toBeInTheDocument();
  });

  it('turning it off revokes the token and clears the phone', async () => {
    nativeIos();
    keychain.item = {
      secret: 's',
      tokenId: 'app1',
      memberId: 'm1',
      apiOrigin: '',
    };
    const calls = stubServer({});
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'true'),
    );
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    await vi.waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'false'),
    );
    expect(calls.map((c) => c.key)).toContain(
      'DELETE /api/assistant-tokens/app1',
    );
    expect(keychain.clear).toHaveBeenCalled();
    expect(keychain.item).toBeNull();
  });

  it('a create failure shows the error and leaves the switch off and nothing stored', async () => {
    nativeIos();
    stubServer({ failCreate: true });
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(keychain.set).not.toHaveBeenCalled();
  });

  it('a failure storing on the phone revokes the new token and leaves the switch off', async () => {
    nativeIos();
    const calls = stubServer({});
    keychain.set.mockRejectedValue(new Error('keychain'));
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(calls.map((c) => c.key)).toContain(
      'DELETE /api/assistant-tokens/app1',
    );
  });

  it('a revoke failure shows the error and leaves the switch on with the item kept', async () => {
    nativeIos();
    keychain.item = {
      secret: 's',
      tokenId: 'app1',
      memberId: 'm1',
      apiOrigin: '',
    };
    stubServer({ failRevoke: true });
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'true'),
    );
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(keychain.clear).not.toHaveBeenCalled();
  });
});
