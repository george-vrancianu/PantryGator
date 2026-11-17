import { AppUiProvider } from '../components/AppUiProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  MemoryRouter,
  Route,
  Routes,
  type InitialEntry,
} from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { VoiceNotices } from '../components/voice/VoiceNotices';
import { createI18n, type Locale } from '../i18n';
import { RouterLink } from '../lib/RouterLink';

type Options = { route?: InitialEntry; locale?: Locale };

/** Render with the same providers as `main.tsx`, but a memory router and a fresh query cache. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', locale = 'en' }: Options = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const i18n = createI18n(locale);
  const result = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppUiProvider linkComponent={RouterLink}>
          <MemoryRouter initialEntries={[route]}>
            <VoiceNotices />
            {ui}
          </MemoryRouter>
        </AppUiProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { ...result, i18n, queryClient };
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
