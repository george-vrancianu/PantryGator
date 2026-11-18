import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '../index';
import { authoredCss } from '../test/authoredCss';
import { renderWithTheme as render } from '../test/render';
import { stubScreen } from '../test/stubScreen';

const noop = () => undefined;

describe('Sheet toolbar', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const renderWithToolbar = () => {
    stubScreen(false);
    render(
      <Sheet
        open
        onClose={noop}
        title="Pick a Recipe"
        toolbar={<input aria-label="Search" />}
      >
        <p>Results</p>
      </Sheet>,
    );
    return {
      title: screen.getByRole('heading', { name: 'Pick a Recipe' }),
      search: screen.getByRole('textbox', { name: 'Search' }),
      results: screen.getByText('Results'),
    };
  };

  it('draws the toolbar between the title row and the content', () => {
    const { title, search, results } = renderWithToolbar();
    expect(
      title.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      search.compareDocumentPosition(results) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the toolbar outside the scroll region', () => {
    const { search, results } = renderWithToolbar();
    const scroller = results.parentElement!;
    expect(authoredCss(scroller)).toContain('overflow-y:auto');
    expect(scroller.contains(search)).toBe(false);
    const bar = search.parentElement!;
    expect(authoredCss(bar)).not.toContain('overflow-y:auto');
    expect(authoredCss(bar)).toContain('flex-shrink:0');
  });

  it('owns the toolbar fill, padding and divider', () => {
    const { search } = renderWithToolbar();
    const css = authoredCss(search.parentElement!);
    expect(css).toMatch(/background:[^;]*sheet-bg/);
    expect(css).toContain('padding-left:16px');
    expect(css).toContain('padding-right:16px');
    expect(css).toContain('border-bottom:');
  });

  it('draws nothing extra without a toolbar', () => {
    stubScreen(false);
    render(
      <Sheet open onClose={noop} title="Plain">
        <p>Results</p>
      </Sheet>,
    );
    expect(document.querySelector('[data-sheet-toolbar]')).toBeNull();
  });
});

describe('Sheet disabled alternatives', () => {
  afterEach(cleanup);

  it('disables the secondary and does not call it', () => {
    const clear = vi.fn();
    render(
      <Sheet
        open
        onClose={noop}
        title="Tags"
        primary={{ label: 'Done', onClick: noop }}
        secondary={{ label: 'Clear', onClick: clear, disabled: true }}
      >
        Body
      </Sheet>,
    );
    const button = screen.getByRole('button', {
      name: 'Clear',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(clear).not.toHaveBeenCalled();
  });

  it('keeps the secondary enabled by default', () => {
    render(
      <Sheet
        open
        onClose={noop}
        title="Tags"
        primary={{ label: 'Done', onClick: noop }}
        secondary={{ label: 'Clear', onClick: noop }}
      >
        Body
      </Sheet>,
    );
    expect(
      (screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('disables the destructive link and does not call it', () => {
    const remove = vi.fn();
    render(
      <Sheet
        open
        onClose={noop}
        title="Slot"
        primary={{ label: 'Change Recipe', onClick: noop }}
        destructive={{
          label: 'Clear this meal',
          onClick: remove,
          disabled: true,
        }}
      >
        Body
      </Sheet>,
    );
    const link = screen.getByRole('button', {
      name: 'Clear this meal',
    }) as HTMLButtonElement;
    expect(link.disabled).toBe(true);
    fireEvent.click(link);
    expect(remove).not.toHaveBeenCalled();
  });

  it('disables a destructive link on a sheet with no footer', () => {
    render(
      <Sheet
        open
        onClose={noop}
        title="Slot"
        destructive={{
          label: 'Clear this meal',
          onClick: noop,
          disabled: true,
        }}
      >
        Body
      </Sheet>,
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Clear this meal',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
