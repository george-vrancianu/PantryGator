import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, createRef } from 'react';
import { SwipeRow, type SwipeRowHandle } from './SwipeRow';

const labels = {
  question: 'Remove Tomato?',
  context: 'from your list',
  keep: 'Keep',
  remove: 'Remove',
  releaseToDelete: 'Release to delete',
};

function renderRow(onRemove: () => void) {
  return render(
    <ul>
      <SwipeRow name="Tomato" labels={labels} onRemove={onRemove}>
        <span>Tomato</span>
      </SwipeRow>
    </ul>,
  );
}

describe('SwipeRow', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('calls onRemove once, after the collapse', async () => {
    vi.useFakeTimers();
    const onRemove = vi.fn();
    renderRow(onRemove);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Tomato' }), {
      key: 'Delete',
    });
    const remove = screen.getByRole('button', { name: 'Remove' });

    fireEvent.click(remove);
    fireEvent.click(remove);
    expect(onRemove).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('does not call onRemove when the row unmounts mid-collapse', async () => {
    vi.useFakeTimers();
    const onRemove = vi.fn();
    const view = renderRow(onRemove);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Tomato' }), {
      key: 'Delete',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    view.unmount();
    await vi.advanceTimersByTimeAsync(500);

    expect(onRemove).not.toHaveBeenCalled();
  });

  it('opens the editor after a 500 ms hold, and a short press does nothing', async () => {
    vi.useFakeTimers();
    const onEdit = vi.fn();
    render(
      <ul>
        <SwipeRow
          name="Milk"
          labels={labels}
          onRemove={vi.fn()}
          onEdit={onEdit}
        >
          <span>Milk</span>
        </SwipeRow>
      </ul>,
    );
    const content = document.querySelector('[data-swipe-row-content]')!;
    fireEvent.pointerDown(content, { pointerId: 1, clientX: 50, clientY: 20 });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.pointerUp(content, { pointerId: 1, clientX: 50, clientY: 20 });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.pointerDown(content, { pointerId: 2, clientX: 50, clientY: 20 });
    await act(() => vi.advanceTimersByTimeAsync(659));
    expect(onEdit).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  describe('hold circle', () => {
    const renderHoldable = () =>
      render(
        <ul>
          <SwipeRow
            name="Milk"
            labels={labels}
            onRemove={vi.fn()}
            onEdit={vi.fn()}
          >
            <span>Milk</span>
          </SwipeRow>
        </ul>,
      );
    const circle = () => document.querySelector('[data-hold-circle]');
    const content = () => document.querySelector('[data-swipe-row-content]')!;

    it('fades for 250 ms after a hold is let go before it arms, then goes', async () => {
      vi.useFakeTimers();
      renderHoldable();
      fireEvent.pointerDown(content(), {
        pointerId: 1,
        clientX: 50,
        clientY: 20,
      });
      await act(() => vi.advanceTimersByTimeAsync(300));
      expect(circle()).not.toBeNull();
      fireEvent.pointerUp(content(), {
        pointerId: 1,
        clientX: 50,
        clientY: 20,
      });
      expect(circle()).not.toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(249));
      expect(circle()).not.toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(circle()).toBeNull();
    });

    it('fades the cancelled circle from its current size: the grow stays, paused', async () => {
      vi.useFakeTimers();
      renderHoldable();
      fireEvent.pointerDown(content(), {
        pointerId: 1,
        clientX: 50,
        clientY: 20,
      });
      await act(() => vi.advanceTimersByTimeAsync(300));
      const growing = getComputedStyle(
        circle()!.firstElementChild as Element,
      ).animation;
      expect(growing).toContain('pp-hold-grow');
      fireEvent.pointerUp(content(), {
        pointerId: 1,
        clientX: 50,
        clientY: 20,
      });
      const fading = getComputedStyle(
        circle()!.firstElementChild as Element,
      ).animation;
      expect(fading).toMatch(/pp-hold-grow.*forwards paused/);
      expect(fading).toContain('pp-hold-fade');
    });

    it('draws no circle under reduce-motion', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }));
      try {
        renderHoldable();
        fireEvent.pointerDown(content(), {
          pointerId: 1,
          clientX: 50,
          clientY: 20,
        });
        await act(() => vi.advanceTimersByTimeAsync(300));
        fireEvent.pointerUp(content(), {
          pointerId: 1,
          clientX: 50,
          clientY: 20,
        });
        expect(circle()).toBeNull();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('peek', () => {
    const content = () => document.querySelector('[data-swipe-row-content]')!;
    const peeking = () => content().hasAttribute('data-peeking');
    const renderPeek = (peek: boolean, extra = {}) =>
      render(
        <ul>
          <SwipeRow
            name="Tomato"
            labels={labels}
            onRemove={vi.fn()}
            peek={peek}
            {...extra}
          >
            <span>Tomato</span>
          </SwipeRow>
        </ul>,
      );

    it('slides out for 550 ms and then back when peek turns on', () => {
      vi.useFakeTimers();
      const view = renderPeek(false);
      expect(peeking()).toBe(false);
      view.rerender(
        <ul>
          <SwipeRow name="Tomato" labels={labels} onRemove={vi.fn()} peek>
            <span>Tomato</span>
          </SwipeRow>
        </ul>,
      );
      expect(peeking()).toBe(true);
      act(() => vi.advanceTimersByTime(549));
      expect(peeking()).toBe(true);
      act(() => vi.advanceTimersByTime(1));
      expect(peeking()).toBe(false);
    });

    it('peeks once when mounted with peek on, even under StrictMode', () => {
      vi.useFakeTimers();
      render(
        <StrictMode>
          <ul>
            <SwipeRow name="Tomato" labels={labels} onRemove={vi.fn()} peek>
              <span>Tomato</span>
            </SwipeRow>
          </ul>
        </StrictMode>,
      );
      expect(peeking()).toBe(true);
      act(() => vi.advanceTimersByTime(550));
      expect(peeking()).toBe(false);
      act(() => vi.advanceTimersByTime(5000));
      expect(peeking()).toBe(false);
    });

    it('stops at once when a pointer goes down on the row', () => {
      vi.useFakeTimers();
      renderPeek(true);
      expect(peeking()).toBe(true);
      fireEvent.pointerDown(content(), {
        pointerId: 1,
        clientX: 50,
        clientY: 20,
      });
      expect(peeking()).toBe(false);
    });

    it('leaves a confirming row alone', () => {
      vi.useFakeTimers();
      const ref = createRef<SwipeRowHandle>();
      renderPeek(false, { ref });
      act(() => ref.current?.askToRemove());
      expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
      cleanup();
      const again = createRef<SwipeRowHandle>();
      const view = renderPeek(false, { ref: again });
      act(() => again.current?.askToRemove());
      view.rerender(
        <ul>
          <SwipeRow
            ref={again}
            name="Tomato"
            labels={labels}
            onRemove={vi.fn()}
            peek
          >
            <span>Tomato</span>
          </SwipeRow>
        </ul>,
      );
      expect(peeking()).toBe(false);
      expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    });

    it('does not peek under reduce-motion', () => {
      vi.useFakeTimers();
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }));
      try {
        renderPeek(true);
        expect(peeking()).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('does not set state after it unmounts mid-peek', () => {
      vi.useFakeTimers();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const view = renderPeek(true);
      view.unmount();
      act(() => vi.advanceTimersByTime(2000));
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    });
  });

  it('reports a gesture the Member used through onLearned', () => {
    const onLearned = vi.fn();
    render(
      <ul>
        <SwipeRow
          name="Milk"
          labels={labels}
          onRemove={vi.fn()}
          onEdit={vi.fn()}
          onLearned={onLearned}
        >
          <span>Milk</span>
        </SwipeRow>
      </ul>,
    );
    const el = document.querySelector('[data-swipe-row-content]')!;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      width: 350,
      left: 0,
      top: 0,
    } as DOMRect);
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 300, clientY: 20 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 180, clientY: 20 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 180, clientY: 20 });
    expect(onLearned).toHaveBeenCalledOnce();
  });

  it('describes the row and opens its confirmation through the ref', () => {
    const ref = createRef<SwipeRowHandle>();
    render(
      <ul>
        <SwipeRow
          ref={ref}
          name="Milk"
          labels={{ ...labels, hint: 'Swipe left to remove, hold to edit' }}
          onRemove={vi.fn()}
        >
          <span>Milk</span>
        </SwipeRow>
      </ul>,
    );
    const row = screen.getByRole('group', { name: 'Milk' });
    const describedBy = row.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe(
      'Swipe left to remove, hold to edit',
    );
    act(() => ref.current?.askToRemove());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Keep' }),
    );
  });

  it('describes a pressed row as ticked, ahead of the hint', () => {
    render(
      <ul>
        <SwipeRow
          name="Milk"
          labels={{ ...labels, pressed: 'Ticked', hint: 'Swipe to remove' }}
          pressed
          onRemove={vi.fn()}
        >
          <span>Milk</span>
        </SwipeRow>
      </ul>,
    );
    const described = (
      screen
        .getByRole('group', { name: 'Milk' })
        .getAttribute('aria-describedby') ?? ''
    )
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(['Ticked', 'Swipe to remove']);
  });

  describe('custom actions', () => {
    const actions = {
      ...labels,
      editAction: 'Edit Milk',
      removeAction: 'Remove Milk',
    };

    it('offers Edit and Remove as buttons that are not tab stops', () => {
      const onEdit = vi.fn();
      render(
        <ul>
          <SwipeRow
            name="Milk"
            labels={actions}
            onEdit={onEdit}
            onRemove={vi.fn()}
          >
            <span>Milk</span>
          </SwipeRow>
        </ul>,
      );
      const edit = screen.getByRole('button', { name: 'Edit Milk' });
      const remove = screen.getByRole('button', { name: 'Remove Milk' });
      expect(edit.getAttribute('tabindex')).toBe('-1');
      expect(remove.getAttribute('tabindex')).toBe('-1');

      fireEvent.click(edit);
      expect(onEdit).toHaveBeenCalledOnce();
      fireEvent.click(remove);
      expect(
        screen.getByRole('group', { name: 'Remove Tomato?' }),
      ).not.toBeNull();
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Keep' }),
      );
    });

    it('has no Edit without onEdit', () => {
      render(
        <ul>
          <SwipeRow name="Milk" labels={actions} onRemove={vi.fn()}>
            <span>Milk</span>
          </SwipeRow>
        </ul>,
      );
      expect(screen.queryByRole('button', { name: 'Edit Milk' })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Remove Milk' }),
      ).not.toBeNull();
    });
  });

  it('marks a disabled row aria-disabled', () => {
    render(
      <ul>
        <SwipeRow name="Milk" labels={labels} onRemove={vi.fn()} disabled>
          <span>Milk</span>
        </SwipeRow>
      </ul>,
    );
    expect(
      screen.getByRole('group', { name: 'Milk' }).getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('keeps the row on Escape while confirming, even when the row itself has focus', () => {
    render(
      <ul>
        <SwipeRow name="Milk" labels={labels} onRemove={vi.fn()}>
          <span>Milk</span>
        </SwipeRow>
      </ul>,
    );
    const row = screen.getByRole('group', { name: 'Milk' });
    fireEvent.keyDown(row, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Keep' })).not.toBeNull();

    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});
