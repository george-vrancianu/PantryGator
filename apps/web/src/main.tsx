import { AppUiProvider } from './components/AppUiProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { VoiceNotices } from './components/voice/VoiceNotices';
import { createI18n } from './i18n';
import { RouterLink } from './lib/RouterLink';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
const i18n = createI18n();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppUiProvider linkComponent={RouterLink}>
          <BrowserRouter>
            <VoiceNotices />
            <App />
          </BrowserRouter>
        </AppUiProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
