import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  DetailEatingMoment,
  DetailPairing,
  RecipeDetail,
  RecipeAllergens,
  RecipeGuidance,
} from '@/lib/recipes';
import { renderWithProviders } from '@/test/render';
import { GuidanceSection } from './GuidanceSection';

const pairing = (over: Partial<DetailPairing>): DetailPairing => ({
  id: 'p',
  kind: 'food',
  label: 'Steamed greens',
  reason: 'Light next to the butter',
  principle: null,
  link: null,
  ...over,
});
const moment = (over: Partial<DetailEatingMoment>): DetailEatingMoment => ({
  eatingMomentId: 'm',
  name: 'Dinner',
  polarity: 'good_for',
  reason: null,
  ...over,
});

function show(
  guidance: Partial<RecipeGuidance>,
  locale: 'en' | 'ro' | 'da' = 'en',
) {
  const full: RecipeGuidance = {
    nutritionNote: null,
    pairings: [],
    eatingMoments: [],
    ...guidance,
  };
  const allergens: RecipeAllergens = { items: [], uncheckedCount: 0 };
  return renderWithProviders(
    <GuidanceSection recipe={{ guidance: full, allergens } as RecipeDetail} />,
    { locale },
  );
}

const DISCLAIMER = 'General guidance, not medical or dietary advice.';

