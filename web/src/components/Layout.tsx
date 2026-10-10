import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  BarChart3,
  CalendarDays,
  CircleHelp,
  Columns3,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
  WifiOff,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { qk, useCurrentUser, useSettings, useTickets } from '../lib/queries.ts';
import { todayStr } from '../lib/dates.ts';
import { UIProvider, useOpenTicketParam, useRealtime } from '../lib/ui.tsx';
import { Avatar } from './Avatar.tsx';
import { TicketDrawer } from './TicketDrawer.tsx';
import { NewTicketDialog, type NewTicketPrefill } from './NewTicketDialog.tsx';
import { SearchDialog } from './SearchDialog.tsx';
import { NotificationsMenu } from './NotificationsMenu.tsx';
import { HelpDialog } from './HelpDialog.tsx';
import { Menu, MenuItem } from './Menu.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';

const NAV = [
  { to: '/', label: 'Mi día', icon: Sun, end: true },
  { to: '/tablero', label: 'Tablero', icon: Columns3 },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/resumen', label: 'Resumen', icon: BarChart3 },
  { to: '/archivo', label: 'Archivo', icon: Archive },
  { to: '/ajustes', label: 'Equipo y ajustes', icon: Settings },
];

function useMyDayCount() {
  const me = useCurrentUser();
  const { data: tickets = [] } = useTickets();
  return useMemo(() => {
    const today = todayStr();
    return tickets.filter(
      (t) =>
        t.assignee_id === me.id &&
        t.status !== 'done' &&
        ((t.due_date && t.due_date <= today) || (t.status === 'waiting' && t.follow_up_date && t.follow_up_date <= today)),
    ).length;
  }, [tickets, me.id]);
}

