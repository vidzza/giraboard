import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { AlertTriangle, Archive, Columns3, Flame, Plus, Search, UserRound, UserRoundPlus, Users, X } from 'lucide-react';
import { STATUSES, STATUS_HINT, STATUS_LABEL, type Status, type Ticket, type User } from '../../../shared/types.ts';
import { sortTickets, useCategories, useCurrentUser, useTickets, useUpdateTicket, useUsers } from '../lib/queries.ts';
import { STATUS_STYLE } from '../lib/status.ts';
import { todayStr } from '../lib/dates.ts';
import { isLead } from '../lib/permissions.ts';
import { useIsMobile, useStoredState, useUI } from '../lib/ui.tsx';
import { TicketCard } from '../components/TicketCard.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { AssignMenuButton, StatusMenuButton, useSetStatus } from '../components/TicketActions.tsx';

type View = 'status' | 'person';
type Filters = { people: number[]; mine: boolean; category: number | null; urgent: boolean; overdue: boolean };

const DONE_LIMIT = 15;
const NO_FILTERS: Filters = { people: [], mine: false, category: null, urgent: false, overdue: false };
const NOBODY = 0;

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

type ColumnDef = { id: string; label: string; tickets: Ticket[]; header: ReactNode; tab: ReactNode; tint: string; footer?: ReactNode; empty: string; personId?: number };

