import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from './render';

function Boom(): never {
  throw new Error('boom from render');
}

describe('renderWithProviders', () => {
  it('lets a render crash propagate instead of showing the default error screen', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderWithProviders(<Boom />)).toThrow('boom from render');
    expect(screen.queryByText(/Unexpected Application Error/)).toBeNull();
    spy.mockRestore();
  });
});
