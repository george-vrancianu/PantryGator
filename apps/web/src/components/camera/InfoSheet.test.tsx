import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { InfoSheet } from './InfoSheet';

describe('InfoSheet focus trap', () => {
  it('ignores tabindex="-1" elements when wrapping Tab', async () => {
    renderWithProviders(<InfoSheet onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    const skipped = document.createElement('div');
    skipped.tabIndex = -1;
    dialog.appendChild(skipped);
    const buttons = dialog.querySelectorAll('button');
    const lastButton = buttons[buttons.length - 1];
    lastButton.focus();
    await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('InfoSheet mode list', () => {
  it('describes the five camera modes in slider order', () => {
    renderWithProviders(<InfoSheet onClose={vi.fn()} />);
    const items = within(
      screen.getByRole('dialog').querySelector('ul') as HTMLElement,
    ).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Receipt'),
      expect.stringContaining('Ingredients'),
      expect.stringContaining('Product'),
      expect.stringContaining('Barcode'),
      expect.stringContaining('Plate'),
    ]);
    // One line each, reusing the mode descriptions.
    expect(items[0]).toHaveTextContent(
      'Adds every item from your shop in one go.',
    );
    expect(items[3]).toHaveTextContent(
      'Point at a barcode; each one is added on its own',
    );
    expect(items[4]).toHaveTextContent(
      'Writes the recipe for the one you pick',
    );
    // Receipt also carries the framing and folding tips.
    expect(items[0]).toHaveTextContent(/40 cm above the receipt/);
    expect(items[0]).toHaveTextContent(/fold where the guide ends/);
    expect(items[2]).not.toHaveTextContent(/40 cm/);
  });
});

describe('InfoSheet copy', () => {
  it.each([
    ['en', /tap the shutter\./, /tap the photos at the bottom left/, 'Got it'],
    ['ro', /atinge declanșatorul/, /fotografiile din stânga jos/, 'Am înțeles'],
    ['da', /tryk på udløseren/, /billederne nederst til venstre/, 'Forstået'],
  ])(
    'says in %s how to scan with the shutter and where the stack is',
    async (language, tap, tip, ok) => {
      const { i18n } = renderWithProviders(<InfoSheet onClose={vi.fn()} />);
      await act(() => i18n.changeLanguage(language));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent(tap);
      expect(dialog).toHaveTextContent(tip);
      expect(within(dialog).getByRole('button', { name: ok })).toBeVisible();
    },
  );
});

describe('InfoSheet focus', () => {
  it('moves focus into the sheet without scrolling the camera', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderWithProviders(<InfoSheet onClose={vi.fn()} />);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });
});
