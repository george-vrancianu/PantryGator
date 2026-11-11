import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeNativeIos, keychain, resetSiriEnvironment } from '../../test/siri';
import { renderWithProviders, stubApi } from '../../test/render';
import { SiriSection } from './components/SiriSection';

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

function stubServer(options: {
  failCreate?: boolean;
  failRevoke?: boolean;
  /** The Member's active tokens to begin with. */
  rows?: Row[];
  /** The signed-in Member's id. */
  memberId?: string;
  spokenLanguage?: 'en' | 'ro' | 'da';
}) {
  let rows: Row[] = options.rows ?? [];
  const { fetchMock, calls } = stubApi({
    'GET /api/auth/get-session': () =>
      Response.json({
        user: { id: options.memberId ?? 'm1', name: 'Ana', email: 'a@b.c' },
      }),
    'GET /api/settings/preferences': () =>
      Response.json({
        locale: 'en',
        catalogLanguage: null,
        effectiveCatalogLanguage: 'en',
        scanLanguage: null,
        effectiveScanLanguage: 'en',
        spokenLanguage: null,
        effectiveSpokenLanguage: options.spokenLanguage ?? 'en',
        theme: null,
        hideRecipesWithAllergies: false,
        introDone: true,
      }),
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

describe('Use Siri switch in the iPhone app', () => {
  beforeEach(resetSiriEnvironment);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the switch off, with the phrase to say', async () => {
    fakeNativeIos();
    stubServer({});
    renderWithProviders(<SiriSection />);

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Hey Siri, Gator needs')).toBeInTheDocument();
    expect(screen.getByText('Hey Siri, Gator got')).toBeInTheDocument();
    expect(screen.getByText('Hey Siri, Gator, do we have')).toBeInTheDocument();
  });

  it('shows the Shortcut setup steps to a Romanian-speaking Member, since Siri has no Romanian', async () => {
    fakeNativeIos();
    stubServer({ spokenLanguage: 'ro' });
    renderWithProviders(<SiriSection />);

    expect(await screen.findByText('Set up Siri')).toBeInTheDocument();
    expect(screen.getByText(/Hey Siri, Pantry add/)).toBeInTheDocument();
  });

  it('hides the Shortcut setup steps from an English-speaking Member', async () => {
    fakeNativeIos();
    const calls = stubServer({ spokenLanguage: 'en' });
    renderWithProviders(<SiriSection />);

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key === 'GET /api/settings/preferences')).toBe(
        true,
      ),
    );
    expect(screen.queryByText('Set up Siri')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hey Siri, Pantry add/)).not.toBeInTheDocument();
  });

  it('does not flash the Shortcut setup steps at a Romanian UI whose Spoken Language is English', async () => {
    fakeNativeIos();
    stubServer({ spokenLanguage: 'en' });
    renderWithProviders(<SiriSection />, { locale: 'ro' });

    // Before the Preferences have loaded, the UI Language must not decide.
    expect(screen.queryByText('Configurează Siri')).not.toBeInTheDocument();
    const toggle = await screen.findByRole('switch', {
      name: 'Folosește Siri',
    });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    expect(screen.queryByText('Configurează Siri')).not.toBeInTheDocument();
  });

  it('still shows the Shortcut setup steps on the web, whatever the language', async () => {
    stubServer({ spokenLanguage: 'en' });
    renderWithProviders(<SiriSection />);

    expect(await screen.findByText('Set up Siri')).toBeInTheDocument();
  });

  it('shows the Danish phrases in Danish', async () => {
    fakeNativeIos();
    stubServer({});
    renderWithProviders(<SiriSection />, { locale: 'da' });

    expect(
      await screen.findByText('Hej Siri, Gator mangler'),
    ).toBeInTheDocument();
    expect(screen.getByText('Hej Siri, Gator har købt')).toBeInTheDocument();
    expect(screen.getByText('Hej Siri, Gator, har vi')).toBeInTheDocument();
  });

  it('is not offered in a browser', () => {
    stubServer({});
    renderWithProviders(<SiriSection />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('turning it on stores the token on the phone and lists it, without showing the secret', async () => {
    fakeNativeIos();
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
    fakeNativeIos();
    keychain.item = {
      secret: 's',
      tokenId: 'app1',
      memberId: 'm1',
      apiOrigin: '',
    };
    const calls = stubServer({ rows: [APP_TOKEN] });
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

  it('revoking the phone token from the list below turns the switch off and clears the phone', async () => {
    fakeNativeIos();
    keychain.item = {
      secret: 's',
      tokenId: 'app1',
      memberId: 'm1',
      apiOrigin: '',
    };
    stubServer({ rows: [APP_TOKEN] });
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'true'),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Revoke PantryGator app (iPhone)',
      }),
    );
    await user.click(
      await within(
        await screen.findByRole('group', {
          name: 'Revoke PantryGator app (iPhone)? Anything using it stops working.',
        }),
      ).findByRole('button', { name: 'Revoke' }),
    );

    await vi.waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'false'),
    );
    expect(keychain.item).toBeNull();
  });

  it('a create failure shows the error and leaves the switch off and nothing stored', async () => {
    fakeNativeIos();
    stubServer({ failCreate: true });
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(keychain.set).not.toHaveBeenCalled();
  });

  it('a failure storing on the phone revokes the new token and leaves the switch off', async () => {
    fakeNativeIos();
    const calls = stubServer({});
    keychain.set.mockRejectedValue(new Error('keychain'));
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(keychain.item).toBeNull();
    expect(calls.map((c) => c.key)).toContain(
      'DELETE /api/assistant-tokens/app1',
    );
  });

  it('a revoke failure shows the error and leaves the switch on with the item kept', async () => {
    fakeNativeIos();
    keychain.item = {
      secret: 's',
      tokenId: 'app1',
      memberId: 'm1',
      apiOrigin: '',
    };
    stubServer({ failRevoke: true, rows: [APP_TOKEN] });
    renderWithProviders(<SiriSection />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
    await vi.waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'true'),
    );
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(keychain.clear).not.toHaveBeenCalled();
  });

  describe('reconciling with the server', () => {
    const STORED = {
      secret: 's',
      tokenId: 'app1',
      memberId: 'm1',
      apiOrigin: '',
    };

    it('keeps the switch on while the token is still in the Member list', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED };
      stubServer({ rows: [APP_TOKEN] });
      renderWithProviders(<SiriSection />);

      const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
      await vi.waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', 'true'),
      );
      await screen.findByText('PantryGator app (iPhone)');
      expect(keychain.clear).not.toHaveBeenCalled();
    });

    it('shows the switch off and clears the item when the token was revoked elsewhere', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED };
      stubServer({ rows: [] });
      renderWithProviders(<SiriSection />);

      const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
      await vi.waitFor(() => expect(keychain.item).toBeNull());
      await vi.waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', 'false'),
      );
    });

    it('shows the switch off and clears the item for another Member, without a revoke request', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED, memberId: 'someone-else' };
      const calls = stubServer({ rows: [APP_TOKEN] });
      renderWithProviders(<SiriSection />);

      const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
      await vi.waitFor(() => expect(keychain.item).toBeNull());
      await vi.waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', 'false'),
      );
      expect(calls.map((c) => c.key)).not.toContain(
        'DELETE /api/assistant-tokens/app1',
      );
    });

    it('refreshes the stored API origin when it differs from the build', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED, apiOrigin: 'https://old.example' };
      stubServer({ rows: [APP_TOKEN] });
      renderWithProviders(<SiriSection />);

      const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
      await vi.waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', 'true'),
      );
      expect(keychain.updateApiOrigin).toHaveBeenCalledWith({ apiOrigin: '' });
      expect(keychain.item).toEqual({ ...STORED, apiOrigin: '' });
    });

    it('leaves the stored API origin alone when it already matches', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED };
      stubServer({ rows: [APP_TOKEN] });
      renderWithProviders(<SiriSection />);

      const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
      await vi.waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', 'true'),
      );
      expect(keychain.updateApiOrigin).not.toHaveBeenCalled();
    });

    it('does not touch the API origin of an item that is cleared', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED, apiOrigin: 'https://old.example' };
      stubServer({ rows: [] });
      renderWithProviders(<SiriSection />);

      await vi.waitFor(() => expect(keychain.item).toBeNull());
      expect(keychain.updateApiOrigin).not.toHaveBeenCalled();
    });

    it('keeps the switch on when updating the API origin fails', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED, apiOrigin: 'https://old.example' };
      keychain.updateApiOrigin.mockRejectedValue(new Error('keychain'));
      stubServer({ rows: [APP_TOKEN] });
      renderWithProviders(<SiriSection />);

      const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
      await vi.waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', 'true'),
      );
      expect(keychain.clear).not.toHaveBeenCalled();
    });

    it('asks for the token list once on mount', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED };
      const calls = stubServer({ rows: [APP_TOKEN] });
      renderWithProviders(<SiriSection />);

      const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
      await vi.waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', 'true'),
      );
      await screen.findByText('PantryGator app (iPhone)');
      expect(
        calls.filter((c) => c.key === 'GET /api/assistant-tokens'),
      ).toHaveLength(1);
    });

    it('says something went wrong, with the switch disabled, when the phone cannot be read', async () => {
      fakeNativeIos();
      keychain.get.mockRejectedValue(new Error('keychain'));
      stubServer({ rows: [] });
      renderWithProviders(<SiriSection />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
      expect(screen.getByRole('switch', { name: 'Use Siri' })).toBeDisabled();
    });

    it('keeps the item when the token list cannot be read (offline)', async () => {
      fakeNativeIos();
      keychain.item = { ...STORED };
      const { fetchMock } = stubApi({
        'GET /api/auth/get-session': () =>
          Response.json({ user: { id: 'm1', name: 'Ana', email: 'a@b.c' } }),
        'GET /api/assistant-tokens': () =>
          Response.json({ code: 'boom', params: {} }, { status: 500 }),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<SiriSection />);

      const toggle = await screen.findByRole('switch', { name: 'Use Siri' });
      await vi.waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', 'true'),
      );
      expect(keychain.clear).not.toHaveBeenCalled();
    });
  });
});
