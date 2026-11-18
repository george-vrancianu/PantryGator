import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RecipeTag } from '@/lib/tags';
import { renderWithProviders } from '@/test/render';
import { RowTags } from './RowTags';

const tag = (id: string, name: string, groupOrder: number): RecipeTag => ({
  id,
  name,
  kind: 'catalog',
  groupId: `g${groupOrder}`,
  groupName: 'Group',
  groupOrder,
});

describe('RowTags', () => {
  it('draws nothing for a Recipe without Tags or meta', () => {
    const { container } = renderWithProviders(<RowTags tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the meta alone when there are no Tags', () => {
    renderWithProviders(<RowTags tags={[]} meta={['Easy']} />);
    expect(screen.getByText('· Easy')).toBeInTheDocument();
  });

  it('names every Tag in one group, in display order', () => {
    renderWithProviders(
      <RowTags
        tags={[tag('b', 'Vegan', 2), tag('a', 'Dinner', 1)]}
        matchedIds={['b']}
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Tags: Vegan, Dinner' }),
    ).toBeInTheDocument();
  });
});
