import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanopySearchField } from '../index';
import { renderWithTheme as render } from '../test/render';

describe('CanopySearchField', () => {
  afterEach(cleanup);

  it('is a named search box that reports what is typed', () => {
    const onChange = vi.fn();
    render(
      <CanopySearchField
        label="Search Pantry"
        placeholder="Search by name"
        value=""
        onChange={onChange}
      />,
    );
    const field = screen.getByRole('searchbox', { name: 'Search Pantry' });
    fireEvent.change(field, { target: { value: 'milk' } });
    expect(onChange).toHaveBeenCalledWith('milk');
  });
});
