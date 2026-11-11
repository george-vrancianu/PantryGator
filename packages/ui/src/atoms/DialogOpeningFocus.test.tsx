import { act, cleanup, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../index';
import { renderWithTheme as render } from '../test/render';
import { stubScreen } from '../test/stubScreen';

function open(wide: boolean, kind: 'input' | 'button' | 'none') {
  stubScreen(wide);
  const ref = createRef<HTMLElement>();
  render(
    <Dialog
      open
      onClose={() => undefined}
      title="Review match"
      initialFocus={kind === 'none' ? undefined : ref}
    >
      {kind === 'button' ? (
        <button type="button" ref={ref as React.Ref<HTMLButtonElement>}>
          Target
        </button>
      ) : (
        <input aria-label="Target" ref={ref as React.Ref<HTMLInputElement>} />
      )}
    </Dialog>,
  );
  return screen.getByRole('dialog');
}

describe('Dialog opening focus', () => {
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

  it('keeps focus on the dialog without initialFocus', async () => {
    const dialog = open(true, 'none');
    await entered();
    expect(document.activeElement).toBe(dialog);
  });

  it('focuses the dialog when focus is on the body and there is no target', async () => {
    const dialog = open(true, 'none');
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);
    await entered();
    expect(document.activeElement).toBe(dialog);
  });

  it('on a phone, leaves a text field unfocused', async () => {
    const dialog = open(false, 'input');
    await entered();
    expect(document.activeElement).toBe(dialog);
    expect(document.activeElement).not.toBe(screen.getByLabelText('Target'));
  });

  it('on a phone, focuses a button', async () => {
    open(false, 'button');
    await entered();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Target' }),
    );
  });

  it('from md up, focuses a text field', async () => {
    open(true, 'input');
    await entered();
    expect(document.activeElement).toBe(screen.getByLabelText('Target'));
  });
});
