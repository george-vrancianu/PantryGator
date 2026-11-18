import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Family } from '@/lib/family';
import { renderWithProviders, stubApi } from '@/test/render';
import { FamilyTab } from './FamilyTab';

// The device's "today" is fixed so days-left and expiry tags are deterministic.
const NOW = new Date(2026, 9, 14, 12);
const at = (day: number, hour = 12) =>
  new Date(2026, 9, day, hour).toISOString();

function family(overrides: Partial<Family> = {}): Family {
  return {
    id: 'f1',
    inviteCode: 'K7M2PQ9X',
    inviteCodeExpiresAt: at(19),
    members: [
      { id: '1', name: 'Ana', isOwner: true },
      { id: '2', name: 'Mihai', isOwner: false },
    ],
    currentMemberIsOwner: true,
    ...overrides,
  };
}

const CREDITS = {
  balance: 100,
  prices: {},
  lowBalanceThreshold: 10,
  history: [],
};

type StubOptions = {
  family?: Family;
  threshold?: number;
  saveStatus?: number;
  /** Answers each PATCH in turn, replacing `saveStatus`. */
  patch?: () => Promise<Response>;
};

function stubFamilyTab({
  family: current = family(),
  threshold = 7,
  saveStatus = 200,
  patch,
}: StubOptions = {}) {
  const { fetchMock, calls } = stubApi({
    'GET /api/family': () => Response.json(current),
    'GET /api/credits': () => Response.json(CREDITS),
    'GET /api/catalog/family': () =>
      Response.json({ ingredients: [], synonyms: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: threshold, expiryOverrides: [] }),
    'PATCH /api/settings/family': () =>
      patch
        ? patch()
        : saveStatus === 200
          ? Response.json({})
          : Response.json(
              { code: 'internal_server_error', params: {} },
              { status: saveStatus },
            ),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const patches = (calls: { key: string; body: unknown }[]) =>
  calls.filter((call) => call.key === 'PATCH /api/settings/family');

describe('FamilyTab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the Family intro under the Family card', async () => {
    stubFamilyTab();
    renderWithProviders(<FamilyTab />);

    const lastOfCard = await screen.findByRole('link', {
      name: 'Members and invites',
    });
    const intro = screen.getByText(
      'Everyone in the family shares these. Any member can change them.',
    );
    expect(
      lastOfCard.compareDocumentPosition(intro) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  describe('Family card', () => {
    it('shows skeleton rows while the Family loads', () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>(() => {})),
      );
      renderWithProviders(<FamilyTab />, { route: '/settings?tab=family' });

      expect(
        screen.getAllByRole('status', { name: 'Loading' }),
      ).not.toHaveLength(0);
      expect(screen.queryByText('Your family')).toBeNull();
    });

    it('shows the title, member count and the viewer as Owner', async () => {
      stubFamilyTab();
      renderWithProviders(<FamilyTab />);

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Your family' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/You are the Owner/)).toBeInTheDocument();
      expect(screen.getByText(/2 members/)).toBeInTheDocument();
    });

    it('shows a Member their role without the Owner line', async () => {
      stubFamilyTab({ family: family({ currentMemberIsOwner: false }) });
      renderWithProviders(<FamilyTab />);

      expect(await screen.findByText(/You are a Member/)).toBeInTheDocument();
      expect(screen.queryByText(/You are the Owner/)).toBeNull();
    });

    it('shows up to four member avatars and "+n" for the rest', async () => {
      stubFamilyTab({
        family: family({
          members: ['Ana', 'Mihai', 'Ioana', 'Radu', 'Elena', 'Dan'].map(
            (name, index) => ({
              id: String(index),
              name,
              isOwner: index === 0,
            }),
          ),
        }),
      });
      renderWithProviders(<FamilyTab />);

      expect(await screen.findByText('+2')).toBeInTheDocument();
      expect(screen.getByText(/6 members/)).toBeInTheDocument();
      const avatars = screen.getByText('+2').parentElement;
      expect(avatars?.querySelectorAll('[data-avatar]')).toHaveLength(4);
    });

    it('shows the invite code in groups of four with its days left', async () => {
      stubFamilyTab();
      renderWithProviders(<FamilyTab />);

      expect(await screen.findByText('K7M2 PQ9X')).toBeInTheDocument();
      expect(screen.getByText(/expires in 5 days/)).toBeInTheDocument();
    });

    it('reads "expires today" on the last day of the code', async () => {
      stubFamilyTab({ family: family({ inviteCodeExpiresAt: at(14, 20) }) });
      renderWithProviders(<FamilyTab />);

      expect(await screen.findByText(/expires today/)).toBeInTheDocument();
    });

    it('copies the raw code and shows "Invite code copied"', async () => {
      stubFamilyTab();
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      // Spy after setup: userEvent installs its own clipboard on navigator.
      const writeText = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue(undefined);
      renderWithProviders(<FamilyTab />);

      await user.click(
        await screen.findByRole('button', { name: 'Copy invite code' }),
      );
      expect(writeText).toHaveBeenCalledWith('K7M2PQ9X');
      expect(await screen.findByText('Invite code copied')).toBeInTheDocument();
    });

    it('selects the code when the clipboard is unavailable', async () => {
      stubFamilyTab();
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
        new Error('denied'),
      );
      renderWithProviders(<FamilyTab />);

      await user.click(
        await screen.findByRole('button', { name: 'Copy invite code' }),
      );
      await vi.waitFor(() =>
        expect(window.getSelection()?.toString()).toBe('K7M2 PQ9X'),
      );
      expect(screen.queryByText('Invite code copied')).toBeNull();
    });

    it('shows the expired tag and a New code link to the Family page for the Owner', async () => {
      stubFamilyTab({ family: family({ inviteCodeExpiresAt: at(13) }) });
      renderWithProviders(<FamilyTab />);

      expect(await screen.findByText('Expired')).toBeInTheDocument();
      expect(
        screen.getByText(
          'This code has expired. Generate a new one to invite someone.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'New code' })).toHaveAttribute(
        'href',
        '/family',
      );
      expect(screen.queryByText('K7M2 PQ9X')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Copy invite code' }),
      ).not.toBeInTheDocument();
    });

    it('asks a Member to ask the Owner for a new code when it has expired', async () => {
      stubFamilyTab({
        family: family({
          inviteCodeExpiresAt: at(13),
          currentMemberIsOwner: false,
        }),
      });
      renderWithProviders(<FamilyTab />);

      expect(
        await screen.findByText(
          'This code has expired. Ask the Owner to generate a new one.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'New code' })).toBeNull();
    });

    it('links "Members and invites" to the Family page', async () => {
      stubFamilyTab();
      renderWithProviders(<FamilyTab />);

      expect(
        await screen.findByRole('link', { name: 'Members and invites' }),
      ).toHaveAttribute('href', '/family');
    });
  });

  describe('Expiring soon', () => {
    it('shows the stored value with its unit and disables minus at one day', async () => {
      stubFamilyTab({ threshold: 1 });
      renderWithProviders(<FamilyTab />);

      const value = await screen.findByRole('group', { name: 'Expiring soon' });
      expect(within(value).getByText('1')).toBeInTheDocument();
      expect(within(value).getByText('day')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'One day fewer' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'One day more' }),
      ).toBeEnabled();
    });

    it('disables plus at thirty days', async () => {
      stubFamilyTab({ threshold: 30 });
      renderWithProviders(<FamilyTab />);

      await screen.findByRole('group', { name: 'Expiring soon' });
      expect(
        screen.getByRole('button', { name: 'One day more' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'One day fewer' }),
      ).toBeEnabled();
    });

    it('shows a stored value above thirty as it is, with plus disabled', async () => {
      stubFamilyTab({ threshold: 45 });
      renderWithProviders(<FamilyTab />);

      const value = await screen.findByRole('group', { name: 'Expiring soon' });
      expect(within(value).getByText('45')).toBeInTheDocument();
      expect(within(value).getByText('days')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'One day more' }),
      ).toBeDisabled();
    });

    it('updates the preview at the unsaved value before saving', async () => {
      const calls = stubFamilyTab({ threshold: 3 });
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      renderWithProviders(<FamilyTab />);

      expect(await screen.findByText('Feta')).toBeInTheDocument();
      expect(screen.getByText('4 d')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'One day more' }));
      expect(screen.getByText('4 d left')).toBeInTheDocument();
      expect(patches(calls)).toHaveLength(0);
    });

    it('sends one save 600 ms after the last tap, then shows "Saved"', async () => {
      const calls = stubFamilyTab({ threshold: 7 });
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      renderWithProviders(<FamilyTab />);

      await screen.findByRole('group', { name: 'Expiring soon' });
      const plus = screen.getByRole('button', { name: 'One day more' });
      await user.click(plus);
      await user.click(plus);
      await user.click(plus);
      expect(
        screen.getByRole('group', { name: 'Expiring soon' }),
      ).toHaveTextContent('10');
      expect(patches(calls)).toHaveLength(0);

      await vi.waitFor(() => expect(patches(calls)).toHaveLength(1), {
        timeout: 2000,
      });
      expect(patches(calls)[0].body).toEqual({ staleThresholdDays: 10 });
      expect(await screen.findByText('Saved')).toBeInTheDocument();
    });

    it('reverts to the saved value and shows the error when the save fails', async () => {
      const calls = stubFamilyTab({ threshold: 7, saveStatus: 500 });
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      renderWithProviders(<FamilyTab />);

      await screen.findByRole('group', { name: 'Expiring soon' });
      await user.click(screen.getByRole('button', { name: 'One day more' }));
      await vi.waitFor(() => expect(patches(calls)).toHaveLength(1), {
        timeout: 2000,
      });
      expect(
        await screen.findByText(
          'Something went wrong on our side. Please try again.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('group', { name: 'Expiring soon' }),
      ).toHaveTextContent('7');
    });

    it('keeps the newer value when an older save fails while the newer one is in flight', async () => {
      const answers: Array<(response: Response) => void> = [];
      const calls = stubFamilyTab({
        threshold: 7,
        patch: () => new Promise((resolve) => answers.push(resolve)),
      });
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      renderWithProviders(<FamilyTab />);

      await screen.findByRole('group', { name: 'Expiring soon' });
      const plus = screen.getByRole('button', { name: 'One day more' });
      await user.click(plus);
      await vi.waitFor(() => expect(patches(calls)).toHaveLength(1), {
        timeout: 2000,
      });
      await user.click(plus);
      await vi.waitFor(() => expect(patches(calls)).toHaveLength(2), {
        timeout: 2000,
      });
      expect(patches(calls)[1].body).toEqual({ staleThresholdDays: 9 });

      answers[0](
        Response.json(
          { code: 'internal_server_error', params: {} },
          { status: 500 },
        ),
      );
      expect(
        await screen.findByText(
          'Something went wrong on our side. Please try again.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('group', { name: 'Expiring soon' }),
      ).toHaveTextContent('9');
    });

    it('sends a pending change when the tab is left before the 600 ms pass', async () => {
      const calls = stubFamilyTab({ threshold: 7 });
      const user = userEvent.setup({
        advanceTimers: (ms) => vi.advanceTimersByTime(ms),
      });
      const { unmount } = renderWithProviders(<FamilyTab />);

      await screen.findByRole('group', { name: 'Expiring soon' });
      await user.click(screen.getByRole('button', { name: 'One day more' }));
      unmount();
      await vi.waitFor(() => expect(patches(calls)).toHaveLength(1));
      expect(patches(calls)[0].body).toEqual({ staleThresholdDays: 8 });
    });
  });
});
