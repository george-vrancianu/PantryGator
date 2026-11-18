import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { SiriSection } from './SiriSection';

type Row = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const IPHONE: Row = {
  id: 't1',
  name: 'iPhone',
  prefix: 'pp_aB3x',
  createdAt: '2030-03-05T12:00:00.000Z',
  lastUsedAt: '2030-03-09T12:00:00.000Z',
};
const IPAD: Row = {
  id: 't2',
  name: 'iPad',
  prefix: 'pp_Zq9k',
  createdAt: '2030-03-06T12:00:00.000Z',
  lastUsedAt: null,
};

function stubTokens(initial: Row[]) {
  let rows = initial;
  const { fetchMock, calls } = stubApi({
    'GET /api/assistant-tokens': () => Response.json(rows),
    'POST /api/assistant-tokens': () => {
      const created: Row = {
        id: 't3',
        name: 'Kitchen',
        prefix: 'pp_Wm2d',
        createdAt: '2030-03-10T12:00:00.000Z',
        lastUsedAt: null,
      };
      rows = [...rows, created];
      return Response.json(
        { ...created, secret: 'pp_Wm2dTHE-WHOLE-SECRET' },
        { status: 201 },
      );
    },
    'DELETE /api/assistant-tokens/t1': () => {
      rows = rows.filter((row) => row.id !== 't1');
      return Response.json({ id: 't1' });
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('Settings Siri section', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists each token with its name, prefix, created and last used dates', async () => {
    stubTokens([IPHONE, IPAD]);
    renderWithProviders(<SiriSection />);

    await screen.findByText('iPhone');
    // The setup steps are list items too; the token list comes first.
    const rows = within(screen.getAllByRole('list')[0]).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('iPhone')).toBeInTheDocument();
    expect(within(rows[0]).getByText('pp_aB3x…')).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(/Created 05\.03\.2030/),
    ).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(/Last used 09\.03\.2030/),
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Never used/)).toBeInTheDocument();
  });

  it('shows the secret once after creating, with Copy, and forgets it when closed', async () => {
    const calls = stubTokens([]);
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    renderWithProviders(<SiriSection />);

    await user.type(await screen.findByLabelText('Token name'), '  Kitchen ');
    await user.click(screen.getByRole('button', { name: 'Create token' }));

    expect(
      await screen.findByText('pp_Wm2dTHE-WHOLE-SECRET'),
    ).toBeInTheDocument();
    expect(
      calls.find((c) => c.key === 'POST /api/assistant-tokens')?.body,
    ).toEqual({
      name: 'Kitchen',
    });
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('pp_Wm2dTHE-WHOLE-SECRET');
    expect(await screen.findByRole('status')).toHaveTextContent('Token copied');

    await user.click(screen.getByRole('button', { name: /Done/ }));
    expect(
      screen.queryByText('pp_Wm2dTHE-WHOLE-SECRET'),
    ).not.toBeInTheDocument();
    // The list only ever has the prefix.
    expect(await screen.findByText('pp_Wm2d…')).toBeInTheDocument();
    expect(screen.queryByText(/THE-WHOLE-SECRET/)).not.toBeInTheDocument();
  });

  it('asks for confirmation before revoking, and removes the row once confirmed', async () => {
    const calls = stubTokens([IPHONE, IPAD]);
    const user = userEvent.setup();
    renderWithProviders(<SiriSection />);

    await user.click(
      await screen.findByRole('button', { name: 'Revoke iPhone' }),
    );
    const deleted = () =>
      calls.some((c) => c.key === 'DELETE /api/assistant-tokens/t1');
    expect(deleted()).toBe(false);

    const confirm = screen.getByRole('group', { name: /Revoke iPhone\?/ });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('iPhone')).toBeInTheDocument();
    expect(deleted()).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Revoke iPhone' }));
    await user.click(
      within(screen.getByRole('group', { name: /Revoke iPhone\?/ })).getByRole(
        'button',
        { name: 'Revoke' },
      ),
    );

    expect(await screen.findByText('Token revoked')).toBeInTheDocument();
    expect(deleted()).toBe(true);
    expect(screen.queryByText('iPhone')).not.toBeInTheDocument();
    expect(screen.getByText('iPad')).toBeInTheDocument();
  });

  it('clears a failed create error once a revoke succeeds', async () => {
    const { fetchMock } = stubApi({
      'GET /api/assistant-tokens': () => Response.json([IPHONE]),
      'POST /api/assistant-tokens': () =>
        Response.json({ message: 'boom' }, { status: 500 }),
      'DELETE /api/assistant-tokens/t1': () => Response.json({ id: 't1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<SiriSection />);

    await user.type(await screen.findByLabelText('Token name'), 'Kitchen');
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Revoke iPhone' }));
    await user.click(
      within(screen.getByRole('group', { name: /Revoke iPhone\?/ })).getByRole(
        'button',
        { name: 'Revoke' },
      ),
    );
    expect(await screen.findByText('Token revoked')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('still reveals the secret when a revoke is confirmed while the create is pending', async () => {
    let finishCreate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      finishCreate = resolve;
    });
    const { fetchMock, calls } = stubApi({
      'GET /api/assistant-tokens': () => Response.json([IPHONE]),
      'POST /api/assistant-tokens': async () => {
        await gate;
        return Response.json(
          {
            id: 't3',
            name: 'Kitchen',
            prefix: 'pp_Wm2d',
            createdAt: '2030-03-10T12:00:00.000Z',
            lastUsedAt: null,
            secret: 'pp_Wm2dTHE-WHOLE-SECRET',
          },
          { status: 201 },
        );
      },
      'DELETE /api/assistant-tokens/t1': () => Response.json({ id: 't1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<SiriSection />);

    await user.type(await screen.findByLabelText('Token name'), 'Kitchen');
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    await user.click(screen.getByRole('button', { name: 'Revoke iPhone' }));
    await user.click(
      within(screen.getByRole('group', { name: /Revoke iPhone\?/ })).getByRole(
        'button',
        { name: 'Revoke' },
      ),
    );
    expect(await screen.findByText('Token revoked')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /api/assistant-tokens')).toBe(
      true,
    );

    finishCreate();
    expect(
      await screen.findByText('pp_Wm2dTHE-WHOLE-SECRET'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  describe('setup guide', () => {
    afterEach(() => vi.unstubAllEnvs());

    const LINK_VARIABLES = {
      needs: 'VITE_SIRI_NEEDS_SHORTCUT_URL',
      got: 'VITE_SIRI_GOT_SHORTCUT_URL',
      have: 'VITE_SIRI_HAVE_SHORTCUT_URL',
      add: 'VITE_SIRI_SHORTCUT_URL',
    } as const;
    const clearLinks = () =>
      Object.values(LINK_VARIABLES).forEach((name) =>
        vi.stubEnv(name, undefined),
      );

    it.each([
      [
        'en',
        [
          /Hey Siri, Gator needs/,
          /Hey Siri, Gator got/,
          /Hey Siri, Gator, do we have/,
          /Hey Siri, Pantry add/,
        ],
        /tick off items already on your Shopping List/,
        /always English/,
      ],
      [
        'ro',
        [
          /Hey Siri, Gator needs/,
          /Hey Siri, Gator got/,
          /Hey Siri, Gator, do we have/,
          /Hey Siri, Pantry add/,
        ],
        /poate bifa articole deja aflate pe Lista de cumpărături/,
        /mereu în engleză/,
      ],
      [
        'da',
        [
          /Hey Siri, Gator needs/,
          /Hey Siri, Gator got/,
          /Hey Siri, Gator, do we have/,
          /Hey Siri, Pantry add/,
        ],
        /krydse varer af, der allerede står på din indkøbsliste/,
        /altid på engelsk/,
      ],
    ] as const)(
      'lists all four Shortcuts with their phrases in %s',
      async (locale, phrases, hint, note) => {
        clearLinks();
        stubTokens([]);
        renderWithProviders(<SiriSection />, { locale });

        const shortcuts = await screen.findByRole('list', {
          name: /Shortcuts|Comenzi rapide|Genveje/,
        });
        const items = within(shortcuts).getAllByRole('listitem');
        expect(items).toHaveLength(4);
        phrases.forEach((phrase, index) =>
          expect(items[index]).toHaveTextContent(phrase),
        );
        expect(screen.getByText(hint)).toBeInTheDocument();
        expect(screen.getByText(note)).toBeInTheDocument();
        // The steps list keeps its four steps.
        const steps = screen.getByRole('list', { name: /Siri/ });
        expect(within(steps).getAllByRole('listitem')).toHaveLength(4);
      },
    );

    it('says each link is coming soon while no URL is configured, with no links', async () => {
      clearLinks();
      stubTokens([]);
      renderWithProviders(<SiriSection />);

      await screen.findByText('No tokens yet.');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getAllByText('Link coming soon')).toHaveLength(4);
    });

    it.each([
      ['needs', /Open the “Gator needs” Shortcut/],
      ['got', /Open the “Gator got” Shortcut/],
      ['have', /Open the “Gator, do we have” Shortcut/],
      ['add', /Open the “Pantry add” Shortcut/],
    ] as const)(
      'links to the %s Shortcut in a new tab when its URL is configured',
      async (key, name) => {
        clearLinks();
        vi.stubEnv(
          LINK_VARIABLES[key],
          `https://www.icloud.com/shortcuts/${key}`,
        );
        stubTokens([]);
        renderWithProviders(<SiriSection />);

        const link = await screen.findByRole('link', { name });
        expect(link).toHaveAttribute(
          'href',
          `https://www.icloud.com/shortcuts/${key}`,
        );
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        // The other three stay hidden while their own variables are unset.
        expect(screen.getAllByRole('link')).toHaveLength(1);
        expect(screen.getAllByText('Link coming soon')).toHaveLength(3);
      },
    );

    it('treats an empty URL like an unset one', async () => {
      clearLinks();
      vi.stubEnv('VITE_SIRI_GOT_SHORTCUT_URL', '  ');
      stubTokens([]);
      renderWithProviders(<SiriSection />);

      await screen.findByText('No tokens yet.');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });
});
