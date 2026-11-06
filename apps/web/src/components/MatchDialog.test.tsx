import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubApi } from '../test/render';
import { stubViewport } from '../test/viewport';
import { MatchDialog } from './MatchDialog';

function open() {
  const { fetchMock } = stubApi({
    'GET /api/catalog/search': () => Response.json({ results: [] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <MatchDialog
      open
      name="Milk"
      onSelect={() => undefined}
      onClose={() => undefined}
    />,
  );
  return screen.getByRole('dialog');
}

describe('MatchDialog opening focus (ADR 0039)', () => {
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

  it('from md up, focuses the search field', async () => {
    stubViewport(1024);
    open();
    await entered();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('on a phone, keeps focus on the dialog and the search field unfocused', async () => {
    stubViewport(600);
    const dialog = open();
    await entered();
    expect(dialog).toHaveFocus();
    expect(screen.getByRole('combobox')).not.toHaveFocus();
  });
});
