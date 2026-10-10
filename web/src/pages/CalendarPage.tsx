import { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import type { Ticket } from '../../../shared/types.ts';
import { sortTickets, useCurrentUser, useTickets, useUsers } from '../lib/queries.ts';
import { formatDue, formatLongDate, parseDay, toDateStr, todayStr } from '../lib/dates.ts';
import { isLead } from '../lib/permissions.ts';
import { STATUS_STYLE } from '../lib/status.ts';
import { useIsMobile, useStoredState, useUI } from '../lib/ui.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { TicketRow } from '../components/TicketRow.tsx';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Fecha en la que un pendiente aparece en el calendario: su fecha límite o, si está esperando, su revisión. */
function calendarDate(t: Ticket) {
  return t.due_date ?? (t.status === 'waiting' ? t.follow_up_date : null);
}

export function CalendarPage() {
  const ui = useUI();
  const me = useCurrentUser();
  const lead = isLead(me);
  const mobile = useIsMobile('(max-width: 767px)');
  const { data: tickets = [] } = useTickets();
  const { data: users = [] } = useUsers();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [person, setPerson] = useState<number | 'all'>('all');
  const [selected, setSelected] = useState<string>(todayStr());
  const [storedMode, setMode] = useStoredState<'month' | 'list' | null>('gb.calendar.mode', null);
  const mode = storedMode === 'list' || storedMode === 'month' ? storedMode : mobile ? 'list' : 'month';
  const today = todayStr();

  const byDay = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of tickets) {
      if (person !== 'all' && !t.assignee_ids.includes(person)) continue;
      if (t.archived_at) continue;
      const date = calendarDate(t);
      if (!date) continue;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(t);
    }
    for (const [k, v] of map) map.set(k, sortTickets(v));
    return map;
  }, [tickets, person]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const selectedList = byDay.get(selected) ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="eyebrow">Fechas límite y seguimientos</p>
          <h1 className="page-title capitalize">{mode === 'month' ? format(month, 'MMMM yyyy', { locale: es }) : 'Agenda'}</h1>
        </div>
        <div className="inline-flex rounded-xl border border-line-2 bg-card p-1" role="tablist" aria-label="Vista del calendario">
          {(
            [
              ['month', 'Mes', <CalendarDays key="m" className="size-4" />],
              ['list', 'Agenda', <List key="l" className="size-4" />],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-[14px] font-bold ${mode === value ? 'bg-ink text-paper' : 'text-ink-2'}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        {mode === 'month' && (
          <div className="flex items-center gap-1">
            <button className="btn-secondary btn-icon" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior">
              <ChevronLeft className="size-5" />
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setSelected(today);
              }}
            >
              Hoy
            </button>
            <button className="btn-secondary btn-icon" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente">
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </header>

      {lead && (
        <div className="scroll-row -mx-4 mt-4 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Ver de quién">
          <button
            onClick={() => setPerson('all')}
            aria-pressed={person === 'all'}
            className={`min-h-10 shrink-0 rounded-full px-3.5 text-[14px] font-bold ${person === 'all' ? 'bg-ink text-paper' : 'border border-line-2 bg-card text-ink-2'}`}
          >
            Todos
          </button>
          {users
            .filter((u) => u.active)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => setPerson(person === u.id ? 'all' : u.id)}
                aria-pressed={person === u.id}
                className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-all ${person === u.id ? 'bg-pine-soft ring-2 ring-pine' : 'opacity-70 hover:opacity-100'}`}
                title={u.id === me.id ? 'Solo lo mío' : u.name}
                aria-label={u.id === me.id ? 'Solo lo mío' : `Solo lo de ${u.name}`}
              >
                <Avatar user={u} size="sm" />
              </button>
            ))}
        </div>
      )}

      {mode === 'list' ? (
        <Agenda byDay={byDay} />
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="panel overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-paper-2/60">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2 text-center text-[12px] font-bold tracking-wider text-ink-3 uppercase">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = toDateStr(day);
                const list = byDay.get(key) ?? [];
                const inMonth = isSameMonth(day, month);
                const isToday = key === today;
                const isSel = key === selected;
                const open = list.filter((t) => t.status !== 'done');
                const late = key < today && open.length > 0;
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    onDoubleClick={() => ui.openNewTicket({ due_date: key })}
                    aria-label={`${formatLongDate(key)}: ${list.length} pendiente${list.length === 1 ? '' : 's'}`}
                    aria-pressed={isSel}
                    className={`group relative flex min-h-[64px] flex-col items-stretch border-r border-b border-line/70 p-1 text-left transition-colors sm:min-h-[112px] sm:p-1.5 ${
                      inMonth ? 'bg-card' : 'bg-paper/60 text-ink-3'
                    } ${isSel ? 'ring-2 ring-pine ring-inset' : 'hover:bg-paper-2/50'}`}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={`flex size-7 items-center justify-center rounded-full text-[13px] font-bold ${isToday ? 'bg-pine-solid text-white' : late ? 'text-clay' : ''}`}
                      >
                        {day.getDate()}
                      </span>
                    </span>
                    {list.length > 0 && (
                      <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                        {list.slice(0, 4).map((t) => (
                          <span key={t.id} className={`size-2 rounded-full ${t.status === 'done' ? 'bg-line-2' : late ? 'bg-clay-solid' : STATUS_STYLE[t.status].dot}`} />
                        ))}
                        {list.length > 4 && <span className="text-[10px] leading-2 font-bold text-ink-3">+</span>}
                      </span>
                    )}
                    <span className="mt-1 hidden flex-col gap-1 sm:flex">
                      {list.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            ui.openTicket(t.id);
                          }}
                          className={`flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${STATUS_STYLE[t.status].bg} ${
                            t.status === 'done' ? 'text-ink-3 line-through' : 'text-ink'
                          }`}
                          title={t.title}
                        >
                          <span className={`size-1.5 shrink-0 rounded-full ${STATUS_STYLE[t.status].dot}`} />
                          <span className="truncate">{t.title}</span>
                        </span>
                      ))}
                      {list.length > 3 && <span className="px-1.5 text-[12px] font-bold text-ink-3">+{list.length - 3} más</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="panel h-fit p-4 xl:sticky xl:top-20">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-[20px] font-semibold">{selected === today ? 'Hoy' : formatLongDate(selected)}</h2>
              <button className="btn-secondary btn-sm ml-auto" onClick={() => ui.openNewTicket({ due_date: selected })}>
                <Plus className="size-4" /> Agregar
              </button>
            </div>
            {selectedList.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-2 px-4 py-8 text-center text-[14px] text-ink-3">
                Nada para este día. <span className="touch:hidden">Doble clic en un día del calendario para agregar un pendiente.</span>
              </p>
            ) : (
              <div className="space-y-2">
                {selectedList.map((t) => (
                  <div key={t.id}>
                    {!t.due_date && <p className="mb-1 text-[12px] font-bold text-amber">Seguimiento</p>}
                    <TicketRow ticket={t} onOpen={ui.openTicket} showAssignee />
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/** Lista por día: lo vencido arriba y luego los próximos 60 días. Cómoda en el celular. */
function Agenda({ byDay }: { byDay: Map<string, Ticket[]> }) {
  const ui = useUI();
  const today = todayStr();
  const limit = toDateStr(addMonths(new Date(), 2));
  const overdue = sortTickets([...byDay.entries()].filter(([d]) => d < today).flatMap(([, l]) => l.filter((t) => t.status !== 'done')));
  const upcoming = [...byDay.entries()].filter(([d]) => d >= today && d <= limit).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="mx-auto mt-5 max-w-3xl space-y-7">
      {overdue.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-display text-[20px] font-semibold text-clay">
            Ya pasó la fecha <span className="rounded-full bg-clay-soft px-2 text-[13px] font-bold">{overdue.length}</span>
          </h2>
          <div className="space-y-2">
            {overdue.map((t) => (
              <TicketRow key={t.id} ticket={t} onOpen={ui.openTicket} showAssignee />
            ))}
          </div>
        </section>
      )}
      {upcoming.length === 0 && overdue.length === 0 && (
        <p className="panel px-4 py-10 text-center text-ink-3">No hay nada con fecha en los próximos dos meses.</p>
      )}
      {upcoming.map(([day, list]) => (
        <section key={day}>
          <h2 className="sticky top-[calc(env(safe-area-inset-top)+61px)] z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-paper/95 px-1 py-1.5 backdrop-blur">
            <span className={`font-display text-[19px] font-semibold ${day === today ? 'text-pine' : ''}`}>{day === today ? 'Hoy' : formatDue(day)}</span>
            <span className="text-[13px] text-ink-3">{format(parseDay(day), "d 'de' MMMM", { locale: es })}</span>
            <button className="btn-ghost btn-sm ml-auto" onClick={() => ui.openNewTicket({ due_date: day })} aria-label={`Agregar pendiente para ${formatLongDate(day)}`}>
              <Plus className="size-4" />
            </button>
          </h2>
          <div className="space-y-2">
            {list.map((t) => (
              <div key={t.id}>
                {!t.due_date && <p className="mb-1 text-[12px] font-bold text-amber">Seguimiento</p>}
                <TicketRow ticket={t} onOpen={ui.openTicket} showAssignee />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
