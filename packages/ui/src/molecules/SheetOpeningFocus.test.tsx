import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '../index';
import { renderWithTheme as render } from '../test/render';
import { stubScreen } from '../test/stubScreen';

function open(initialFocus: React.RefObject<HTMLElement | null> | undefined) {
  render(
    <Sheet
      open
      onClose={() => undefined}
      label="Add items"
      initialFocus={initialFocus}
    >
      <button type="button">First</button>
      <input aria-label="Search" />
    </Sheet>,
  );
}

describe('Sheet opening focus', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  /** Let the open transition end. */
  const entered = () => act(() => vi.advanceTimersByTimeAsync(1000));

  it('keeps focus on the sheet without initialFocus', async () => {
    stubScreen(true);
    open(undefined);
    const sheet = screen.getByRole('dialog', { name: 'Add items' });
    await entered();
    expect(document.activeElement).toBe(sheet);
  });

  function withTarget(wide: boolean, kind: 'input' | 'button' | 'heading') {
    stubScreen(wide);
    const ref = createRef<HTMLElement>();
    render(
      <Sheet
        open
        onClose={() => undefined}
        label="Add items"
        initialFocus={ref}
      >
        {kind === 'input' ? (
          <input aria-label="Target" ref={ref as React.Ref<HTMLInputElement>} />
        ) : kind === 'button' ? (
          <button type="button" ref={ref as React.Ref<HTMLButtonElement>}>
            Target
          </button>
        ) : (
          <h2 tabIndex={-1} ref={ref as React.Ref<HTMLHeadingElement>}>
            Target
          </h2>
        )}
      </Sheet>,
    );
    return screen.getByRole('dialog', { name: 'Add items' });
  }

  it('on a phone, leaves a text field unfocused and focus on the sheet', async () => {
    const sheet = withTarget(false, 'input');
    await entered();
    expect(document.activeElement).toBe(sheet);
    expect(document.activeElement).not.toBe(screen.getByLabelText('Target'));
  });

  it('on a phone, focuses a button', async () => {
    withTarget(false, 'button');
    await entered();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Target' }),
    );
  });

  it('on a phone, focuses a title', async () => {
    withTarget(false, 'heading');
    await entered();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Target' }),
    );
  });

  it('from md up, focuses a text field', async () => {
    withTarget(true, 'input');
    await entered();
    expect(document.activeElement).toBe(screen.getByLabelText('Target'));
  });

  it('leaves focus alone when it already moved inside', async () => {
    stubScreen(true);
    const ref = createRef<HTMLElement>();
    render(
      <Sheet
        open
        onClose={() => undefined}
        label="Add items"
        initialFocus={ref}
      >
        <input aria-label="Other" autoFocus />
        <button type="button" ref={ref as React.Ref<HTMLButtonElement>}>
          Target
        </button>
      </Sheet>,
    );
    await entered();
    expect(document.activeElement).toBe(screen.getByLabelText('Other'));
  });

  it('moves focus to the target when a tap on the scrim left it on the page body', async () => {
    stubScreen(true);
    const ref = createRef<HTMLElement>();
    render(
      <Sheet
        open
        onClose={() => undefined}
        label="Add items"
        initialFocus={ref}
      >
        <button type="button" ref={ref as React.Ref<HTMLButtonElement>}>
          Target
        </button>
      </Sheet>,
    );
    // The Member taps the scrim before the slide-in ends: focus leaves the paper for the body.
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);
    await entered();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Target' }),
    );
  });

  it('focuses the sheet when a scrim tap left focus on the body and there is no target', async () => {
    stubScreen(true);
    open(undefined);
    const sheet = screen.getByRole('dialog', { name: 'Add items' });
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);
    await entered();
    expect(document.activeElement).toBe(sheet);
  });

  it('on a phone, focuses the sheet instead of a text field when focus is on the body', async () => {
    const sheet = withTarget(false, 'input');
    act(() => (document.activeElement as HTMLElement).blur());
    await entered();
    expect(document.activeElement).toBe(sheet);
  });

  it('Tab from the sheet reaches the first control', async () => {
    // user-event awaits real timers; the sheet is waited for with waitFor.
    vi.useRealTimers();
    stubScreen(false);
    open(undefined);
    const sheet = screen.getByRole('dialog', { name: 'Add items' });
    await waitFor(() => expect(document.activeElement).toBe(sheet));
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'First' }),
    );
  });
});
