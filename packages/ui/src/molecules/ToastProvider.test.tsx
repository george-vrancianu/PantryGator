import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToast, writeAppearance, type ThemeId } from '../index';
import {
  highestFloor,
  composeToastBottom,
  useToastFloor,
  useToastHost,
} from './ToastProvider';
import { paintedColour } from '../test/colour';
import { renderWithTheme as render } from '../test/render';

function ShowToast() {
  const toast = useToast();
  return (
    <button
      onClick={() =>
        toast.show('Saved “Weekly shop”', {
          action: { label: 'Edit', onClick: () => undefined },
        })
      }
    >
      show
    </button>
  );
}

describe('Toasts', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const showIn = (theme: ThemeId) => {
    writeAppearance({ theme, matchSystem: false });
    render(<ShowToast />);
    act(() => fireEvent.click(screen.getByText('show')));
    const message = screen.getByText('Saved “Weekly shop”');
    return {
      toast: message.closest<HTMLElement>('.MuiSnackbarContent-root')!,
      action: screen.getByRole('button', { name: 'Edit' }),
    };
  };

  it('is dark ink with a butter action in Warm editorial', () => {
    const { toast, action } = showIn('warm');
    expect(paintedColour(toast, 'background-color')).toBe('#2B2418');
    expect(paintedColour(toast, 'color')).toBe('#FBF8F1');
    expect(paintedColour(action, 'color')).toBe('#F0C96B');
  });

  it('is a light toast in Dark-first', () => {
    const { toast, action } = showIn('dark');
    expect(paintedColour(toast, 'background-color')).toBe('#ECF2EC');
    expect(paintedColour(toast, 'color')).toBe('#0F1512');
    expect(paintedColour(action, 'color')).toBe('#1E7A4E');
  });

  it('dismiss() closes the showing toast and runs its onClose', () => {
    let closed = false;
    function Dismissable() {
      const toast = useToast();
      return (
        <>
          <button
            onClick={() =>
              toast.show('Added', {
                polite: true,
                onClose: () => {
                  closed = true;
                },
              })
            }
          >
            show
          </button>
          <button onClick={() => toast.dismiss()}>hide</button>
        </>
      );
    }
    render(<Dismissable />);
    act(() => fireEvent.click(screen.getByText('show')));
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => fireEvent.click(screen.getByText('hide')));
    expect(closed).toBe(true);
  });

  it('shows a second line under the message when given a detail', () => {
    function Detailed() {
      const toast = useToast();
      return (
        <button
          onClick={() =>
            toast.show('2 applied', {
              detail: 'Bread was already ticked, so that one counts as done.',
              polite: true,
            })
          }
        >
          show
        </button>
      );
    }
    render(<Detailed />);
    act(() => fireEvent.click(screen.getByText('show')));
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(
      '2 appliedBread was already ticked, so that one counts as done.',
    );
    expect(screen.getByText('2 applied')).not.toBe(
      screen.getByText(/Bread was already ticked/),
    );
  });

  it('takes the Theme control radius and float shadow', () => {
    const { toast } = showIn('minimal');
    expect(getComputedStyle(toast).borderRadius).toBe('var(--pp-r-ctl)');
    expect(getComputedStyle(toast).boxShadow).toBe('var(--pp-shadow-float)');
  });
});

describe('Toast hosts', () => {
  afterEach(cleanup);

  function Modal({ name, children }: { name: string; children?: ReactNode }) {
    const [element, setElement] = useState<HTMLElement | null>(null);
    useToastHost(element);
    return (
      <div data-testid={name} ref={setElement}>
        {children}
      </div>
    );
  }

  it('goes back to the outer modal when the modal opened over it closes', () => {
    function App() {
      const [innerOpen, setInnerOpen] = useState(false);
      const toast = useToast();
      return (
        <>
          <Modal name="outer">
            {innerOpen ? <Modal name="inner" /> : null}
          </Modal>
          <button onClick={() => setInnerOpen(true)}>open inner</button>
          <button onClick={() => setInnerOpen(false)}>close inner</button>
          <button onClick={() => toast.show('Saved')}>show</button>
        </>
      );
    }
    render(<App />);
    act(() => fireEvent.click(screen.getByText('open inner')));
    act(() => fireEvent.click(screen.getByText('close inner')));
    act(() => fireEvent.click(screen.getByText('show')));

    expect(
      screen.getByTestId('outer').contains(screen.getByText('Saved')),
    ).toBe(true);
  });
});

