import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { CreditsSection } from './CreditsSection';
import { useRefreshCreditsOnReads } from '@/components/backgroundRead/useRefreshCreditsOnReads';
import { recipeReads } from '@/lib/recipeReads';

/** The Credits panel with the app layout's refresh-on-read hook mounted beside it. */
function CreditsWithRefresh() {
  useRefreshCreditsOnReads();
  return <CreditsSection />;
}

const PRICES = {
  scan: 1,
  voice: 1,
  assistant: 1,
  'link-page': 2,
  'link-text': 1,
  guidance: 1,
  'plate-recipe': 1,
};

type Entry = {
  id: string;
  kind: string;
  readKind: string | null;
  reason: string | null;
  amount: number;
  memberName: string | null;
  formerMember: boolean;
  createdAt: string;
};
let nextId = 0;
const entry = (over: Partial<Entry>): Entry => ({
  id: `e${nextId++}`,
  kind: 'spend',
  readKind: 'scan',
  reason: null,
  amount: -1,
  memberName: 'Ada',
  formerMember: false,
  createdAt: '2026-10-01T10:30:00.000Z',
  ...over,
});
const credits = (over: { balance: number; history?: Entry[] }) => ({
  prices: PRICES,
  lowBalanceThreshold: 10,
  history: [],
  ...over,
});

