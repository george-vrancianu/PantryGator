import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '@/test/render';
import { FamilyTab } from './FamilyTab';

const ALLERGENS = [
  { id: 'a-gluten', name: 'Gluten' },
  { id: 'a-milk', name: 'Milk' },
  { id: 'a-peanuts', name: 'Peanuts' },
];

type Row = {
  id: string;
  allergen: { id: string; name: string };
  label: string | null;
};
type Members = {
  id: string;
  name: string;
  allergens: { id: string; name: string }[];
}[];

function stubFamilyAllergies(
  initial: Row[] = [],
  members: Members = [],
  addStatus = 201,
) {
  let rows = initial;
  let next = 100;
  const view = () => ({
    allergens: ALLERGENS,
    familyAllergies: rows,
    members,
  });
  const { fetchMock, calls } = stubApi({
    'GET /api/family': () =>
      Response.json({
        id: 'f1',
        inviteCode: 'K7M2PQ9X',
        inviteCodeExpiresAt: new Date(2030, 0, 1).toISOString(),
        members: [{ id: 'u1', name: 'Ana', isOwner: true }],
        currentMemberIsOwner: true,
      }),
    'GET /api/catalog/family': () =>
      Response.json({ ingredients: [], synonyms: [] }),
    'GET /api/settings/family': () =>
      Response.json({ staleThresholdDays: 7, expiryOverrides: [] }),
    'GET /api/settings/family-allergies': () => Response.json(view()),
    'POST /api/settings/family-allergies': () => {
      if (addStatus !== 201) {
        return Response.json(
          { code: 'settings.family_allergy_exists', params: {} },
          { status: addStatus },
        );
      }
      return Response.json(rows.at(-1), { status: 201 });
    },
  });
  const wrapped = (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === 'POST' && path.includes('/family-allergies')) {
      const body = JSON.parse(String(init.body)) as {
        allergenId: string;
        label?: string | null;
      };
      rows = [
        ...rows,
        {
          id: `new-${++next}`,
          allergen: ALLERGENS.find((a) => a.id === body.allergenId)!,
          label: body.label ?? null,
        },
      ];
    }
    if (init?.method === 'DELETE' && path.includes('/family-allergies/')) {
      const id = path.split('/family-allergies/')[1]?.split('?')[0];
      rows = rows.filter((row) => row.id !== id);
      return Promise.resolve(Response.json({ id }));
    }
    return fetchMock(input, init);
  };
  vi.stubGlobal('fetch', wrapped);
  return calls;
}

