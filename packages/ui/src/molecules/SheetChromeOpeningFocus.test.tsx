import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '../index';
import { renderWithTheme as render } from '../test/render';
import { stubScreen } from '../test/stubScreen';

describe('Sheet opening focus with the roles chrome (ADR 0039)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([true, false])(
    'keeps focus on the sheet, not the X, without initialFocus (wide: %s)',
    async (wide) => {
      stubScreen(wide);
      render(
        <Sheet open onClose={() => undefined} title="Edit">
          <input aria-label="Name" />
        </Sheet>,
      );
      const sheet = screen.getByRole('dialog', { name: 'Edit' });
      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(document.activeElement).toBe(sheet);
    },
  );
});
