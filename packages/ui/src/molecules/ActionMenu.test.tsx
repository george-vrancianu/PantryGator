import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithTheme } from '../test/render';
import { ActionMenu } from './ActionMenu';

describe('ActionMenu', () => {
  afterEach(cleanup);

  const open = async (items: Parameters<typeof ActionMenu>[0]['items']) => {
    renderWithTheme(<ActionMenu label="More" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('menu');
  };

  it('shows an item badge after its label', async () => {
    await open([{ label: 'Explore', badge: 'New' }, { label: 'Plain' }]);
    expect(
      screen.getByRole('menuitem', { name: /^Explore\s+New$/ }),
    ).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Plain' }).textContent).toBe(
      'Plain',
    );
  });

  it('marks the current item with aria-current', async () => {
    await open([{ label: 'One', current: true }, { label: 'Two' }]);
    expect(
      screen
        .getByRole('menuitem', { name: 'One' })
        .getAttribute('aria-current'),
    ).toBe('true');
    expect(
      screen
        .getByRole('menuitem', { name: 'Two' })
        .hasAttribute('aria-current'),
    ).toBe(false);
  });

  it('sets an item with dividerBefore apart from the one above', async () => {
    await open([{ label: 'First' }, { label: 'Second', dividerBefore: true }]);
    const margin = (name: string) =>
      getComputedStyle(screen.getByRole('menuitem', { name })).marginTop;
    expect(margin('Second')).toBe('9px');
    expect(margin('First')).not.toBe('9px');
  });
});
