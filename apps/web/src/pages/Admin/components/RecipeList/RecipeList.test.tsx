import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminRecipeListItem } from '@/lib/adminRecipes';
import { renderWithProviders, stubApi } from '@/test/render';
import { RecipeList } from './RecipeList';

const recipe = (
  id: string,
  title: string,
  extra: Partial<AdminRecipeListItem> = {},
): AdminRecipeListItem => ({
  id,
  parentId: null,
  title,
  servings: 4,
  difficulty: null,
  archived: false,
  ...extra,
});

describe('RecipeList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('groups Variants under their Base Recipe and marks archived ones', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/admin/recipes': () =>
          Response.json([
            recipe('r2', 'Margherita', { parentId: 'r1' }),
            recipe('r1', 'Pizza'),
            recipe('r3', 'Old stew', { archived: true }),
            recipe('r4', 'Marinara', { parentId: 'r1', archived: true }),
          ]),
      }).fetchMock,
    );
    const onEdit = vi.fn();
    renderWithProviders(<RecipeList onCreate={vi.fn()} onEdit={onEdit} />);
    const user = userEvent.setup();

    const pizza = await screen.findByRole('button', {
      name: 'Edit Recipe Pizza',
    });
    const group = pizza.closest('li') as HTMLElement;
    const variants = within(
      within(group).getByRole('list', { name: 'Variants of Pizza' }),
    );
    expect(variants.getByText('Margherita')).toBeInTheDocument();
    expect(variants.getByText('Marinara')).toBeInTheDocument();
    expect(variants.getByText('Archived')).toBeInTheDocument();
    const stew = screen.getByRole('button', { name: 'Edit Recipe Old stew' });
    expect(within(stew.closest('li') as HTMLElement).getByText('Archived'));

    await user.click(
      variants.getByRole('button', { name: 'Edit Recipe Margherita' }),
    );
    expect(onEdit).toHaveBeenCalledWith('r2');
  });

  it('offers to create a Base Recipe', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ 'GET /api/admin/recipes': () => Response.json([]) }).fetchMock,
    );
    const onCreate = vi.fn();
    renderWithProviders(<RecipeList onCreate={onCreate} onEdit={vi.fn()} />);
    expect(await screen.findByText('No Recipes yet.')).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'New Base Recipe' }));
    expect(onCreate).toHaveBeenCalled();
  });
});
