import { PocketPantryUiProvider } from '@pocket-pantry/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { createI18n } from '../i18n';
import { RouterLink } from './RouterLink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../test/render';
import { usePantryHealth } from './usePantryHealth';

afterEach(() => vi.unstubAllGlobals());

describe('usePantryHealth pending state', () => {
  it('stays pending until the last-stocked query has loaded, so the fourth light never lights up late', async () => {
    let release: (response: Response) => void = () => undefined;
    const lastStocked = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { fetchMock } = stubApi({
      'GET /api/settings/family': () =>
        Response.json({ staleThresholdDays: 3, expiryOverrides: [] }),
      'GET /api/pantry': () => Response.json({ batches: [], runningLow: [] }),
      'GET /api/shopping-list/suggestions': () =>
        Response.json({
          staples: [],
          usedUp: [],
          runningLow: [],
          expired: [],
          dismissed: [],
        }),
      'GET /api/pantry/last-stocked': () => lastStocked,
      'GET /api/staples': () => Response.json({ staples: [] }),
      'GET /api/shopping-list': () =>
        Response.json({
          id: 'l1',
          groups: [],
          summary: { remaining: 0, checked: 0 },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nextProvider i18n={createI18n('en')}>
        <QueryClientProvider client={queryClient}>
          <PocketPantryUiProvider linkComponent={RouterLink}>
            <MemoryRouter>{children}</MemoryRouter>
          </PocketPantryUiProvider>
        </QueryClientProvider>
      </I18nextProvider>
    );
    const { result } = renderHook(() => usePantryHealth(), { wrapper });

    // Every other read has landed; only last-stocked is still in flight.
    await waitFor(() => expect(queryClient.isFetching()).toBe(1));
    expect(result.current.isPending).toBe(true);

    release(Response.json({ lastStockedAt: '2026-01-01T00:00:00Z' }));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.lastStockedAt).toBe('2026-01-01T00:00:00Z');
  });
});
