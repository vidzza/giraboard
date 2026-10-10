import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/figtree';
import './index.css';
import { App } from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => count < 2 && (err as { status?: number }).status !== 401,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster
        position="bottom-center"
        mobileOffset={{ bottom: 92 }}
        closeButton
        toastOptions={{
          duration: 6000,
          classNames: {
            toast: '!rounded-2xl !border-line !bg-card !text-ink !shadow-lift !text-[15px] !font-sans',
            description: '!text-ink-2',
            actionButton: '!bg-pine !text-white !font-bold !rounded-lg',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
