import { cleanup, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sheet, SheetContainerProvider } from '../index';
import { renderWithTheme as render } from '../test/render';

function Frame() {
  const [box, setBox] = useState<HTMLElement | null>(null);
  return (
    <SheetContainerProvider value={box}>
      <div ref={setBox} data-testid="frame" data-theme="dark">
        {box ? (
          <Sheet open onClose={() => undefined} title="Info">
            Hello
          </Sheet>
        ) : null}
      </div>
    </SheetContainerProvider>
  );
}

describe('SheetContainerProvider', () => {
  afterEach(cleanup);

  it('opens a Sheet inside the provided element, not at the end of the body', () => {
    render(<Frame />);
    expect(
      screen.getByTestId('frame').contains(screen.getByRole('dialog')),
    ).toBe(true);
  });

  it('opens at the end of the body without a provider', () => {
    render(
      <Sheet open onClose={() => undefined} title="Info">
        Hello
      </Sheet>,
    );
    expect(
      screen.getByRole('dialog').closest('.MuiDialog-root')?.parentElement,
    ).toBe(document.body);
  });
});
