import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowControls } from './RowControls';

const base = {
  moveUp: 'Move up',
  moveDown: 'Move down',
  remove: 'Remove',
  first: false,
  last: false,
  onMoveUp: () => undefined,
  onMoveDown: () => undefined,
  onRemove: () => undefined,
};

describe('RowControls', () => {
  afterEach(cleanup);

  it('calls the matching handler for each button', () => {
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    const onRemove = vi.fn();
    render(
      <RowControls
        {...base}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('marks Move up aria-disabled on the first row and Move down on the last', () => {
    render(<RowControls {...base} first last />);
    expect(
      screen
        .getByRole('button', { name: 'Move up' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: 'Move down' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('leaves out Remove when the row cannot be removed here', () => {
    render(<RowControls {...base} remove={undefined} />);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});
