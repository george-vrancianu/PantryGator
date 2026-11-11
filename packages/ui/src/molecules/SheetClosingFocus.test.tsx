import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, Dialog, Sheet } from '../index';
import { renderWithTheme as render } from '../test/render';
import { stubScreen } from '../test/stubScreen';
import { isTextField } from '../theme/focusOpening';

/**
 * A page with a text field and a button that opens a sheet. On iOS a tap on a
 * button does not focus it, so `fireEvent.click` (no focus move) stands in for
 * the tap: the field the Member typed in keeps focus while the sheet opens.
 */
function Page({ dialog = false }: { dialog?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <input aria-label="Search" />
      <button type="button" onClick={() => setOpen(true)}>
        Pick expiry
      </button>
      {dialog ? (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Expiry"
          actions={<Button onClick={() => setOpen(false)}>Done</Button>}
        >
          Pick a date
        </Dialog>
      ) : (
        <Sheet open={open} onClose={() => setOpen(false)} label="Expiry">
          <button type="button" onClick={() => setOpen(false)}>
            Done
          </button>
        </Sheet>
      )}
    </>
  );
}

describe('Sheet closing focus', () => {
  const textFocus: string[] = [];
  const record = (event: FocusEvent) => {
    const el = event.target as HTMLElement;
    if (isTextField(el)) textFocus.push(el.getAttribute('aria-label') ?? '?');
  };

  beforeEach(() => {
    vi.useFakeTimers();
    textFocus.length = 0;
    document.addEventListener('focusin', record);
  });

  afterEach(() => {
    document.removeEventListener('focusin', record);
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const settle = () => act(() => vi.advanceTimersByTimeAsync(1000));

  /** Open from the button and close with Done; `tapFocuses` is false for iOS, where a tap does not focus a button. */
  async function openAndClose(tapFocuses: boolean) {
    const opener = screen.getByRole('button', { name: 'Pick expiry' });
    if (tapFocuses) opener.focus();
    fireEvent.click(opener);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await settle();
    return opener;
  }

  it.each([
    ['sheet', false],
    ['dialog', true],
  ])(
    'does not put focus back on a text field when a phone %s closes',
    async (_kind, dialog) => {
      stubScreen(false);
      render(<Page dialog={dialog} />);
      screen.getByRole('textbox', { name: 'Search' }).focus();
      textFocus.length = 0;
      await openAndClose(false);
      expect(textFocus).toEqual([]);
    },
  );

  it('puts focus back on the text field from md up, where no keyboard jumps', async () => {
    stubScreen(true);
    render(<Page />);
    screen.getByRole('textbox', { name: 'Search' }).focus();
    textFocus.length = 0;
    await openAndClose(false);
    expect(textFocus).toEqual(['Search']);
  });

  it('still puts focus back on an opener that took focus', async () => {
    stubScreen(false);
    render(<Page />);
    const opener = await openAndClose(true);
    expect(document.activeElement).toBe(opener);
  });

  it('puts focus back on the opener again after a later open from a focused button', async () => {
    stubScreen(false);
    render(<Page />);
    screen.getByRole('textbox', { name: 'Search' }).focus();
    await openAndClose(false);
    const opener = await openAndClose(true);
    expect(document.activeElement).toBe(opener);
  });
});
