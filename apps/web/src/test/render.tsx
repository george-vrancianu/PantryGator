import { AppUiProvider } from '@/components/layout/AppUiProvider/AppUiProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { useEffect, useState, type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  createMemoryRouter,
  Route,
  RouterProvider,
  Routes,
  type InitialEntry,
} from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout/AppLayout';
import { VoiceNotices } from '@/components/voice/VoiceNotices/VoiceNotices';
import { createI18n, type Locale } from '../i18n';
import { RouterLink } from '../lib/RouterLink';

type Options = {
  route?: InitialEntry;
  locale?: Locale;
  /** Entries already behind `route` in the history, so `navigate(-1)` has somewhere to go. */
  before?: InitialEntry[];
};

/**
 * Render with the same providers as `main.tsx`, but a memory router and a fresh query cache.
 * The router is a data router (so `useBlocker` works), with one splat route around `ui`,
 * as `main.tsx` has around `<App>`. `rerender(newUi)` swaps `ui` and keeps the providers.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', locale = 'en', before = [] }: Options = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const i18n = createI18n(locale);
  let setUi: (next: ReactElement) => void = () => {};
  function Current() {
    const [current, set] = useState(ui);
    useEffect(() => {
      setUi = set;
    }, []);
    return (
      <>
        <VoiceNotices />
        {current}
      </>
    );
  }
  const router = createMemoryRouter([{ path: '*', element: <Current /> }], {
    initialEntries: [...before, route],
  });
  const result = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppUiProvider linkComponent={RouterLink}>
          <RouterProvider router={router} />
        </AppUiProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  const rerender = (next: ReactElement) => act(() => setUi(next));
  return { ...result, rerender, i18n, queryClient };
}

/** Render a page inside the app layout at its route, as the app does (the Voice Note lives in the layout). */
export function renderInAppLayout(
  page: ReactElement,
  path: string,
  options: Omit<Options, 'route'> = {},
) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={path} element={page} />
      </Route>
    </Routes>,
    { ...options, route: path },
  );
}

/** A fetch stub that answers by method and path, e.g. `'POST /api/auth/sign-in/email'`. */
export function stubApi(
  routes: Record<string, (url: URL) => Response | Promise<Response>>,
) {
  const calls: Array<{ key: string; search: string; body: unknown }> = [];
  const fetchMock = (input: RequestInfo | URL, init?: RequestInit) => {
    // The app calls relative `/api/...` paths, as a browser resolves them against the page.
    const url = new URL(String(input), window.location.origin);
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    calls.push({
      key,
      search: url.search,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const handler = routes[key];
    return Promise.resolve(
      handler
        ? handler(url)
        : Response.json({ code: 'not_found', params: {} }, { status: 404 }),
    );
  };
  return { fetchMock, calls };
}
