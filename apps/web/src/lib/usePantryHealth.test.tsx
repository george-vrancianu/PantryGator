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

const emptyApi = {
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
  'GET /api/staples': () => Response.json({ staples: [] }),
  'GET /api/shopping-list': () =>
    Response.json({
      id: 'l1',
      groups: [],
      summary: { remaining: 0, checked: 0 },
    }),
};

function renderHealth(lastStocked: () => Response | Promise<Response>) {
  const { fetchMock, calls } = stubApi({
    ...emptyApi,
    'GET /api/pantry/last-stocked': lastStocked,
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={createI18n('en')}>
      <QueryClientProvider client={queryClient}>
        <PocketPantryUiProvider linkComponent={RouterLink}>
          <MemoryRouter>{children}</MemoryRouter>
        </PocketPantryUiProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
  return {
    queryClient,
    calls,
    ...renderHook(() => usePantryHealth(), { wrapper }),
  };
}

describe('usePantryHealth pending state', () => {
  it('stays pending until the last-stocked query has loaded, so the fourth light never lights up late', async () => {
    let release: (response: Response) => void = () => undefined;
    const lastStocked = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const { queryClient, result } = renderHealth(() => lastStocked);

    // Every other read has landed; only last-stocked is still in flight.
    await waitFor(() => expect(queryClient.isFetching()).toBe(1));
    expect(result.current.isPending).toBe(true);

    release(Response.json({ lastStockedAt: '2026-01-01T00:00:00Z' }));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.lastStockedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('a failed last-stocked read stops being pending without blanking the cluster', async () => {
    const { result, calls } = renderHealth(() =>
      Response.json({ code: 'boom', params: {} }, { status: 500 }),
    );

    await waitFor(() => expect(result.current.isPending).toBe(false));
    // Read once, retried once, then given up on.
    expect(
      calls.filter((call) => call.key === 'GET /api/pantry/last-stocked'),
    ).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(result.current.lastStockedAt).toBeNull();
  });
});
