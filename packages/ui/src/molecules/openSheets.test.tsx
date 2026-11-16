import { act, cleanup, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithTheme } from '../test/render';
import { Sheet, useAnySheetOpen } from '../index';

let setOpen: (open: boolean) => void = () => {};

function Probe() {
  const [open, set] = useState(false);
  useEffect(() => {
    setOpen = set;
  }, [set]);
  const any = useAnySheetOpen();
  return (
    <>
      <span data-testid="any">{String(any)}</span>
      <Sheet open={open} onClose={() => set(false)} label="Add items">
        Body
      </Sheet>
    </>
  );
}

describe('useAnySheetOpen', () => {
  afterEach(cleanup);

  it('is true while a Sheet is open and false again once it closes', () => {
    renderWithTheme(<Probe />);
    expect(screen.getByTestId('any').textContent).toBe('false');
    act(() => setOpen(true));
    expect(screen.getByTestId('any').textContent).toBe('true');
    act(() => setOpen(false));
    expect(screen.getByTestId('any').textContent).toBe('false');
  });
});