describe('GuidanceSection', () => {
  it('shows only the Allergens card, without the disclaimer, when there is no guidance', () => {
    show({});
    expect(
      screen.getByRole('heading', { name: 'Allergens' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.queryByText(DISCLAIMER)).toBeNull();
  });

  it('groups Pairings as Food and Drink with label, Principle label and reason', () => {
    show({
      pairings: [
        pairing({
          id: '1',
          kind: 'drink',
          label: 'Dry white wine',
          reason: 'Its acidity cuts the butter',
          principle: 'acid_cuts_fat',
        }),
        pairing({ id: '2', kind: 'food', label: 'Steamed greens' }),
        pairing({ id: '3', kind: 'food', label: 'Crusty bread' }),
      ],
    });
    const food = screen.getByRole('list', { name: 'Food' });
    expect(
      within(food)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining('Steamed greens'),
      expect.stringContaining('Crusty bread'),
    ]);
    const drink = within(screen.getByRole('list', { name: 'Drink' }));
    expect(drink.getByText('Dry white wine')).toBeInTheDocument();
    expect(drink.getByText('Acid cuts fat')).toBeInTheDocument();
    expect(drink.getByText('Its acidity cuts the butter')).toBeInTheDocument();
  });

  it('hides a Pairing group that is empty', () => {
    show({ pairings: [pairing({ kind: 'food' })] });
    expect(screen.queryByRole('list', { name: 'Drink' })).toBeNull();
  });

  it('links a Recipe Pairing through to the Recipe', () => {
    show({
      pairings: [
        pairing({
          label: 'A salad',
          link: {
            type: 'recipe',
            id: 'r-1',
            title: 'Green salad',
            owner: 'catalog',
            familyCopyId: 'c-1',
          },
        }),
      ],
    });
    const link = screen.getByRole('link', { name: 'A salad' });
    expect(link).toHaveAttribute('href', '/recipes/c-1');
    expect(link).toHaveAttribute('title', 'Green salad');
    expect(screen.queryByText('Green salad')).toBeNull();
  });

  it('opens the Explore preview for a Catalog Recipe the Family has not added', () => {
    show({
      pairings: [
        pairing({
          label: 'A salad',
          link: {
            type: 'recipe',
            id: 'r-1',
            title: 'Green salad',
            owner: 'catalog',
            familyCopyId: null,
          },
        }),
      ],
    });
    expect(screen.getByRole('link', { name: 'A salad' })).toHaveAttribute(
      'href',
      '/recipes/explore/r-1',
    );
  });

  it('opens a Family Recipe as itself', () => {
    show({
      pairings: [
        pairing({
          label: 'A salad',
          link: { type: 'recipe', id: 'r-2', title: 'Ours', owner: 'family' },
        }),
      ],
    });
    expect(screen.getByRole('link', { name: 'A salad' })).toHaveAttribute(
      'href',
      '/recipes/r-2',
    );
  });

  it('shows a linked Ingredient as plain text', () => {
    show({
      pairings: [
        pairing({
          label: 'Lemon on the side',
          link: { type: 'ingredient', id: 'i-1', name: 'Lemon' },
        }),
      ],
    });
    expect(screen.getByText(/Lemon on the side/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('adds the linked Ingredient name unless the label already has it', () => {
    show({
      pairings: [
        pairing({
          id: '1',
          label: 'A squeeze of citrus',
          link: { type: 'ingredient', id: 'i-1', name: 'Lemon' },
        }),
        pairing({
          id: '2',
          label: 'Fresh LEMON wedges',
          link: { type: 'ingredient', id: 'i-1', name: 'Lemon' },
        }),
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('A squeeze of citrus · Lemon');
    expect(items[1]).not.toHaveTextContent('·');
  });

  it('shows the label only when the link was hidden', () => {
    show({ pairings: [pairing({ label: 'Old side', link: null })] });
    expect(screen.getByText('Old side')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows Good for and Avoid chips with their reasons', () => {
    show({
      eatingMoments: [
        moment({
          eatingMomentId: '1',
          name: 'Dinner',
          reason: 'Filling and warm',
        }),
        moment({
          eatingMomentId: '2',
          name: 'Before bed',
          polarity: 'avoid',
          reason: 'Heavy to sleep on',
        }),
        moment({ eatingMomentId: '3', name: 'Lunch', polarity: 'good_for' }),
      ],
    });
    const chips = screen.getAllByRole('listitem');
    expect(chips.map((chip) => chip.textContent)).toEqual([
      expect.stringContaining('Good for · Dinner'),
      expect.stringContaining('Good for · Lunch'),
      expect.stringContaining('Avoid · Before bed'),
    ]);
    expect(screen.getByText('Filling and warm')).toBeInTheDocument();
    expect(screen.getByText('Heavy to sleep on')).toBeInTheDocument();
  });

  it('puts each When to Eat tag on its own line, the reason under it', () => {
    show({
      eatingMoments: [moment({ name: 'Dinner', reason: 'Filling and warm' })],
    });
    const item = screen.getByRole('listitem');
    const tag = within(item).getByText('Good for · Dinner');
    expect(tag).toHaveStyle({ whiteSpace: 'normal' });
    const reason = within(item).getByText('Filling and warm');
    expect(tag).not.toContainElement(reason);
    expect(
      tag.compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows the Nutrition note, then the disclaimer last', () => {
    show({ nutritionNote: 'Rich in fat; fine as a treat.' });
    const nutrition = screen.getByRole('region', { name: 'Nutrition' });
    expect(
      within(nutrition).getByText('Rich in fat; fine as a treat.'),
    ).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pairings' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'When to eat' })).toBeNull();
  });

  it('shows one disclaimer for all three sections', () => {
    show({
      nutritionNote: 'Note',
      pairings: [pairing({})],
      eatingMoments: [moment({})],
    });
    expect(screen.getAllByText(DISCLAIMER)).toHaveLength(1);
    expect(screen.getAllByRole('region')).toHaveLength(4);
  });

  it('orders Pairings, When to Eat, Nutrition, then the disclaimer', () => {
    show({
      nutritionNote: 'Note',
      pairings: [pairing({})],
      eatingMoments: [moment({})],
    });
    const order = [
      screen.getByRole('heading', { name: 'Pairings' }),
      screen.getByRole('heading', { name: 'When to eat' }),
      screen.getByRole('heading', { name: 'Nutrition' }),
      screen.getByText(DISCLAIMER),
    ];
    order.slice(1).forEach((node, i) => {
      expect(
        order[i]!.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it('uses the Member locale for the fixed strings', () => {
    show(
      {
        nutritionNote: 'Bogat in grasimi.',
        pairings: [pairing({ principle: 'acid_cuts_fat' })],
      },
      'ro',
    );
    expect(screen.getByText('Aciditatea taie grăsimea')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Nutriție' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Recomandări generale, nu sfaturi medicale sau dietetice.',
      ),
    ).toBeInTheDocument();
  });
});