async function show(body: ReturnType<typeof credits>) {
  const { fetchMock } = stubApi({
    'GET /api/credits': () => Response.json(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(<CreditsSection />);
  await screen.findByText(String(body.balance));
}

describe('CreditsSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the Family Credit Balance', async () => {
    const { fetchMock } = stubApi({
      'GET /api/credits': () => Response.json(credits({ balance: 100 })),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CreditsSection />);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Credits' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByText('Credits left')).toBeInTheDocument();
  });

  it('says "Credit left" for a balance of one', async () => {
    const { fetchMock } = stubApi({
      'GET /api/credits': () => Response.json(credits({ balance: 1 })),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CreditsSection />);

    expect(await screen.findByText('Credit left')).toBeInTheDocument();
  });

  it('shows 0 when the Family has run out', async () => {
    const { fetchMock } = stubApi({
      'GET /api/credits': () => Response.json(credits({ balance: 0 })),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CreditsSection />);

    expect(await screen.findByText('0')).toBeInTheDocument();
  });

  it('shows the error when the balance cannot be loaded', async () => {
    const { fetchMock } = stubApi({
      'GET /api/credits': () =>
        Response.json(
          { code: 'internal_server_error', params: {} },
          { status: 500 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CreditsSection />);

    expect(
      await screen.findByText(
        'Something went wrong on our side. Please try again.',
      ),
    ).toBeInTheDocument();
  });

  describe('low-balance notice', () => {
    const notice = 'Your family is running low on Credits.';

    it('shows at 10', async () => {
      await show(credits({ balance: 10 }));
      expect(screen.getByText(notice)).toBeInTheDocument();
    });

    it('does not show at 11', async () => {
      await show(credits({ balance: 11 }));
      expect(screen.queryByText(notice)).not.toBeInTheDocument();
    });

    it('shows at 0', async () => {
      await show(credits({ balance: 0 }));
      expect(screen.getByText(notice)).toBeInTheDocument();
    });
  });

  describe('history', () => {
    it('says so when there is nothing yet', async () => {
      await show(credits({ balance: 100 }));
      expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
    });

    it('lists a spend by who, what and how much', async () => {
      await show(
        credits({
          balance: 98,
          history: [
            entry({ readKind: 'link-page', amount: -2, memberName: 'Ada' }),
          ],
        }),
      );
      const row = screen.getByText('Recipe from a web page').closest('li');
      expect(row).toHaveTextContent('Ada');
      expect(row).toHaveTextContent('\u22122');
    });

    it('shows a Plate Scan whose dish was written as two spends', async () => {
      await show(
        credits({
          balance: 98,
          history: [
            entry({ readKind: 'plate-recipe', amount: -1 }),
            entry({ readKind: 'scan', amount: -1 }),
          ],
        }),
      );
      const written = screen
        .getByText('Recipe from a Plate Scan')
        .closest('li');
      const photo = screen.getByText('Scan').closest('li');
      expect(written).not.toBe(photo);
      expect(written).toHaveTextContent('\u22121');
      expect(photo).toHaveTextContent('\u22121');
    });

    it('shows a spend by a departed Member as a former Member', async () => {
      await show(
        credits({
          balance: 99,
          history: [entry({ memberName: null, formerMember: true })],
        }),
      );
      const row = screen.getByText('Scan').closest('li');
      expect(row).toHaveTextContent('former Member');
    });

    it('shows a Welcome Grant by its kind, never as a former Member', async () => {
      await show(
        credits({
          balance: 100,
          history: [
            entry({
              kind: 'welcome_grant',
              readKind: null,
              amount: 100,
              memberName: null,
            }),
          ],
        }),
      );
      const row = screen.getByText('Welcome Grant').closest('li');
      expect(row).toHaveTextContent('+100');
      expect(row).not.toHaveTextContent('former Member');
    });

    it('shows a hand grant with its reason as entered', async () => {
      await show(
        credits({
          balance: 150,
          history: [
            entry({
              kind: 'grant',
              readKind: null,
              reason: 'Beta tester',
              amount: 50,
              memberName: null,
            }),
          ],
        }),
      );
      expect(screen.getByText('Credit Grant: Beta tester')).toBeInTheDocument();
    });

    it('words a transfer by its kind, not by the stored text', async () => {
      await show(
        credits({
          balance: 173,
          history: [
            entry({
              kind: 'transfer_in',
              readKind: null,
              reason: 'Household of One joined the Family',
              amount: 73,
              memberName: 'Joiner',
            }),
          ],
        }),
      );
      expect(screen.getByText('Credits brought by Joiner')).toBeInTheDocument();
      expect(
        screen.queryByText(/Household of One joined/),
      ).not.toBeInTheDocument();
    });

    it('shows a new row and the new balance after a paid read settles', async () => {
      let spent = false;
      const { fetchMock } = stubApi({
        'GET /api/credits': () =>
          Response.json(
            spent
              ? credits({
                  balance: 99,
                  history: [entry({ readKind: 'link-text', amount: -1 })],
                })
              : credits({ balance: 100 }),
          ),
        'POST /api/recipes/from-link': () => {
          spent = true;
          return Response.json({ kind: 'created', recipeDraftId: 'd1' });
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(<CreditsWithRefresh />);
      expect(await screen.findByText('Nothing yet.')).toBeInTheDocument();

      act(() => {
        recipeReads.submit({ kind: 'text', text: 'pasted' }, 'source');
      });

      expect(await screen.findByText('99')).toBeInTheDocument();
      expect(screen.queryByText('Nothing yet.')).not.toBeInTheDocument();
      expect(screen.getByText('Recipe from pasted text')).toBeInTheDocument();
      recipeReads.clear();
    });
  });

  describe('redeeming a Promo Code', () => {
    function stubRedeem(respond: () => Response) {
      let balance = 100;
      const stub = stubApi({
        'GET /api/credits': () =>
          Response.json(
            credits({
              balance,
              history: [
                entry({ kind: 'promo_code', readKind: null, amount: 25 }),
              ],
            }),
          ),
        'POST /api/credits/promo-code': () => {
          const response = respond();
          if (response.ok) balance = 125;
          return response;
        },
      });
      vi.stubGlobal('fetch', stub.fetchMock);
      renderWithProviders(<CreditsSection />);
      return stub;
    }

    it('refreshes the balance, clears the field and shows a toast', async () => {
      const user = userEvent.setup();
      stubRedeem(() => Response.json({ balance: 125, credits: 25 }));
      await screen.findByText('100');
      await user.type(
        screen.getByRole('textbox', { name: 'Promo Code' }),
        'abcde-fghjk',
      );
      await user.click(screen.getByRole('button', { name: 'Redeem' }));
      expect(await screen.findByText('125')).toBeInTheDocument();
      expect(
        screen.getByText('Promo Code redeemed. Credits added: 25'),
      ).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Promo Code' })).toHaveValue(
        '',
      );
    });

    it('shows the error on the field and keeps the code', async () => {
      const user = userEvent.setup();
      stubRedeem(() =>
        Response.json(
          { code: 'promo_code.already_redeemed', params: {} },
          { status: 409 },
        ),
      );
      await screen.findByText('100');
      const field = screen.getByRole('textbox', { name: 'Promo Code' });
      await user.type(field, 'abcde-fghjk');
      await user.click(screen.getByRole('button', { name: 'Redeem' }));
      expect(
        await screen.findByText('That Promo Code has already been used.'),
      ).toBeInTheDocument();
      expect(field).toHaveValue('abcde-fghjk');
      expect(field).toHaveAttribute('aria-invalid', 'true');
    });

    it('shows a 0-Credit Promo Code row as +0', async () => {
      await show(
        credits({
          balance: 5,
          history: [entry({ kind: 'promo_code', readKind: null, amount: 0 })],
        }),
      );
      expect(screen.getByText('+0')).toBeInTheDocument();
      expect(screen.queryByText('\u22120')).not.toBeInTheDocument();
    });

    it('does not submit an empty field', async () => {
      stubRedeem(() => Response.json({ balance: 125, credits: 25 }));
      await screen.findByText('100');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled(),
      );
    });

    it('words a Promo Code history row with the amount and the Member', async () => {
      stubRedeem(() => Response.json({ balance: 125, credits: 25 }));
      await screen.findByText('100');
      expect(
        screen.getByText('Promo Code', { selector: 'p' }),
      ).toBeInTheDocument();
      expect(screen.getByText('+25')).toBeInTheDocument();
      expect(screen.getByText(/^Ada ·/)).toBeInTheDocument();
    });
  });
});
