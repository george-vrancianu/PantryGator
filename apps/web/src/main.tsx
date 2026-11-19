import { AppUiProvider } from '@/components/layout/AppUiProvider/AppUiProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { VoiceNotices } from '@/components/voice/VoiceNotices/VoiceNotices';
import { createI18n } from './i18n';
import { RethrowRouteError } from './lib/RethrowRouteError';
import { RouterLink } from './lib/RouterLink';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
const i18n = createI18n();
// A data router, so `useBlocker` (the leave guard) works. Pages are still
// registered in `<App>`'s `<Routes>`; this is one splat route around it.
const router = createBrowserRouter([
  {
    path: '*',
    errorElement: <RethrowRouteError />,
    element: (
      <>
        <VoiceNotices />
        <App />
      </>
    ),
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppUiProvider linkComponent={RouterLink}>
          <RouterProvider router={router} />
        </AppUiProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