export function BoardPage() {
  const ui = useUI();
  const me = useCurrentUser();
  const lead = isLead(me);
  const mobile = useIsMobile();
  const { data: tickets = [], isLoading } = useTickets();
  const { data: users = [] } = useUsers();
  const { data: categories = [] } = useCategories();
  const update = useUpdateTicket();
  const setStatus = useSetStatus();
  const [storedView, setView] = useStoredState<View>('gb.board.view', 'status');
  const view: View = lead && storedView === 'person' ? 'person' : 'status';
  const [storedFilters, setF] = useStoredState<Filters>('gb.board.filters', NO_FILTERS);
  // Lo guardado en el navegador puede venir incompleto o de otra versión: se completa con los valores por defecto.
  const f: Filters = { ...NO_FILTERS, ...(storedFilters && typeof storedFilters === 'object' ? storedFilters : {}) };
  if (!Array.isArray(f.people)) f.people = [];
  const [text, setText] = useState('');
  const [tab, setTab] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Ticket | null>(null);

  const setFilters = (patch: Partial<Filters>) => setF({ ...f, ...patch });
  const filtersOn = f.people.length > 0 || f.mine || f.category !== null || f.urgent || f.overdue || text.trim() !== '';

  const filtered = useMemo(() => {
    const today = todayStr();
    const q = text.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        (!lead || f.people.length === 0 || f.people.some((p) => (p === NOBODY ? t.assignee_ids.length === 0 : t.assignee_ids.includes(p)))) &&
        (!f.mine || t.assignee_ids.includes(me.id)) &&
        (f.category === null || t.category_id === f.category) &&
        (!f.urgent || t.priority === 'urgent') &&
        (!f.overdue || (t.status !== 'done' && !!t.due_date && t.due_date < today)) &&
        (!q || t.title.toLowerCase().includes(q) || (t.client_name ?? '').toLowerCase().includes(q) || String(t.id) === q.replace('#', '')),
    );
  }, [tickets, f, text, lead, me.id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );

  const activeUsers = users.filter((u) => u.active);
  // En la vista por persona también aparecen quienes ya no tienen acceso pero conservan pendientes abiertos.
  const columnsPeople = users.filter((u) => u.active || tickets.some((t) => t.assignee_ids.includes(u.id) && t.status !== 'done'));

  const columns: ColumnDef[] =
    view === 'status'
      ? STATUSES.map((s) => {
          const list = sortTickets(filtered.filter((t) => t.status === s));
          const st = STATUS_STYLE[s];
          const Icon = st.icon;
          return {
            id: s,
            label: STATUS_LABEL[s],
            tickets: s === 'done' ? list.slice(0, DONE_LIMIT) : list,
            header: <StatusHeader status={s} count={list.length} />,
            tab: (
              <>
                <Icon className={`size-4 ${st.text}`} strokeWidth={2.5} />
                {STATUS_LABEL[s]}
                <Count n={list.length} className={`${st.bg} ${st.text}`} />
              </>
            ),
            tint: st.dot,
            empty: isLoading ? 'Cargando…' : s === 'waiting' ? 'Nada en espera' : s === 'done' ? 'Aún no se termina nada' : 'Vacío',
            footer:
              s === 'done' ? (
                <Link to="/archivo" className="btn-ghost btn-sm w-full">
                  <Archive className="size-4" /> Ver todo lo terminado
                </Link>
              ) : s === 'todo' ? (
                <button className="btn-ghost btn-sm w-full" onClick={() => ui.openNewTicket()}>
                  <Plus className="size-4" /> Agregar pendiente
                </button>
              ) : undefined,
          };
        })
      : [null, ...columnsPeople].map((u: User | null) => {
          const pid = u?.id ?? NOBODY;
          const list = sortTickets(filtered.filter((t) => t.status !== 'done' && (u ? t.assignee_ids.includes(u.id) : t.assignee_ids.length === 0)));
          return {
            id: `user-${pid}`,
            label: u ? u.name : 'Por asignar',
            personId: pid,
            tickets: list,
            header: <PersonHeader user={u} tickets={list} />,
            tab: (
              <>
                <Avatar user={u} size="xs" />
                {u ? u.name.split(' ')[0] : 'Por asignar'}
                <Count n={list.length} className="bg-paper-2 text-ink-2" />
              </>
            ),
            tint: u ? '' : 'bg-ink-3',
            empty: u ? 'Sin pendientes abiertos' : 'Nada por asignar 👏',
            footer: (
              <button className="btn-ghost btn-sm w-full" onClick={() => ui.openNewTicket({ assignee_ids: u ? [u.id] : [] })}>
                <Plus className="size-4" /> {u ? `Darle algo a ${u.name.split(' ')[0]}` : 'Agregar sin asignar'}
              </button>
            ),
          };
        });

  const activeTab = columns.find((c) => c.id === tab) ?? columns.find((c) => c.tickets.length > 0 && c.id !== 'done') ?? columns[0];

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as { ticket: Ticket }).ticket);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const data = e.active.data.current as { ticket: Ticket; from: string } | undefined;
    const target = e.over?.id as string | undefined;
    if (!data || !target || target === data.from) return;
    const t = data.ticket;
    if (view === 'status') {
      setStatus(t, target as Status);
      return;
    }
    const fromId = Number(data.from.replace('user-', ''));
    const toId = Number(target.replace('user-', ''));
    const prev = t.assignee_ids;
    const without = prev.filter((id) => id !== fromId);
    const next = toId === NOBODY ? without : without.includes(toId) ? without : [...without, toId];
    update.mutate({ id: t.id, patch: { assignee_ids: next } });
    const fromName = users.find((u) => u.id === fromId)?.name;
    const toName = users.find((u) => u.id === toId)?.name;
    toast(
      toId === NOBODY
        ? next.length
          ? `#${t.id}: se quitó a ${fromName}`
          : `#${t.id} quedó por asignar`
        : fromId === NOBODY
          ? `#${t.id} ahora lo tiene ${toName}`
          : `#${t.id} pasó de ${fromName} a ${toName}`,
      { action: { label: 'Deshacer', onClick: () => update.mutate({ id: t.id, patch: { assignee_ids: prev } }) } },
    );
  };

  const cardActions = (t: Ticket, compact = false) => (
    <>
      {t.assignee_ids.length === 0 && lead && <AssignMenuButton ticket={t} label={compact ? 'Asignar' : 'Asignar'} />}
      <StatusMenuButton ticket={t} compact={compact} />
    </>
  );

  return (
    <div>
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="eyebrow">{lead ? 'Todo lo que se está haciendo' : 'Lo tuyo y lo que compartes'}</p>
          <h1 className="page-title">Tablero</h1>
        </div>
        {lead && (
          <div className="inline-flex rounded-xl border border-line-2 bg-card p-1" role="tablist" aria-label="Vista">
            <ViewTab active={view === 'status'} onClick={() => (setView('status'), setTab(null))} icon={<Columns3 className="size-4" />}>
              Por estado
            </ViewTab>
            <ViewTab active={view === 'person'} onClick={() => (setView('person'), setTab(null))} icon={<Users className="size-4" />}>
              Por persona
            </ViewTab>
          </div>
        )}
      </header>

      {/* Filtros */}
      <div className="scroll-row -mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            className="input min-h-11 w-48 pl-9 sm:w-56"
            placeholder="Filtrar por texto o cliente"
            aria-label="Filtrar por texto o cliente"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <FilterChip on={f.mine} onClick={() => setFilters({ mine: !f.mine, people: [] })} icon={<UserRound className="size-4" />}>
          Solo míos
        </FilterChip>
        {lead && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-line-2 bg-card p-1">
            {activeUsers
              .filter((u) => u.id !== me.id)
              .map((u) => {
                const on = f.people.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => setFilters({ mine: false, people: on ? f.people.filter((p) => p !== u.id) : [...f.people, u.id] })}
                    aria-pressed={on}
                    className={`flex size-9 items-center justify-center rounded-full transition-all ${on ? 'bg-pine-soft ring-2 ring-pine' : f.people.length ? 'opacity-45 hover:opacity-80' : ''}`}
                    title={`Solo lo de ${u.name}`}
                    aria-label={`Solo lo de ${u.name}`}
                  >
                    <Avatar user={u} size="sm" />
                  </button>
                );
              })}
            <button
              onClick={() => setFilters({ mine: false, people: f.people.includes(NOBODY) ? f.people.filter((p) => p !== NOBODY) : [...f.people, NOBODY] })}
              aria-pressed={f.people.includes(NOBODY)}
              className={`flex size-9 items-center justify-center rounded-full ${f.people.includes(NOBODY) ? 'bg-pine-soft ring-2 ring-pine' : f.people.length ? 'opacity-45 hover:opacity-80' : ''}`}
              title="Solo lo que está por asignar"
              aria-label="Solo lo que está por asignar"
            >
              <Avatar user={null} size="sm" />
            </button>
          </div>
        )}
        <select
          className="input min-h-11 w-auto shrink-0 py-0"
          value={f.category ?? ''}
          onChange={(e) => setFilters({ category: e.target.value ? Number(e.target.value) : null })}
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos los tipos</option>
          {categories
            .filter((c) => !c.archived)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <FilterChip on={f.urgent} danger onClick={() => setFilters({ urgent: !f.urgent })} icon={<Flame className="size-4" />}>
          Urgentes
        </FilterChip>
        <FilterChip on={f.overdue} danger onClick={() => setFilters({ overdue: !f.overdue })} icon={<AlertTriangle className="size-4" />}>
          Vencidos
        </FilterChip>
        {filtersOn && (
          <button
            className="btn-ghost btn-sm shrink-0"
            onClick={() => {
              setF(NO_FILTERS);
              setText('');
            }}
          >
            <X className="size-4" /> Quitar filtros
          </button>
        )}
      </div>

      {mobile ? (
        <>
          {/* Celular / tableta: una columna a la vez, con pestañas */}
          <div
            className="scroll-row sticky top-[calc(env(safe-area-inset-top)+61px)] z-10 -mx-4 mt-3 flex gap-1.5 overflow-x-auto border-b border-line bg-paper/95 px-4 py-2 backdrop-blur"
            role="tablist"
            aria-label={view === 'status' ? 'Estados' : 'Personas'}
          >
            {columns.map((c) => {
              const on = c.id === activeTab.id;
              return (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(c.id)}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[14px] font-bold whitespace-nowrap transition-colors ${
                    on ? 'border-ink bg-ink text-paper [&_svg]:text-current' : 'border-line-2 bg-card text-ink-2'
                  }`}
                >
                  {c.tab}
                </button>
              );
            })}
          </div>
          <section className="mt-3 space-y-2.5" role="tabpanel" aria-label={activeTab.label}>
            {activeTab.tickets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-2 px-3 py-10 text-center text-[15px] text-ink-3">{activeTab.empty}</p>
            ) : (
              activeTab.tickets.map((t) => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  onOpen={ui.openTicket}
                  showStatus={view === 'person'}
                  hideAssignee={view === 'person' && t.assignee_ids.length <= 1}
                  actions={cardActions(t)}
                />
              ))
            )}
            {activeTab.footer && <div className="pt-1">{activeTab.footer}</div>}
          </section>
        </>
      ) : (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="scroll-thin -mx-4 mt-5 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {columns.map((c) => (
              <Column key={c.id} id={c.id} label={c.label} header={c.header} footer={c.footer} empty={c.empty} tint={c.tint}>
                {c.tickets.map((t) => (
                  <DraggableCard
                    key={`${t.id}-${c.id}`}
                    ticket={t}
                    from={c.id}
                    onOpen={ui.openTicket}
                    hideAssignee={view === 'person' && t.assignee_ids.length <= 1}
                    showStatus={view === 'person'}
                    actions={cardActions(t, true)}
                  />
                ))}
              </Column>
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
            {dragging ? (
              <div className="w-[300px]">
                <TicketCard ticket={dragging} overlay showStatus={view === 'person'} hideAssignee={view === 'person'} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <p className="mt-2 hidden text-[13px] text-ink-3 lg:block">
        Arrastra una tarjeta a otra columna para {view === 'status' ? 'cambiarla de estado' : 'pasársela a otra persona'}, o usa «Mover». Clic para ver todo el
        detalle.
      </p>
    </div>
  );
}

function Count({ n, className }: { n: number; className: string }) {
  return <span className={`rounded-full px-1.5 text-[12px] leading-5 font-bold tabular-nums ${className}`}>{n}</span>;
}

function FilterChip({ on, onClick, icon, children, danger }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`chip min-h-11 shrink-0 ${on ? (danger ? 'border-clay-solid bg-clay-solid text-white' : 'border-pine-solid bg-pine-solid text-white') : 'border-line-2 bg-card text-ink-2 hover:border-field'}`}
    >
      {icon} {children}
    </button>
  );
}

function ViewTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-bold transition-all ${active ? 'bg-ink text-paper shadow-card' : 'text-ink-2 hover:text-ink'}`}
    >
      {icon}
      {children}
    </button>
  );
}

function Column({
  id,
  label,
  header,
  children,
  footer,
  empty,
  tint,
}: {
  id: string;
  label: string;
  header: ReactNode;
  children: ReactNode[];
  footer?: ReactNode;
  empty: string;
  tint: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`Columna ${label}`}
      className={`flex w-[300px] shrink-0 flex-col rounded-2xl border transition-colors xl:w-0 xl:max-w-[420px] xl:min-w-[260px] xl:flex-1 ${
        isOver ? 'border-pine bg-pine-soft/60 ring-2 ring-pine/30' : 'border-line bg-paper-2/70'
      }`}
    >
      <div className="relative overflow-hidden rounded-t-2xl px-3.5 pt-3 pb-2.5">
        {tint && <div className={`absolute inset-x-0 top-0 h-1 ${tint}`} />}
        {header}
      </div>
      <div className="flex min-h-32 flex-1 flex-col gap-2.5 px-2.5 pb-2.5">
        {children.length === 0 ? <p className="rounded-xl border border-dashed border-line-2 px-3 py-6 text-center text-[14px] text-ink-3">{empty}</p> : children}
      </div>
      {footer && <div className="border-t border-line/70 p-1.5">{footer}</div>}
    </section>
  );
}

function StatusHeader({ status, count }: { status: Status; count: number }) {
  const st = STATUS_STYLE[status];
  const Icon = st.icon;
  return (
    <div title={STATUS_HINT[status]}>
      <div className="flex items-center gap-2">
        <Icon className={`size-[18px] ${st.text}`} strokeWidth={2.5} />
        <h2 className="font-display text-[19px] font-semibold">{STATUS_LABEL[status]}</h2>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums ${st.bg} ${st.text}`}>{count}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">{STATUS_HINT[status]}</p>
    </div>
  );
}

function PersonHeader({ user, tickets }: { user: User | null; tickets: Ticket[] }) {
  const today = todayStr();
  const overdue = tickets.filter((t) => t.due_date && t.due_date < today).length;
  const waiting = tickets.filter((t) => t.status === 'waiting').length;
  return (
    <div className="flex items-center gap-2.5">
      {user ? (
        <Avatar user={user} size="md" />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-full border-[1.5px] border-dashed border-field text-ink-3">
          <UserRoundPlus className="size-5" />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="truncate font-display text-[19px] leading-tight font-semibold">
          {user?.name ?? 'Por asignar'}
          {user && !user.active && <span className="ml-1.5 text-[12px] font-sans font-bold text-ink-3">(sin acceso)</span>}
        </h2>
        <p className="text-[12px] font-semibold text-ink-3">
          {tickets.length} abierto{tickets.length === 1 ? '' : 's'}
          {overdue > 0 && (
            <span className="text-clay">
              {' '}
              · {overdue} vencido{overdue === 1 ? '' : 's'}
            </span>
          )}
          {waiting > 0 && <span className="text-amber"> · {waiting} en espera</span>}
        </p>
      </div>
    </div>
  );
}

function DraggableCard({
  ticket,
  from,
  onOpen,
  hideAssignee,
  showStatus,
  actions,
}: {
  ticket: Ticket;
  from: string;
  onOpen: (id: number) => void;
  hideAssignee?: boolean;
  showStatus?: boolean;
  actions?: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${ticket.id}@${from}`, data: { ticket, from } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-pine ${isDragging ? 'opacity-30' : ''}`}
      aria-roledescription="Tarjeta que se puede arrastrar"
      aria-label={`#${ticket.id} ${ticket.title}. Enter para abrir.`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(ticket.id);
        else listeners?.onKeyDown?.(e);
      }}
    >
      <TicketCard ticket={ticket} onOpen={onOpen} hideAssignee={hideAssignee} showStatus={showStatus} actions={actions} actionsLayout="inline" />
    </div>
  );
}
