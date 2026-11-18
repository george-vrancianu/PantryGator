import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Family } from '@/lib/family';
import { renderWithProviders, stubApi } from '@/test/render';
import { FamilyPage } from './FamilyPage';

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

function family(overrides: Partial<Family> = {}): Family {
  return {
    id: 'f1',
    inviteCode: 'K7M2PQ9X',
    inviteCodeExpiresAt: inDays(5),
    members: [
      { id: '1', name: 'Ana', isOwner: true },
      { id: '2', name: 'Mihai', isOwner: false },
    ],
    currentMemberIsOwner: true,
    ...overrides,
  };
}

function stubFamily(current: Family, regenerated?: Family) {
  const { fetchMock, calls } = stubApi({
    'GET /api/family': () => Response.json(current),
    'POST /api/family/invite-code/regenerate': () =>
      regenerated
        ? Response.json(regenerated)
        : Response.json(
            { code: 'family.owner_required', params: {} },
            { status: 403 },
          ),
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('FamilyPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the Members with the Owner marked, plus the Invite Code and expiry', async () => {
    stubFamily(family());
    renderWithProviders(<FamilyPage />);

    expect(await screen.findByText('K7M2PQ9X')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'AnaOwner',
      'MihaiMake OwnerRemove',
    ]);
    expect(screen.getByText(/^Expires /)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate a new code' }),
    ).toBeInTheDocument();
  });

  it('lets the Owner regenerate and shows the new code', async () => {
    const calls = stubFamily(family(), family({ inviteCode: 'NEWCODE2' }));
    renderWithProviders(<FamilyPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Generate a new code' }),
    );
    expect(await screen.findByText('NEWCODE2')).toBeInTheDocument();
    expect(screen.queryByText('K7M2PQ9X')).not.toBeInTheDocument();
    expect(calls.map((c) => c.key)).toContain(
      'POST /api/family/invite-code/regenerate',
    );
  });

  it('shows a non-Owner the code but no way to regenerate it', async () => {
    stubFamily(family({ currentMemberIsOwner: false }));
    renderWithProviders(<FamilyPage />);

    expect(await screen.findByText('K7M2PQ9X')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Generate a new code' }),
    ).not.toBeInTheDocument();
  });

  it('marks an expired code and prompts the Owner to regenerate', async () => {
    stubFamily(family({ inviteCodeExpiresAt: inDays(-1) }));
    renderWithProviders(<FamilyPage />);

    expect(await screen.findByText('Expired')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This code has expired. Generate a new one',
    );
    expect(
      screen.getByRole('button', { name: 'Generate a new code' }),
    ).toBeInTheDocument();
  });

  it('tells a non-Owner to ask the Owner when the code has expired', async () => {
    stubFamily(
      family({ inviteCodeExpiresAt: inDays(-1), currentMemberIsOwner: false }),
    );
    renderWithProviders(<FamilyPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ask the Owner to generate a new one',
    );
    expect(
      screen.queryByRole('button', { name: 'Generate a new code' }),
    ).not.toBeInTheDocument();
  });

  it('renders in Romanian', async () => {
    stubFamily(family({ inviteCodeExpiresAt: inDays(-1) }), undefined);
    renderWithProviders(<FamilyPage />, { locale: 'ro' });

    expect(await screen.findByText('Expirat')).toBeInTheDocument();
    expect(screen.getByText('Membri')).toBeInTheDocument();
    expect(screen.getByText('Cod de invitație')).toBeInTheDocument();
    expect(screen.getByText('Proprietar')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Acest cod a expirat. Generează unul nou',
    );
    expect(
      screen.getByRole('button', { name: 'Generează un cod nou' }),
    ).toBeInTheDocument();
  });

  it('renders a live Romanian expiry date', async () => {
    stubFamily(family());
    renderWithProviders(<FamilyPage />, { locale: 'ro' });
    expect(await screen.findByText(/^Expiră pe /)).toBeInTheDocument();
  });

  it('explains an Owner-only refusal in the Member locale', async () => {
    stubFamily(family());
    renderWithProviders(<FamilyPage />, { locale: 'ro' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Generează un cod nou' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Doar Proprietarul Familiei poate face asta.',
    );
  });
});
