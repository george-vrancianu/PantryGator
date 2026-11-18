import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromoCodeEntry } from '@/lib/promoCodes';
import { renderWithProviders, stubApi } from '@/test/render';
import { AdminPage } from './AdminPage';

const emptyCatalog = {
  aisles: [],
  tagGroups: [],
  tags: [],
  allergens: [],
  eatingMoments: [],
  parentCategories: [],
  leafCategories: [],
  ingredients: [],
};

const entry = (over: Partial<PromoCodeEntry>): PromoCodeEntry => ({
  id: 'p1',
  code: 'ABCDE-FGHJK',
  credits: 100,
  note: null,
  createdAt: '2026-03-04T10:00:00.000Z',
  status: 'unused',
  redeemedAt: null,
  redeemedByName: null,
  redeemedByEmail: null,
  redeemedFamilyId: null,
  ...over,
});

const unused = entry({ note: 'for Ana' });
const redeemed = entry({
  id: 'p2',
  code: 'MNPQR-STUVW',
  status: 'redeemed',
  redeemedAt: '2026-03-05T12:00:00.000Z',
  redeemedByName: 'Bo',
  redeemedByEmail: 'bo@example.com',
  redeemedFamilyId: '12345678-aaaa-bbbb-cccc-000000000000',
});

describe('AdminPage Promo Codes tab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const open = async (
    routes: Parameters<typeof stubApi>[0] = {},
    all: PromoCodeEntry[] = [unused, redeemed],
  ) => {
    const api = stubApi({
      'GET /api/admin/catalog': () => Response.json(emptyCatalog),
      'GET /api/admin/promo-codes': (url) => {
        const status = url.searchParams.get('status');
        return Response.json({
          entries: all.filter((e) => !status || e.status === status),
          nextCursor: null,
        });
      },
      ...routes,
    });
    vi.stubGlobal('fetch', api.fetchMock);
    renderWithProviders(<AdminPage />, { route: '/admin?tab=codes' });
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Generate' });
    return { user, api };
  };

  it('generates one code of 100 Credits by default', async () => {
    const { user, api } = await open({
      'POST /api/admin/promo-codes': () =>
        Response.json({ codes: ['ZZZZZ-22222'] }, { status: 201 }),
    });
    expect(screen.getByLabelText('How many codes')).toHaveValue(1);
    expect(screen.getByLabelText('Credits per code')).toHaveValue(100);
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('ZZZZZ-22222')).toBeInTheDocument();
    expect(
      api.calls.find((c) => c.key === 'POST /api/admin/promo-codes')?.body,
    ).toEqual({
      count: 1,
      credits: 100,
    });
  });

  it('sends a batch with Credits and a note, and copies all codes', async () => {
    const codes = ['AAAAA-22222', 'BBBBB-33333', 'CCCCC-44444'];
    const { user, api } = await open({
      'POST /api/admin/promo-codes': () =>
        Response.json({ codes }, { status: 201 }),
    });
    const count = screen.getByLabelText('How many codes');
    await user.clear(count);
    await user.type(count, '3');
    const credits = screen.getByLabelText('Credits per code');
    await user.clear(credits);
    await user.type(credits, '0');
    await user.type(screen.getByLabelText('Note (optional)'), 'launch');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    const panel = await screen.findByRole('region', {
      name: 'New Promo Codes',
    });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);
    expect(
      api.calls.find((c) => c.key === 'POST /api/admin/promo-codes')?.body,
    ).toEqual({
      count: 3,
      credits: 0,
      note: 'launch',
    });
    await user.click(within(panel).getByRole('button', { name: 'Copy all' }));
    expect(await navigator.clipboard.readText()).toBe(codes.join('\n'));
    expect(await screen.findByText('3 codes copied')).toBeInTheDocument();
  });

  it('does not send an out-of-range count', async () => {
    const { user, api } = await open();
    const count = screen.getByLabelText('How many codes');
    await user.clear(count);
    await user.type(count, '51');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(api.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('lists codes with status, Credits, note, redeemer and date, and copies one', async () => {
    const { user } = await open();
    expect(await screen.findByText('ABCDE-FGHJK')).toBeInTheDocument();
    expect(screen.getByText('for Ana')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Redeemed 05\.03\.2026 by Bo bo@example\.com, Family 12345678/,
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Copy code MNPQR-STUVW' }),
    );
    expect(await navigator.clipboard.readText()).toBe('MNPQR-STUVW');
  });

  it('filters by status', async () => {
    const { user, api } = await open();
    await screen.findByText('ABCDE-FGHJK');
    await user.click(screen.getByRole('button', { name: 'Redeemed' }));
    await waitFor(() =>
      expect(screen.queryByText('ABCDE-FGHJK')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('MNPQR-STUVW')).toBeInTheDocument();
    expect(api.calls.some((c) => c.search.includes('status=redeemed'))).toBe(
      true,
    );
  });

  it('shows the error copy when a revoke is refused as not revocable', async () => {
    const { user } = await open({
      'POST /api/admin/promo-codes/p1/revoke': () =>
        Response.json(
          { code: 'promo_code.not_revocable', message: 'no' },
          { status: 409 },
        ),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Revoke code ABCDE-FGHJK' }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Revoke',
      }),
    );
    expect(
      await screen.findByText('Only an unused Promo Code can be revoked.'),
    ).toBeInTheDocument();
  });

  it('offers Revoke on Unused codes only, behind a confirmation', async () => {
    const revoked: string[] = [];
    const { user } = await open({
      'POST /api/admin/promo-codes/p1/revoke': () => {
        revoked.push('p1');
        return Response.json({ ...unused, status: 'revoked' });
      },
    });
    await screen.findByText('ABCDE-FGHJK');
    expect(
      screen.queryByRole('button', { name: 'Revoke code MNPQR-STUVW' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revoke code ABCDE-FGHJK' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(revoked).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(revoked).toEqual([]);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Revoke code ABCDE-FGHJK' }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Revoke',
      }),
    );
    await waitFor(() => expect(revoked).toEqual(['p1']));
  });
});