describe('Settings Family tab: Allergies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const openFamilyAllergies = async () => {
    renderWithProviders(<FamilyTab />);
    return within(
      await screen.findByRole('region', { name: 'Family Allergies' }),
    );
  };

  describe('Family Allergies', () => {
    it('lists each Family Allergy with its label, or "Family" without one', async () => {
      stubFamilyAllergies([
        { id: 'r1', allergen: ALLERGENS[2]!, label: 'Mia' },
        { id: 'r2', allergen: ALLERGENS[1]!, label: null },
      ]);
      const section = await openFamilyAllergies();
      const items = await section.findAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Mia');
      expect(items[0]).toHaveTextContent('Peanuts');
      expect(items[1]).toHaveTextContent('Family');
      expect(items[1]).toHaveTextContent('Milk');
    });

    it('says so when there are none', async () => {
      stubFamilyAllergies();
      const section = await openFamilyAllergies();
      expect(
        await section.findByText('No Family Allergies yet.'),
      ).toBeInTheDocument();
    });

    it('adds one: pick an Allergen, type a label, Add', async () => {
      const user = userEvent.setup();
      const calls = stubFamilyAllergies();
      const section = await openFamilyAllergies();
      await user.click(await section.findByRole('button', { name: 'Peanuts' }));
      await user.type(section.getByLabelText('Label (optional)'), 'Mia');
      await user.click(section.getByRole('button', { name: 'Add' }));

      const post = calls.find(
        (call) => call.key === 'POST /api/settings/family-allergies',
      );
      expect(post?.body).toEqual({ allergenId: 'a-peanuts', label: 'Mia' });
      const item = await section.findByRole('listitem');
      expect(item).toHaveTextContent('Mia');
      expect(item).toHaveTextContent('Peanuts');
      expect(section.getByLabelText('Label (optional)')).toHaveValue('');
    });

    it('cannot add until an Allergen is picked, and allows no label', async () => {
      const user = userEvent.setup();
      const calls = stubFamilyAllergies();
      const section = await openFamilyAllergies();
      const add = await section.findByRole('button', { name: 'Add' });
      expect(add).toBeDisabled();
      await user.click(section.getByRole('button', { name: 'Milk' }));
      await user.click(add);
      await section.findByRole('listitem');
      const post = calls.find((call) => call.key.startsWith('POST'));
      expect(post?.body).toEqual({ allergenId: 'a-milk', label: null });
    });

    it('lets several share an Allergen with different labels', async () => {
      stubFamilyAllergies([
        { id: 'r1', allergen: ALLERGENS[1]!, label: 'Mia' },
        { id: 'r2', allergen: ALLERGENS[1]!, label: 'Leo' },
      ]);
      const section = await openFamilyAllergies();
      expect(await section.findAllByRole('listitem')).toHaveLength(2);
    });

    it('shows an error when the same one is added twice', async () => {
      const user = userEvent.setup();
      stubFamilyAllergies([], [], 409);
      const section = await openFamilyAllergies();
      await user.click(await section.findByRole('button', { name: 'Milk' }));
      await user.click(section.getByRole('button', { name: 'Add' }));
      expect(await section.findByRole('alert')).toBeInTheDocument();
    });

    it('removes one', async () => {
      const user = userEvent.setup();
      stubFamilyAllergies([
        { id: 'r1', allergen: ALLERGENS[2]!, label: 'Mia' },
      ]);
      const section = await openFamilyAllergies();
      await user.click(
        await section.findByRole('button', { name: 'Remove Peanuts for Mia' }),
      );
      await waitFor(() => expect(section.queryByRole('listitem')).toBeNull());
    });
  });

  describe("other Members' Allergies", () => {
    const openMembers = async () => {
      renderWithProviders(<FamilyTab />);
      return within(
        await screen.findByRole('region', { name: "Members' Allergies" }),
      );
    };

    it('shows each other Member with their Allergies, read-only', async () => {
      stubFamilyAllergies(
        [],
        [
          {
            id: 'u2',
            name: 'Mihai',
            allergens: [ALLERGENS[0]!, ALLERGENS[1]!],
          },
          { id: 'u3', name: 'Ioana', allergens: [] },
        ],
      );
      const section = await openMembers();
      const items = await section.findAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Mihai');
      expect(items[0]).toHaveTextContent('Gluten, Milk');
      expect(items[1]).toHaveTextContent('Ioana');
      expect(items[1]).toHaveTextContent('None recorded');
      expect(section.queryByRole('button')).toBeNull();
      expect(section.queryByRole('textbox')).toBeNull();
    });

    it('says each Member sets their own', async () => {
      stubFamilyAllergies([], [{ id: 'u2', name: 'Mihai', allergens: [] }]);
      const section = await openMembers();
      expect(
        await section.findByText(/Each member sets their own/),
      ).toBeInTheDocument();
    });

    it('is absent when the Member is alone in the Family', async () => {
      stubFamilyAllergies();
      renderWithProviders(<FamilyTab />);
      await screen.findByRole('region', { name: 'Family Allergies' });
      expect(
        screen.queryByRole('region', { name: "Members' Allergies" }),
      ).toBeNull();
    });
  });

  it('never calls anyone safe', async () => {
    stubFamilyAllergies([{ id: 'r1', allergen: ALLERGENS[2]!, label: null }]);
    await openFamilyAllergies();
    expect(document.body.textContent).not.toMatch(/\bsafe\b|allergen-free/i);
  });
});
