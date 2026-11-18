import { PocketPantryUiProvider } from '@pocket-pantry/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '../i18n';
import { UNDO_WINDOW_MS, useDeferredRemoval } from './useDeferredRemoval';

const sendOne = vi.fn((_id: string) => Promise.resolve());
const sendMany = vi.fn((_ids: string[]) => Promise.resolve());

/** Three rows; the buttons remove one, two together, or nothing but show the toast text. */
function Harness() {
  const removal = useDeferredRemoval(['rows'], sendOne, sendMany);
  const rows = ['a', 'b', 'c'].filter((id) => !removal.hiddenIds.has(id));
  return (
    <>
      <ul>
        {rows.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
      <button onClick={() => removal.remove('a', 'A')}>remove a</button>
      <button
        onClick={() => removal.removeMany(['a', 'b'], 'Removed 2 expired')}
      >
        remove a and b
      </button>
      <button
        onClick={() => {
          const ids = ['a', 'b'];
          removal.removeMany(ids, 'Removed first');
          removal.removeMany(ids, 'Removed again');
        }}
      >
        remove a and b twice
      </button>
      <button onClick={() => removal.removeMany(['c'], 'Removed c')}>
        remove c
      </button>
    </>
  );
}

function setup() {
  return render(
    <I18nextProvider i18n={createI18n('en')}>
      <QueryClientProvider client={new QueryClient()}>
        <PocketPantryUiProvider>
          <Harness />
        </PocketPantryUiProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const rowsShown = () =>
  screen.queryAllByRole('listitem').map((li) => li.textContent);

describe('useDeferredRemoval, several rows at once', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sendOne.mockClear();
    sendMany.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('announces the Undo toast as a status, not an alert', async () => {
    setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(screen.getByText('remove a'));

    expect(screen.getByRole('status')).toHaveTextContent('Removed A');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides every row under one toast and sends one bulk delete when the window ends', async () => {
    setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(screen.getByText('remove a and b'));

    expect(rowsShown()).toEqual(['c']);
    expect(screen.getAllByText('Removed 2 expired')).toHaveLength(1);
    expect(sendMany).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100));

    expect(sendMany).toHaveBeenCalledExactlyOnceWith(['a', 'b']);
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('brings every row back on Undo and sends nothing', async () => {
    setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(screen.getByText('remove a and b'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100));

    expect(rowsShown()).toEqual(['a', 'b', 'c']);
    expect(sendMany).not.toHaveBeenCalled();
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('(characterisation) treats the same ids passed twice as two removals: Undo brings them back and sends nothing', async () => {
    setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(screen.getByText('remove a and b twice'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    // The second removal replaces the first, which is sent at once.
    expect(sendMany).toHaveBeenCalledExactlyOnceWith(['a', 'b']);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100));

    expect(sendMany).toHaveBeenCalledTimes(1);
  });

  it('only undoes the latest removal: a new one sends the earlier bulk delete at once', async () => {
    setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(screen.getByText('remove a and b'));
    await user.click(screen.getByText('remove c'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(sendMany).toHaveBeenCalledExactlyOnceWith(['a', 'b']);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(rowsShown()).toContain('c');
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100));
    expect(sendMany).toHaveBeenCalledTimes(1);
  });
});

describe('useDeferredRemoval, one row then several', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sendOne.mockClear();
    sendMany.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('sends the single delete when a bulk removal replaces it', async () => {
    setup();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(screen.getByText('remove a'));
    await user.click(screen.getByText('remove c'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(sendOne).toHaveBeenCalledExactlyOnceWith('a');
    expect(sendMany).not.toHaveBeenCalled();
  });
});
