import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import { Flame, AlertTriangle, Plus, Search, X, Columns3, Users, Archive } from 'lucide-react';
import { STATUSES, STATUS_HINT, STATUS_LABEL, type Status, type Ticket, type User } from '../../../shared/types.ts';
import { sortTickets, useCategories, useCurrentUser, useTickets, useUpdateTicket, useUsers } from '../lib/queries.ts';
import { STATUS_STYLE } from '../lib/status.ts';
import { todayStr } from '../lib/dates.ts';
import { useUI } from '../lib/ui.tsx';
import { TicketCard } from '../components/TicketCard.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { Modal } from '../components/Modal.tsx';
import { DueDatePicker } from '../components/Pickers.tsx';

type View = 'status' | 'person';
type Filters = { people: number[]; category: number | null; urgent: boolean; overdue: boolean; text: string };

const DONE_LIMIT = 15;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento local */
  }
}

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function BoardPage() {
  const ui = useUI();
  const me = useCurrentUser();
  const { data: tickets = [], isLoading } = useTickets();
  const { data: users = [] } = useUsers();
  const { data: categories = [] } = useCategories();
  const update = useUpdateTicket();
  const [prefs, setPrefs] = useState(() => load<{ view: View; filters: Filters }>('gb.board', {
    view: 'status',
    filters: { people: [], category: null, urgent: false, overdue: false, text: '' },
  }));
  const [dragging, setDragging] = useState<Ticket | null>(null);
  const [waitingFor, setWaitingFor] = useState<Ticket | null>(null);

  const setView = (view: View) => {
    const next = { ...prefs, view };
    setPrefs(next);
    save('gb.board', next);
  };
  const setFilters = (patch: Partial<Filters>) => {
    const next = { ...prefs, filters: { ...prefs.filters, ...patch } };
    setPrefs(next);
    save('gb.board', { ...next, filters: { ...next.filters, text: '' } });
  };
  const f = prefs.filters;
  const filtersOn = f.people.length > 0 || f.category !== null || f.urgent || f.overdue || f.text.trim() !== '';

  const filtered = useMemo(() => {
    const today = todayStr();
    const text = f.text.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        (f.people.length === 0 || f.people.includes(t.assignee_id ?? 0)) &&
        (f.category === null || t.category_id === f.category) &&
        (!f.urgent || t.priority === 'urgent') &&
        (!f.overdue || (t.status !== 'done' && !!t.due_date && t.due_date < today)) &&
        (!text ||
          t.title.toLowerCase().includes(text) ||
          (t.client_name ?? '').toLowerCase().includes(text) ||
          String(t.id) === text.replace('#', '')),
    );
  }, [tickets, f]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );

  const onDragStart = (e: DragStartEvent) => setDragging(tickets.find((t) => t.id === e.active.id) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const t = tickets.find((x) => x.id === e.active.id);
    const target = e.over?.id as string | undefined;
    if (!t || !target) return;
    if (prefs.view === 'status') {
      const status = target as Status;
      if (status === t.status) return;
      const prev = t.status;
      update.mutate({ id: t.id, patch: { status } });
      if (status === 'done') {
        toast.success(`¡Listo! #${t.id} terminado`, {
          description: t.recurrence !== 'none' ? 'Como se repite, ya quedó creado el siguiente.' : undefined,
          action: { label: 'Deshacer', onClick: () => update.mutate({ id: t.id, patch: { status: prev } }) },
        });
      } else if (status === 'waiting') {
        setWaitingFor({ ...t, status });
      }
    } else {
      const assignee = target === 'nobody' ? null : Number(target.replace('user-', ''));
      if (assignee === t.assignee_id) return;
      const prev = t.assignee_id;
      update.mutate({ id: t.id, patch: { assignee_id: assignee } });
      const name = users.find((u) => u.id === assignee)?.name;
      toast(`#${t.id} ahora lo tiene ${name ?? 'nadie'}`, {
        action: { label: 'Deshacer', onClick: () => update.mutate({ id: t.id, patch: { assignee_id: prev } }) },
      });
    }
  };

  const activeUsers = users.filter((u) => u.active);
  // En la vista por persona también aparecen quienes ya no tienen acceso pero conservan pendientes abiertos.
  const columnsPeople = users.filter((u) => u.active || tickets.some((t) => t.assignee_id === u.id && t.status !== 'done'));

  return (
    <div>
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="eyebrow">Todo lo que se está haciendo</p>
          <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight">Tablero</h1>
        </div>
        <div className="inline-flex rounded-xl border border-line-2 bg-card p-1" role="tablist" aria-label="Vista">
          <ViewTab active={prefs.view === 'status'} onClick={() => setView('status')} icon={<Columns3 className="size-4" />}>
            Por estado
          </ViewTab>
          <ViewTab active={prefs.view === 'person'} onClick={() => setView('person')} icon={<Users className="size-4" />}>
            Por persona
          </ViewTab>
        </div>
      </header>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            className="input min-h-10 w-56 pl-9 text-[14px]"
            placeholder="Filtrar por texto o cliente"
            value={f.text}
            onChange={(e) => setFilters({ text: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-1 rounded-full border border-line-2 bg-card p-1">
          {activeUsers.map((u) => {
            const on = f.people.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => setFilters({ people: on ? f.people.filter((p) => p !== u.id) : [...f.people, u.id] })}
                className={`rounded-full transition-all ${on ? 'ring-2 ring-ink ring-offset-1' : f.people.length ? 'opacity-40 hover:opacity-80' : 'hover:scale-105'}`}
                title={u.id === me.id ? 'Solo lo mío' : `Solo lo de ${u.name}`}
              >
                <Avatar user={u} size="sm" />
              </button>
            );
          })}
        </div>
        <select
          className="input min-h-10 w-auto py-0 text-[14px]"
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
        <button onClick={() => setFilters({ urgent: !f.urgent })} className={`chip min-h-10 ${f.urgent ? 'border-clay bg-clay text-white' : 'border-line-2 bg-card text-ink-2'}`}>
          <Flame className="size-4" /> Urgentes
        </button>
        <button onClick={() => setFilters({ overdue: !f.overdue })} className={`chip min-h-10 ${f.overdue ? 'border-clay bg-clay text-white' : 'border-line-2 bg-card text-ink-2'}`}>
          <AlertTriangle className="size-4" /> Vencidos
        </button>
        {filtersOn && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => setFilters({ people: [], category: null, urgent: false, overdue: false, text: '' })}
          >
            <X className="size-4" /> Quitar filtros
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="scroll-thin -mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {prefs.view === 'status'
            ? STATUSES.map((s) => {
                const list = sortTickets(filtered.filter((t) => t.status === s));
                const shown = s === 'done' ? list.slice(0, DONE_LIMIT) : list;
                return (
                  <Column
                    key={s}
                    id={s}
                    header={<StatusHeader status={s} count={list.length} />}
                    tint={STATUS_STYLE[s].bg}
                    footer={
                      s === 'done' ? (
                        <Link to="/archivo" className="btn-ghost btn-sm w-full">
                          <Archive className="size-4" /> Ver todo lo terminado
                        </Link>
                      ) : s === 'todo' ? (
                        <button className="btn-ghost btn-sm w-full" onClick={() => ui.openNewTicket()}>
                          <Plus className="size-4" /> Agregar pendiente
                        </button>
                      ) : null
                    }
                    empty={isLoading ? 'Cargando…' : s === 'waiting' ? 'Nada en espera' : s === 'done' ? 'Aún no se termina nada' : 'Vacío'}
                  >
                    {shown.map((t) => (
                      <DraggableCard key={t.id} ticket={t} onOpen={ui.openTicket} />
                    ))}
                  </Column>
                );
              })
            : [...columnsPeople, null].map((u: User | null) => {
                const list = sortTickets(filtered.filter((t) => t.status !== 'done' && (u ? t.assignee_id === u.id : !t.assignee_id)));
                if (!u && list.length === 0) return null;
                return (
                  <Column
                    key={u?.id ?? 'nobody'}
                    id={u ? `user-${u.id}` : 'nobody'}
                    header={<PersonHeader user={u} tickets={list} />}
                    tint="bg-paper-2"
                    footer={
                      <button className="btn-ghost btn-sm w-full" onClick={() => ui.openNewTicket({ assignee_id: u?.id ?? null })}>
                        <Plus className="size-4" /> {u ? `Darle algo a ${u.name.split(' ')[0]}` : 'Agregar'}
                      </button>
                    }
                    empty="Sin pendientes abiertos"
                  >
                    {list.map((t) => (
                      <DraggableCard key={t.id} ticket={t} onOpen={ui.openTicket} hideAssignee showStatus />
                    ))}
                  </Column>
                );
              })}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {dragging ? (
            <div className="w-[300px]">
              <TicketCard ticket={dragging} overlay showStatus={prefs.view === 'person'} hideAssignee={prefs.view === 'person'} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="mt-2 hidden text-[13px] text-ink-3 sm:block">
        Arrastra una tarjeta a otra columna para cambiarla{prefs.view === 'status' ? ' de estado' : ' de persona'}. Haz clic para ver todo el detalle.
      </p>

      <WaitingDialog ticket={waitingFor} onClose={() => setWaitingFor(null)} />
    </div>
  );
}

function ViewTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[14px] font-bold transition-all ${active ? 'bg-ink text-white shadow-card' : 'text-ink-2 hover:text-ink'}`}
    >
      {icon}
      {children}
    </button>
  );
}

function Column({
  id,
  header,
  children,
  footer,
  empty,
  tint,
}: {
  id: string;
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
      className={`flex w-[86vw] max-w-[340px] shrink-0 snap-start flex-col rounded-2xl border transition-colors sm:w-[300px] xl:w-0 xl:max-w-[420px] xl:min-w-[250px] xl:flex-1 ${
        isOver ? 'border-pine bg-pine-soft/60 ring-2 ring-pine/30' : 'border-line bg-paper-2/70'
      }`}
    >
      <div className="relative overflow-hidden rounded-t-2xl px-3.5 pt-3 pb-2.5">
        <div className={`absolute inset-x-0 top-0 h-1 ${tint}`} />
        {header}
      </div>
      <div className="flex min-h-32 flex-1 flex-col gap-2.5 px-2.5 pb-2.5">
        {children.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-2 px-3 py-6 text-center text-[14px] text-ink-3">{empty}</p>
        ) : (
          children
        )}
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
      <Avatar user={user} size="md" />
      <div className="min-w-0">
        <h2 className="truncate font-display text-[19px] leading-tight font-semibold">{user?.name ?? 'Sin asignar'}</h2>
        <p className="text-[12px] font-semibold text-ink-3">
          {tickets.length} abiertos
          {overdue > 0 && <span className="text-clay"> · {overdue} vencidos</span>}
          {waiting > 0 && <span className="text-amber"> · {waiting} en espera</span>}
        </p>
      </div>
    </div>
  );
}

function DraggableCard({
  ticket,
  onOpen,
  hideAssignee,
  showStatus,
}: {
  ticket: Ticket;
  onOpen: (id: number) => void;
  hideAssignee?: boolean;
  showStatus?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`touch-manipulation outline-none ${isDragging ? 'opacity-30' : ''}`}
      aria-roledescription="Tarjeta arrastrable"
      aria-label={`#${ticket.id} ${ticket.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(ticket.id);
        else listeners?.onKeyDown?.(e);
      }}
    >
      <TicketCard ticket={ticket} onOpen={onOpen} hideAssignee={hideAssignee} showStatus={showStatus} />
    </div>
  );
}

