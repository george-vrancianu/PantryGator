import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '../index';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme as render } from '../test/render';
import { stubScreen } from '../test/stubScreen';

const noop = () => undefined;

describe('Sheet title row, footer and destructive link', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('title row', () => {
    it('names the dialog by its visible title', () => {
      stubScreen(false);
      render(
        <Sheet open onClose={noop} title="Add to Pantry">
          Body
        </Sheet>,
      );
      expect(
        screen.getByRole('dialog', { name: 'Add to Pantry' }),
      ).toBeTruthy();
      expect(
        screen.getByRole('heading', { name: 'Add to Pantry' }),
      ).toBeTruthy();
    });

    it('draws the title at display 25/800', () => {
      stubScreen(false);
      render(
        <Sheet open onClose={noop} title="Add to Pantry">
          Body
        </Sheet>,
      );
      const css = authoredCss(screen.getByRole('heading'));
      expect(css).toContain('font-size:25px');
      expect(css).toContain('font-weight:800');
    });

    it('shows the X when dismissable, and it closes the sheet', () => {
      const onClose = vi.fn();
      render(
        <Sheet open onClose={onClose} title="Edit">
          Body
        </Sheet>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('makes the X a 44 px button', () => {
      render(
        <Sheet open onClose={noop} title="Edit">
          Body
        </Sheet>,
      );
      const css = authoredCss(screen.getByRole('button', { name: 'Close' }));
      expect(css).toContain('width:44px');
      expect(css).toContain('height:44px');
    });

    it('shows no X when the sheet cannot be dismissed', () => {
      render(
        <Sheet open onClose={noop} dismissable={false} title="Review">
          Body
        </Sheet>,
      );
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    });

    it('shows Back and the subtitle when given', () => {
      const onBack = vi.fn();
      render(
        <Sheet
          open
          onClose={noop}
          title="Milk"
          subtitle="Dairy"
          onBack={onBack}
        >
          Body
        </Sheet>,
      );
      expect(screen.getByText('Dairy')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('has no Back or subtitle by default', () => {
      render(
        <Sheet open onClose={noop} title="Milk">
          Body
        </Sheet>,
      );
      expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    });
  });

  describe('footer', () => {
    it('has no footer without actions', () => {
      render(
        <Sheet open onClose={noop} title="Pick">
          Body
        </Sheet>,
      );
      // The X is the only button.
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('calls the primary and the secondary', () => {
      const save = vi.fn();
      const other = vi.fn();
      render(
        <Sheet
          open
          onClose={noop}
          title="Expiry"
          primary={{ label: 'Done', onClick: save }}
          secondary={{ label: 'No expiry', onClick: other }}
        >
          Body
        </Sheet>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      fireEvent.click(screen.getByRole('button', { name: 'No expiry' }));
      expect(save).toHaveBeenCalledTimes(1);
      expect(other).toHaveBeenCalledTimes(1);
    });

    it('puts the secondary before the primary in tab order', async () => {
      const user = userEvent.setup();
      render(
        <Sheet
          open
          onClose={noop}
          title="Expiry"
          primary={{ label: 'Done', onClick: noop }}
          secondary={{ label: 'No expiry', onClick: noop }}
        >
          <button type="button">Content</button>
        </Sheet>,
      );
      const names = screen
        .getAllByRole('button')
        .map((b) => b.textContent || b.getAttribute('aria-label'));
      expect(names.indexOf('No expiry')).toBeLessThan(names.indexOf('Done'));
      screen.getByRole('button', { name: 'Content' }).focus();
      await user.tab();
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'No expiry' }),
      );
      await user.tab();
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Done' }),
      );
    });

    it('lays out secondary and primary in a 1fr/2fr grid, a lone primary full width', () => {
      const { unmount } = render(
        <Sheet
          open
          onClose={noop}
          title="Expiry"
          primary={{ label: 'Done', onClick: noop }}
          secondary={{ label: 'No expiry', onClick: noop }}
        >
          Body
        </Sheet>,
      );
      const row = screen.getByRole('button', { name: 'Done' }).parentElement!;
      expect(authoredCss(row)).toContain('grid-template-columns:1fr 2fr');
      unmount();
      render(
        <Sheet
          open
          onClose={noop}
          title="Expiry"
          primary={{ label: 'Done', onClick: noop }}
        >
          Body
        </Sheet>,
      );
      const lone = screen.getByRole('button', { name: 'Done' }).parentElement!;
      expect(authoredCss(lone)).toContain('grid-template-columns:1fr');
      expect(authoredCss(lone)).not.toContain('2fr');
    });

    it('pads the footer by the bottom safe area', () => {
      render(
        <Sheet
          open
          onClose={noop}
          title="Expiry"
          primary={{ label: 'Done', onClick: noop }}
        >
          Body
        </Sheet>,
      );
      const footer = screen
        .getByRole('button', { name: 'Done' })
        .closest<HTMLElement>('[data-sheet-footer]')!;
      expect(authoredCss(footer)).toContain('env(safe-area-inset-bottom');
    });

    it('pads the bottom safe area on the content when there is no footer', () => {
      render(
        <Sheet open onClose={noop} title="Info">
          <p>Body</p>
        </Sheet>,
      );
      const scroller = screen.getByText('Body').parentElement!;
      expect(authoredCss(scroller)).toContain('env(safe-area-inset-bottom');
    });

    it('does not pad the content again when a footer clears the safe area', () => {
      render(
        <Sheet
          open
          onClose={noop}
          title="Info"
          primary={{ label: 'Done', onClick: noop }}
        >
          <p>Body</p>
        </Sheet>,
      );
      const scroller = screen.getByText('Body').parentElement!;
      expect(authoredCss(scroller)).not.toContain('safe-area-inset-bottom');
    });

    it('draws a single top border on the footer', () => {
      render(
        <Sheet
          open
          onClose={noop}
          title="Expiry"
          primary={{ label: 'Done', onClick: noop }}
        >
          Body
        </Sheet>,
      );
      const footer = screen
        .getByRole('button', { name: 'Done' })
        .closest<HTMLElement>('[data-sheet-footer]')!;
      const css = authoredCss(footer);
      expect(css).toContain('border-top:');
      expect(css).not.toContain('border-bottom');
    });

    it('submits the form in the content from primary.form, and Enter still submits', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn((e: { preventDefault: () => void }) =>
        e.preventDefault(),
      );
      render(
        <Sheet
          open
          onClose={noop}
          title="Edit"
          primary={{ label: 'Save', form: 'edit-form' }}
        >
          <form id="edit-form" onSubmit={onSubmit}>
            <input aria-label="Name" />
          </form>
        </Sheet>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      // One field: user-event's implicit submission only looks for a default button inside the form, so a second field would not submit here even though a browser would (the footer button owns the form through `form`).
      await user.type(screen.getByRole('textbox', { name: 'Name' }), '{Enter}');
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    it('does not submit anything from an onClick primary', () => {
      const onSubmit = vi.fn((e: { preventDefault: () => void }) =>
        e.preventDefault(),
      );
      render(
        <Sheet
          open
          onClose={noop}
          title="Edit"
          primary={{ label: 'Done', onClick: noop }}
        >
          <form onSubmit={onSubmit} />
        </Sheet>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('disables the primary when disabled', () => {
      render(
        <Sheet
          open
          onClose={noop}
          title="Edit"
          primary={{ label: 'Save', onClick: noop, disabled: true }}
          secondary={{ label: 'Clear', onClick: noop }}
        >
          Body
        </Sheet>,
      );
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(
        (screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });

    it('while pending shows a spinner, disables both footer buttons and keeps the X enabled', () => {
      const onClose = vi.fn();
      const save = vi.fn();
      render(
        <Sheet
          open
          onClose={onClose}
          title="Edit"
          primary={{ label: 'Save', onClick: save, pending: true }}
          secondary={{ label: 'Clear', onClick: noop }}
        >
          Body
        </Sheet>,
      );
      const primary = screen.getByRole('button', {
        name: 'Save',
      }) as HTMLButtonElement;
      expect(primary.disabled).toBe(true);
      expect(within(primary).getByRole('progressbar')).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      const x = screen.getByRole('button', {
        name: 'Close',
      }) as HTMLButtonElement;
      expect(x.disabled).toBe(false);
      fireEvent.click(x);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('draws a danger primary in the danger colour', () => {
      render(
        <Sheet
          open
          onClose={noop}
          title="Revoke"
          primary={{ label: 'Revoke', onClick: noop, tone: 'danger' }}
        >
          Body
        </Sheet>,
      );
      const css = authoredCss(screen.getByRole('button', { name: 'Revoke' }));
      expect(css).toContain('background-color:var(--mui-palette-error-main)');
    });

    it('draws a normal primary in the primary colour', () => {
      render(
        <Sheet
          open
          onClose={noop}
          title="Edit"
          primary={{ label: 'Save', onClick: noop }}
        >
          Body
        </Sheet>,
      );
      const css = authoredCss(screen.getByRole('button', { name: 'Save' }));
      expect(css).not.toContain('--mui-palette-error-main');
    });
  });

  describe('destructive link', () => {
    it('renders after the content, outside the footer', () => {
      const remove = vi.fn();
      render(
        <Sheet
          open
          onClose={noop}
          title="Batch"
          primary={{ label: 'Save', onClick: noop }}
          destructive={{ label: 'Remove from Pantry', onClick: remove }}
        >
          <p>Content</p>
        </Sheet>,
      );
      const link = screen.getByRole('button', { name: 'Remove from Pantry' });
      const content = screen.getByText('Content');
      const save = screen.getByRole('button', { name: 'Save' });
      expect(
        content.compareDocumentPosition(link) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        link.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(link.closest('[data-sheet-footer]')).toBeNull();
      fireEvent.click(link);
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('is drawn in danger colour and shows without a footer', () => {
      render(
        <Sheet
          open
          onClose={noop}
          title="Slot"
          destructive={{ label: 'Clear this meal', onClick: noop }}
        >
          Body
        </Sheet>,
      );
      const link = screen.getByRole('button', { name: 'Clear this meal' });
      expect(authoredCss(link)).toContain('--mui-palette-error-main');
    });
  });

  it('renders the same title row and footer as a centred dialog', () => {
    stubScreen(true);
    render(
      <Sheet
        open
        onClose={noop}
        title="Expiry"
        subtitle="Milk"
        primary={{ label: 'Done', onClick: noop }}
        secondary={{ label: 'No expiry', onClick: noop }}
      >
        Body
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Expiry' });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(within(dialog).getByText('Milk')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: 'No expiry' }),
    ).toBeTruthy();
  });

  it('keeps the old label, header and footer working', () => {
    render(
      <Sheet
        open
        onClose={noop}
        label="Old"
        header={<h2>Head</h2>}
        footer={<button type="button">Foot</button>}
      >
        Body
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Old' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Foot' })).toBeTruthy();
    // No new chrome is drawn for an old-style sheet.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('rejects a secondary without a primary, at the type level', () => {
    render(
      // @ts-expect-error a secondary needs a primary (ADR 0043)
      <Sheet
        open
        onClose={noop}
        title="Bad"
        secondary={{ label: 'Alt', onClick: noop }}
      >
        Body
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Bad' })).toBeTruthy();
  });
});
