import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from './lib/api.ts';
import { qk, useMe } from './lib/queries.ts';
import { isLead } from './lib/permissions.ts';
import { Layout } from './components/Layout.tsx';
import { ChoosePasswordPage, LoginPage, SetupPage } from './pages/AuthPages.tsx';
import { TodayPage } from './pages/TodayPage.tsx';
import { BoardPage } from './pages/BoardPage.tsx';

// Las secciones que se abren menos se cargan hasta que se necesitan (la app abre más rápido).
const CalendarPage = lazy(() => import('./pages/CalendarPage.tsx').then((m) => ({ default: m.CalendarPage })));
const ClientsPage = lazy(() => import('./pages/ClientsPage.tsx').then((m) => ({ default: m.ClientsPage })));
const ClientDetailPage = lazy(() => import('./pages/ClientsPage.tsx').then((m) => ({ default: m.ClientDetailPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.tsx').then((m) => ({ default: m.DashboardPage })));
const ArchivePage = lazy(() => import('./pages/ArchivePage.tsx').then((m) => ({ default: m.ArchivePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })));

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Cargando">
      <img src="/favicon.svg" alt="" className="size-14 animate-pulse" />
    </div>
  );
}

function PageLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 py-2" role="status" aria-label="Cargando">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-paper-3" />
      <div className="h-24 animate-pulse rounded-2xl bg-paper-3" />
      <div className="h-24 animate-pulse rounded-2xl bg-paper-3" />
    </div>
  );
}

export function App() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api.get<{ needs_setup: boolean; setup_code_required: boolean; business_name: string }>('/auth/status'),
  });
  const me = useMe();

  useEffect(() => {
    setUnauthorizedHandler(() => qc.setQueryData(qk.me, null));
  }, [qc]);

  if (status.isLoading || me.isLoading) return <Splash />;
  if (status.error || me.error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-2xl font-semibold">No se pudo conectar</p>
        <p className="text-ink-2">{(status.error ?? me.error)?.message}</p>
        <button
          className="btn-primary"
          onClick={() => {
            status.refetch();
            me.refetch();
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (status.data?.needs_setup) return <SetupPage codeRequired={!!status.data.setup_code_required} />;
  if (!me.data) return <LoginPage businessName={status.data?.business_name ?? ''} />;
  if (me.data.must_change_password) return <ChoosePasswordPage user={me.data} />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="tablero" element={<BoardPage />} />
        <Route path="calendario" element={<Lazy page={<CalendarPage />} />} />
        <Route path="clientes" element={<Lazy page={<ClientsPage />} />} />
        <Route path="clientes/:id" element={<Lazy page={<ClientDetailPage />} />} />
        <Route path="resumen" element={isLead(me.data) ? <Lazy page={<DashboardPage />} /> : <Navigate to="/" replace />} />
        <Route path="archivo" element={<Lazy page={<ArchivePage />} />} />
        <Route path="ajustes" element={<Lazy page={<SettingsPage />} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Lazy({ page }: { page: ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{page}</Suspense>;
}
