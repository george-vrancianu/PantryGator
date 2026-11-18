import { ListRow, ListRowItem } from './ListRow';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithTheme } from '../test/render';

describe('ListRow', () => {
  afterEach(cleanup);

  it('renders each slot inside its list item', () => {
    renderWithTheme(
      <ul>
        <ListRowItem>
          <ListRow
            leading={<span>tick</span>}
            title="Milk"
            meta="2 l"
            tags={<span>new</span>}
            trailing={<button type="button">star</button>}
            below={<p>fields</p>}
          />
        </ListRowItem>
      </ul>,
    );
    const row = screen.getByRole('listitem');
    for (const text of ['tick', 'Milk', '2 l', 'new', 'fields']) {
      expect(within(row).getByText(text)).toBeTruthy();
    }
    expect(within(row).getByRole('button', { name: 'star' })).toBeTruthy();
  });

  it('renders without optional slots', () => {
    renderWithTheme(
      <ul>
        <ListRowItem>
          <ListRow title="Milk" />
        </ListRowItem>
      </ul>,
    );
    expect(screen.getByRole('listitem').textContent).toContain('Milk');
  });
});