function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function Layout() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const ticketParam = useOpenTicketParam();
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<NewTicketPrefill>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const myDay = useMyDayCount();
  const location = useLocation();

  const online = useRealtime(ticketParam.open);

  const ui = useMemo(
    () => ({
      openTicket: ticketParam.open,
      closeTicket: ticketParam.close,
      openNewTicket: (p: NewTicketPrefill = {}) => {
        setPrefill(p);
        setNewOpen(true);
      },
      openSearch: () => setSearchOpen(true),
      openHelp: () => setHelpOpen(true),
    }),
    [ticketParam.open, ticketParam.close],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        ui.openNewTicket();
      } else if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* aunque falle la red, salimos en este navegador */
    }
    // Primero se muestra la pantalla de entrada; después se borra lo que había en memoria.
    qc.setQueryData(qk.me, null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'auth-status' });
  };

  const businessName = settings?.business_name ?? 'Giraboard';

  return (
    <UIProvider value={ui}>
      <div className="min-h-dvh lg:pl-[264px]">
        {/* Barra lateral (computadora) */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-paper-2/60 px-4 py-5 backdrop-blur lg:flex">
          <Brand name={businessName} />
          <button className="btn-primary mt-6 min-h-12 w-full text-base" onClick={() => ui.openNewTicket()}>
            <Plus className="size-5" strokeWidth={2.5} /> Nuevo pendiente
          </button>
          <nav className="mt-6 flex flex-col gap-1" aria-label="Secciones">
            {NAV.map((item) => (
              <SideLink key={item.to} {...item} badge={item.to === '/' ? myDay : 0} />
            ))}
          </nav>
          <div className="mt-auto space-y-2">
            <button className="btn-ghost w-full justify-start" onClick={() => setHelpOpen(true)}>
              <CircleHelp className="size-5" /> Guía rápida
            </button>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
              <Avatar user={me} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{me.name}</p>
                <p className="text-[12px] text-ink-3">{me.role === 'admin' ? 'Admin' : 'Equipo'}</p>
              </div>
              <button className="btn-ghost size-9 px-0" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
                <LogOut className="size-[18px]" />
              </button>
            </div>
          </div>
        </aside>

        {/* Barra superior */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line/70 bg-paper/85 px-4 py-2 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <Brand name={businessName} compact />
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar pendientes o clientes"
            className="ml-auto flex min-h-11 items-center gap-2.5 rounded-xl border border-line-2 bg-card px-3.5 text-[15px] text-ink-3 transition-colors hover:border-ink-3/50 hover:text-ink-2 lg:mr-auto lg:ml-0 lg:w-[420px]"
          >
            <Search className="size-[18px]" />
            <span className="hidden sm:inline">Buscar pendientes o clientes…</span>
            <kbd className="ml-auto hidden rounded-md border border-line-2 bg-paper px-1.5 text-[12px] font-semibold lg:inline">/</kbd>
          </button>
          <NotificationsMenu onOpenTicket={ui.openTicket} />
        </header>

        {!online && (
          <div role="status" className="sticky top-[61px] z-20 flex items-center justify-center gap-2 bg-amber px-4 py-1.5 text-[14px] font-semibold text-white">
            <WifiOff className="size-4" /> Sin conexión con el servidor. Reintentando… (lo que veas puede no estar al día)
          </div>
        )}

        <main className="px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pb-12">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Navegación inferior (celular) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur lg:hidden">
          <BottomLink to="/" label="Mi día" icon={<Sun />} end badge={myDay} />
          <BottomLink to="/tablero" label="Tablero" icon={<Columns3 />} />
          <div className="flex justify-center">
            <button
              onClick={() => ui.openNewTicket()}
              className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-pine text-white shadow-lift active:scale-95"
              aria-label="Nuevo pendiente"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </button>
          </div>
          <BottomLink to="/calendario" label="Calendario" icon={<CalendarDays />} />
          <div className="flex justify-center">
            <Menu
              width="w-64"
              direction="up"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-semibold text-ink-3">
                  <MenuIcon className="size-6" />
                  Más
                </button>
              )}
            >
              {(close) => (
                <div>
                  {NAV.slice(3).map((n) => (
                    <NavLink key={n.to} to={n.to} onClick={close} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-paper-2">
                      <n.icon className="size-5 text-ink-3" /> {n.label}
                    </NavLink>
                  ))}
                  <MenuItem icon={<CircleHelp />} onClick={() => (close(), setHelpOpen(true))}>
                    Guía rápida
                  </MenuItem>
                  <MenuItem icon={<LogOut />} onClick={() => (close(), logout())}>
                    Cerrar sesión ({me.name})
                  </MenuItem>
                </div>
              )}
            </Menu>
          </div>
        </nav>
      </div>

      {ticketParam.id && <TicketDrawer key={ticketParam.id} id={ticketParam.id} onClose={ticketParam.close} />}
      <NewTicketDialog open={newOpen} prefill={prefill} onClose={() => setNewOpen(false)} onCreated={ui.openTicket} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onOpenTicket={ui.openTicket} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </UIProvider>
  );
}

function Brand({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <NavLink to="/" className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className={compact ? 'size-9' : 'size-10'} />
      <span className="leading-tight">
        <span className={`block font-display font-semibold tracking-tight ${compact ? 'text-lg' : 'text-xl'}`}>Giraboard</span>
        {!compact && <span className="block text-[13px] font-medium text-ink-3">{name}</span>}
      </span>
    </NavLink>
  );
}

function SideLink({ to, label, icon: Icon, end, badge }: { to: string; label: string; icon: typeof Sun; end?: boolean; badge: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors ${
          isActive ? 'bg-card text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:bg-card/70 hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`size-5 ${isActive ? 'text-pine' : 'text-ink-3'}`} strokeWidth={isActive ? 2.4 : 2} />
          {label}
          {badge > 0 && (
            <span className="ml-auto rounded-full bg-clay px-2 py-0.5 text-[12px] font-bold text-white tabular-nums">{badge}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

function BottomLink({ to, label, icon, end, badge = 0 }: { to: string; label: string; icon: ReactNode; end?: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-semibold [&>svg]:size-6 ${isActive ? 'text-pine' : 'text-ink-3'}`
      }
    >
      {icon}
      {label}
      {badge > 0 && (
        <span className="absolute top-0 right-[calc(50%-22px)] rounded-full bg-clay px-1.5 text-[10px] leading-4 font-bold text-white">
          {badge}
        </span>
      )}
    </NavLink>
  );
}
