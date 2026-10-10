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
  RefreshCw,
  Search,
  Settings,
  Sun,
  UserRoundCog,
  Users,
  WifiOff,
} from 'lucide-react';
import { ROLE_LABEL } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { qk, useCurrentUser, useMySteps, useSettings, useTickets } from '../lib/queries.ts';
import { todayStr } from '../lib/dates.ts';
import { isAdmin, isLead } from '../lib/permissions.ts';
import { UIProvider, useKeyboardInset, useOpenTicketParam, useRealtime } from '../lib/ui.tsx';
import { Avatar } from './Avatar.tsx';
import { TicketDrawer } from './TicketDrawer.tsx';
import { NewTicketDialog, type NewTicketPrefill } from './NewTicketDialog.tsx';
import { SearchDialog } from './SearchDialog.tsx';
import { NotificationsMenu } from './NotificationsMenu.tsx';
import { HelpDialog } from './HelpDialog.tsx';
import { Menu, MenuItem } from './Menu.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { WaitingPrompt } from './TicketActions.tsx';

type NavItem = { to: string; label: string; icon: typeof Sun; end?: boolean; leadOnly?: boolean };

function useNav(): NavItem[] {
  const me = useCurrentUser();
  return [
    { to: '/', label: 'Mi día', icon: Sun, end: true },
    { to: '/tablero', label: 'Tablero', icon: Columns3 },
    { to: '/calendario', label: 'Calendario', icon: CalendarDays },
    { to: '/clientes', label: 'Clientes', icon: Users },
    { to: '/resumen', label: 'Resumen', icon: BarChart3, leadOnly: true },
    { to: '/archivo', label: 'Archivo', icon: Archive },
    isAdmin(me)
      ? { to: '/ajustes', label: 'Equipo y ajustes', icon: Settings }
      : { to: '/ajustes', label: 'Mi perfil', icon: UserRoundCog },
  ].filter((n) => !n.leadOnly || isLead(me));
}

/** Lo que pide atención en «Mi día»: lo mío vencido, de hoy y seguimientos; pasos que me tocan; y (coordinación) lo por asignar. */
function useMyDayCount() {
  const me = useCurrentUser();
  const { data: tickets = [] } = useTickets();
  const { data: steps = [] } = useMySteps();
  return useMemo(() => {
    const today = todayStr();
    const lead = isLead(me);
    const mine = tickets.filter(
      (t) =>
        t.assignee_ids.includes(me.id) &&
        t.status !== 'done' &&
        ((t.due_date && t.due_date <= today) || (t.status === 'waiting' && t.follow_up_date && t.follow_up_date <= today)),
    ).length;
    const unassigned = lead ? tickets.filter((t) => t.status !== 'done' && !t.archived_at && t.assignee_ids.length === 0).length : 0;
    const stepsDue = steps.filter((s) => s.due_date && s.due_date <= today).length;
    return mine + unassigned + stepsDue;
  }, [tickets, steps, me]);
}

