import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Family } from '@/lib/family';
import { renderWithProviders, stubApi } from '@/test/render';
import { FamilyPage } from './FamilyPage';

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const household: Family = {
  id: 'mine',
  inviteCode: 'MYOWNCDE',
  inviteCodeExpiresAt: inDays(5),
  members: [{ id: '1', name: 'Ana', isOwner: true }],
  currentMemberIsOwner: true,
};

const joined: Family = {
  id: 'theirs',
  inviteCode: 'K7M2PQ9X',
  inviteCodeExpiresAt: inDays(5),
  members: [
    { id: '2', name: 'Mihai', isOwner: true },
    { id: '1', name: 'Ana', isOwner: false },
  ],
  currentMemberIsOwner: false,
};

function stub(routes: Record<string, () => Response> = {}) {
  const { fetchMock, calls } = stubApi({
    'GET /api/family': () => Response.json(household),
    'GET /api/family/join-preview': () =>
      Response.json({
        batches: 12,
        shoppingItems: 3,
      }),
    'POST /api/family/join': () => Response.json(joined),
    ...routes,
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('FamilyPage: joining another Family', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('warns what will be deleted, with counts, before joining', async () => {
    const calls = stub();
    renderWithProviders(<FamilyPage />);

    await userEvent.type(
      await screen.findByLabelText('Invite Code', { selector: 'input' }),
      'k7m2pq9x',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check code' }));

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent(
      'Your current Household of One and its Pantry and Shopping data will be deleted. Data is not merged.',
    );
    expect(warning).toHaveTextContent(
      '12 Batches will be deleted. 3 Shopping Items will be deleted.',
    );
    // Nothing is joined until the Member confirms.
    expect(calls.map((c) => c.key)).not.toContain('POST /api/family/join');

    await userEvent.click(
      screen.getByRole('button', { name: 'Join and delete my data' }),
    );
    expect(await screen.findByText('Mihai')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /api/family/join')?.body).toEqual({
      code: 'k7m2pq9x',
    });
    // Now in a Family with others: no more join panel, and a Leave action.
    expect(screen.queryByText('Join another Family')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Leave Family' }),
    ).toBeInTheDocument();
  });

  it('lets the Member back out of the warning', async () => {
    const calls = stub();
    renderWithProviders(<FamilyPage />);

    await userEvent.type(
      await screen.findByLabelText('Invite Code', { selector: 'input' }),
      'K7M2PQ9X',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check code' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    expect(
      screen.getByRole('button', { name: 'Check code' }),
    ).toBeInTheDocument();
    expect(calls.map((c) => c.key)).not.toContain('POST /api/family/join');
  });

  it('translates a rejected code', async () => {
    stub({
      'GET /api/family/join-preview': () =>
        Response.json(
          { code: 'family.invite_code_expired', params: {} },
          { status: 410 },
        ),
    });
    renderWithProviders(<FamilyPage />);

    await userEvent.type(
      await screen.findByLabelText('Invite Code', { selector: 'input' }),
      'OLDCODE2',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That Invite Code has expired. Ask the Owner for a new one.',
    );
    expect(
      screen.queryByRole('button', { name: 'Join and delete my data' }),
    ).not.toBeInTheDocument();
  });

  it('shows the warning in Romanian', async () => {
    stub();
    renderWithProviders(<FamilyPage />, { locale: 'ro' });

    await userEvent.type(
      await screen.findByLabelText('Cod de invitație', { selector: 'input' }),
      'K7M2PQ9X',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Verifică codul' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Se vor șterge 12 Loturi. Se vor șterge 3 Articole din lista de cumpărături.',
    );
  });

  it('offers no join panel to a Member of a Family with others', async () => {
    stub({ 'GET /api/family': () => Response.json(joined) });
    renderWithProviders(<FamilyPage />);
    expect(await screen.findByText('Mihai')).toBeInTheDocument();
    expect(screen.queryByText('Join another Family')).not.toBeInTheDocument();
  });
});

describe('FamilyPage: leaving, removing, transferring and deleting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const owned: Family = {
    ...household,
    members: [
      { id: '1', name: 'Ana', isOwner: true },
      { id: '2', name: 'Mihai', isOwner: false },
    ],
  };

  it('confirms before a Member leaves, then shows the new Household of One', async () => {
    const calls = stub({
      'GET /api/family': () => Response.json(joined),
      'POST /api/family/leave': () => Response.json(household),
    });
    renderWithProviders(<FamilyPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Leave Family' }),
    );
    expect(calls.map((c) => c.key)).not.toContain('POST /api/family/leave');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Join another Family')).toBeInTheDocument();
  });

  it('lets the Owner remove a Member and transfer ownership, but not leave', async () => {
    const calls = stub({
      'GET /api/family': () => Response.json(owned),
      'DELETE /api/family/members/2': () => Response.json(household),
    });
    renderWithProviders(<FamilyPage />);

    expect(
      await screen.findByText(/As Owner you cannot leave/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Leave Family' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Make Mihai the Owner' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Mihai' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Join another Family')).toBeInTheDocument();
    expect(calls.map((c) => c.key)).toContain('DELETE /api/family/members/2');
  });

  it('moves focus to Confirm, and back to the trigger on Cancel', async () => {
    stub({ 'GET /api/family': () => Response.json(owned) });
    renderWithProviders(<FamilyPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete Family' }),
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete Family' })).toHaveFocus();
  });

  it('pluralises the join counts', async () => {
    stub({
      'GET /api/family/join-preview': () =>
        Response.json({
          batches: 1,
          shoppingItems: 1,
        }),
    });
    renderWithProviders(<FamilyPage />);
    await userEvent.type(
      await screen.findByLabelText('Invite Code', { selector: 'input' }),
      'K7M2PQ9X',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 Batch will be deleted. 1 Shopping Item will be deleted.',
    );
  });

  it('lets the Owner delete the Family after confirming', async () => {
    const calls = stub({
      'GET /api/family': () => Response.json(owned),
      'DELETE /api/family': () => Response.json(household),
    });
    renderWithProviders(<FamilyPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete Family' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Every Member, you included, will get a new, empty Household of One.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Join another Family')).toBeInTheDocument();
    expect(calls.map((c) => c.key)).toContain('DELETE /api/family');
  });

  it('shows an Owner-cannot-leave refusal in the Member locale', async () => {
    stub({
      'GET /api/family': () => Response.json(joined),
      'POST /api/family/leave': () =>
        Response.json(
          { code: 'family.owner_cannot_leave', params: {} },
          { status: 409 },
        ),
    });
    renderWithProviders(<FamilyPage />, { locale: 'ro' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Părăsește Familia' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmă' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Proprietarul nu poate pleca.',
    );
  });
});