describe('Toast floors', () => {
  afterEach(cleanup);

  function Floor({ bottom }: { bottom: number | string | null }) {
    useToastFloor(bottom);
    return null;
  }

  function Modal({ children }: { children?: ReactNode }) {
    const [element, setElement] = useState<HTMLElement | null>(null);
    useToastHost(element);
    return <div ref={setElement}>{children}</div>;
  }

  function Harness({
    floors,
    bottom,
    modal = false,
  }: {
    floors: Array<number | string | null>;
    bottom?: number | string;
    modal?: boolean;
  }) {
    const toast = useToast();
    return (
      <>
        {floors.map((floor, i) => (
          <Floor key={i} bottom={floor} />
        ))}
        {modal ? <Modal /> : null}
        <button onClick={() => toast.show('Saved', { polite: true, bottom })}>
          show
        </button>
      </>
    );
  }

  const bottomOf = () => {
    act(() => fireEvent.click(screen.getByText('show')));
    return snackbarCss();
  };

  /** The snackbar's emotion CSS (jsdom's computed style drops `calc()` and `max()`). */
  const snackbarCss = () => {
    const el = screen
      .getByText('Saved')
      .closest<HTMLElement>('.MuiSnackbar-root')!;
    const own = [...el.classList].filter((c) => c.startsWith('css-'));
    return [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .map((rule) => rule.cssText)
      .filter((css) => own.some((c) => css.includes(`.${c}`)))
      .join('\n');
  };

  // jsdom's CSS parser drops `max()` declarations, so these check the floor by whether the Dock-relative
  // `calc()` survives; `composeToastBottom` below checks the composed values.
  it('sits just above the Dock with no floor', () => {
    render(<Harness floors={[null]} />);
    expect(bottomOf()).toContain('bottom: calc(100px');
  });

  it('is lifted while a floor is registered', () => {
    render(<Harness floors={[120]} />);
    expect(bottomOf()).not.toContain('bottom: calc(100px');
  });

  it('ignores the floor when hosted in a modal', () => {
    render(<Harness floors={[120]} modal />);
    expect(bottomOf()).toContain('bottom: calc(100px');
  });

  it('drops back when the floor is cleared, and moves with a transition', () => {
    const { rerender } = render(<Harness floors={[120]} />);
    expect(bottomOf()).not.toContain('bottom: calc(100px');
    const snackbar = screen
      .getByText('Saved')
      .closest<HTMLElement>('.MuiSnackbar-root')!;
    expect(getComputedStyle(snackbar).transition).toContain('bottom');
    rerender(<Harness floors={[null]} />);
    expect(snackbarCss()).toContain('bottom: calc(100px');
  });

  it('keeps the lift while another floor is registered, and drops back once all are gone', () => {
    const { rerender } = render(<Harness floors={[120, 200]} />);
    expect(bottomOf()).not.toContain('bottom: calc(100px');
    // Removing the higher floor leaves the lower one in force.
    rerender(<Harness floors={[120, null]} />);
    expect(snackbarCss()).not.toContain('bottom: calc(100px');
    rerender(<Harness floors={[null, null]} />);
    expect(snackbarCss()).toContain('bottom: calc(100px');
  });

  it('does not animate the move under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    try {
      render(<Harness floors={[120]} />);
      bottomOf();
      const snackbar = screen
        .getByText('Saved')
        .closest<HTMLElement>('.MuiSnackbar-root')!;
      expect(getComputedStyle(snackbar).transition).toMatch(/none/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('composeToastBottom', () => {
  it('is the Dock spot with no floor', () => {
    expect(composeToastBottom(undefined, null).xs).toMatch(/^calc\(.*env\(/);
  });

  it('keeps the Dock spot as a minimum under the floor plus the 8px gap', () => {
    expect(composeToastBottom(undefined, '120px')).toMatchObject({
      xs: expect.stringMatching(
        /^max\(calc\(.*env\(.*\), calc\(120px \+ 8px\)\)$/,
      ),
    });
  });

  it('takes the higher of the caller bottom and the floor, per breakpoint', () => {
    expect(composeToastBottom(200, '120px')).toEqual({
      xs: 'max(200px, calc(120px + 8px))',
      sm: 'max(200px, calc(120px + 8px))',
    });
    expect(composeToastBottom({ xs: 10, md: '30px' }, '50px')).toEqual({
      xs: 'max(10px, calc(50px + 8px))',
      sm: 'max(10px, calc(50px + 8px))',
      md: 'max(30px, calc(50px + 8px))',
    });
  });
});

describe('highestFloor', () => {
  it('is the highest of several floors, or none', () => {
    expect(highestFloor([])).toBeNull();
    expect(highestFloor(['80px'])).toBe('80px');
    expect(highestFloor(['80px', '140px'])).toBe('max(80px, 140px)');
  });
});