/** Al mover algo a «Esperando», preguntamos qué se espera y cuándo revisar. */
function WaitingDialog({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const update = useUpdateTicket();
  const [waitingOn, setWaitingOn] = useState('');
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  if (ticket && ticket.id !== lastId) {
    setLastId(ticket.id);
    setWaitingOn(ticket.waiting_on ?? '');
    setFollowUp(ticket.follow_up_date);
  }
  const submit = () => {
    if (ticket) update.mutate({ id: ticket.id, patch: { waiting_on: waitingOn.trim() || null, follow_up_date: followUp } });
    onClose();
  };
  return (
    <Modal
      open={!!ticket}
      onClose={onClose}
      title="¿Qué estamos esperando?"
      subtitle={ticket ? `#${ticket.id} · ${ticket.title}` : undefined}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Ahora no
          </button>
          <button className="btn-primary" onClick={submit}>
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="waiting-on">
            ¿A quién o qué esperamos?
          </label>
          <input
            id="waiting-on"
            autoFocus
            className="input"
            value={waitingOn}
            onChange={(e) => setWaitingOn(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ej. Respuesta de la aseguradora, que el cliente pague…"
          />
        </div>
        <div>
          <span className="label">¿Cuándo volvemos a revisar?</span>
          <DueDatePicker value={followUp} onChange={setFollowUp} noneLabel="Sin recordatorio" />
          <p className="mt-2 text-[13px] text-ink-2">Ese día aparecerá en «Mi día» para dar seguimiento y no se quede olvidado.</p>
        </div>
      </div>
    </Modal>
  );
}