function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function Layout() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const nav = useNav();
  const { data: settings } = useSettings();
  const ticketParam = useOpenTicketParam();
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<NewTicketPrefill>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const myDay = useMyDayCount();
  const location = useLocation();
  useKeyboardInset();

  const { online, updateReady } = useRealtime(ticketParam.open);

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
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        ui.openNewTicket();
      } else if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
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

  const businessName = settings?.business_name ?? '';
  const moreItems = nav.slice(3);
  const moreActive = moreItems.some((n) => location.pathname.startsWith(n.to));

  return (
    <UIProvider value={ui}>
      <a
        href="#contenido"
        className="sr-only z-[70] rounded-xl bg-pine-solid px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <div className="min-h-dvh lg:pl-[264px]">
        {/* Barra lateral (computadora) */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-paper-2/70 px-4 py-5 backdrop-blur lg:flex">
          <Brand name={businessName} />
          <button className="btn-primary mt-6 min-h-12 w-full text-base" onClick={() => ui.openNewTicket()}>
            <Plus className="size-5" strokeWidth={2.5} /> Nuevo pendiente
            <kbd className="ml-auto rounded-md bg-white/15 px-1.5 text-[12px] font-semibold">N</kbd>
          </button>
          <nav className="mt-6 flex flex-col gap-1" aria-label="Secciones">
            {nav.map((item) => (
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
                <p className="text-[12px] font-semibold text-ink-3">{ROLE_LABEL[me.role]}</p>
              </div>
              <button className="btn-ghost size-10 px-0" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
                <LogOut className="size-[18px]" />
              </button>
            </div>
          </div>
        </aside>

        {/* Barra superior */}
        <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
            <div className="min-w-0 lg:hidden">
              <Brand name={businessName} compact />
            </div>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar pendientes o clientes"
              className="ml-auto flex min-h-11 items-center gap-2.5 rounded-xl border border-line-2 bg-card px-3 text-[15px] text-ink-3 transition-colors hover:border-field hover:text-ink-2 sm:px-3.5 lg:mr-auto lg:ml-0 lg:w-[420px]"
            >
              <Search className="size-[18px]" />
              <span className="hidden sm:inline">Buscar pendientes o clientes…</span>
              <kbd className="ml-auto hidden rounded-md border border-line-2 bg-paper px-1.5 text-[12px] font-semibold lg:inline">/</kbd>
            </button>
            <NotificationsMenu onOpenTicket={ui.openTicket} />
          </div>
          {updateReady && (
            <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-pine-solid px-4 py-2 text-[14px] font-semibold text-white">
              Hay una versión nueva de Giraboard.
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 hover:bg-white/25" onClick={() => window.location.reload()}>
                <RefreshCw className="size-4" /> Actualizar ahora
              </button>
            </div>
          )}
          {!online && (
            <div role="status" className="flex items-center justify-center gap-2 bg-amber-solid px-4 py-1.5 text-[14px] font-semibold text-white">
              <WifiOff className="size-4 shrink-0" /> Sin conexión con el servidor. Reintentando… (lo que veas puede no estar al día)
            </div>
          )}
        </header>

        <main id="contenido" tabIndex={-1} className="px-4 pt-5 pb-32 outline-none sm:px-6 lg:px-8 lg:pb-12">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Navegación inferior (celular y tableta) */}
        <nav
          aria-label="Secciones"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 px-1 pt-1 pb-[max(env(safe-area-inset-bottom),6px)] backdrop-blur lg:hidden"
        >
          <BottomLink to="/" label="Mi día" icon={<Sun />} end badge={myDay} />
          <BottomLink to="/tablero" label="Tablero" icon={<Columns3 />} />
          <div className="flex justify-center">
            <button
              onClick={() => ui.openNewTicket()}
              className="-mt-5 flex size-14 items-center justify-center rounded-2xl bg-pine-solid text-white shadow-lift ring-4 ring-paper active:scale-95"
              aria-label="Nuevo pendiente"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </button>
          </div>
          <BottomLink to="/calendario" label="Calendario" icon={<CalendarDays />} />
          <Menu
            title="Más secciones"
            width="w-64"
            direction="up"
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                aria-expanded={open}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold ${moreActive ? 'text-pine' : 'text-ink-3'}`}
              >
                <MenuIcon className="size-6" />
                Más
              </button>
            )}
          >
            {(close) => (
              <div>
                {moreItems.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={close}
                    className={({ isActive }) =>
                      `flex min-h-12 items-center gap-3 rounded-xl px-3 text-[16px] font-semibold ${isActive ? 'bg-pine-soft text-pine' : 'hover:bg-paper-2'}`
                    }
                  >
                    <n.icon className="size-5 opacity-80" /> {n.label}
                  </NavLink>
                ))}
                <MenuItem icon={<CircleHelp />} onClick={() => (close(), setHelpOpen(true))}>
                  Guía rápida
                </MenuItem>
                <div className="my-1.5 border-t border-line" />
                <div className="flex items-center gap-3 px-3 py-2">
                  <Avatar user={me} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{me.name}</span>
                    <span className="text-[13px] text-ink-3">{ROLE_LABEL[me.role]}</span>
                  </span>
                </div>
                <MenuItem icon={<LogOut />} onClick={() => (close(), logout())}>
                  Cerrar sesión
                </MenuItem>
              </div>
            )}
          </Menu>
        </nav>
      </div>

      {ticketParam.id && <TicketDrawer key={ticketParam.id} id={ticketParam.id} onClose={ticketParam.close} />}
      <NewTicketDialog open={newOpen} prefill={prefill} onClose={() => setNewOpen(false)} onCreated={ui.openTicket} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onOpenTicket={ui.openTicket} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <WaitingPrompt />
    </UIProvider>
  );
}

function Brand({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <NavLink to="/" className="flex min-w-0 items-center gap-2.5" aria-label={`Giraboard · ${name} · Ir a Mi día`}>
      <img src="/favicon.svg" alt="" className={`shrink-0 ${compact ? 'size-9' : 'size-10'}`} />
      <span className="min-w-0 leading-tight">
        <span className={`block font-display font-semibold tracking-tight ${compact ? 'text-[17px]' : 'text-xl'}`}>Giraboard</span>
        {name && <span className={`block truncate font-medium text-ink-3 ${compact ? 'max-w-[44vw] text-[12px]' : 'text-[13px]'}`}>{name}</span>}
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
            <span className="ml-auto rounded-full bg-clay-solid px-2 py-0.5 text-[12px] font-bold text-white tabular-nums" aria-label={`${badge} por atender`}>
              {badge}
            </span>
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
        `relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold [&>svg]:size-6 ${
          isActive ? 'text-pine' : 'text-ink-3'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`absolute top-0 h-1 w-8 rounded-full transition-colors ${isActive ? 'bg-pine-solid' : 'bg-transparent'}`} aria-hidden />
          {icon}
          {label}
          {badge > 0 && (
            <span
              className="absolute top-1 right-[calc(50%-24px)] min-w-5 rounded-full bg-clay-solid px-1 text-center text-[11px] leading-5 font-bold text-white ring-2 ring-card"
              aria-label={`${badge} por atender`}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
