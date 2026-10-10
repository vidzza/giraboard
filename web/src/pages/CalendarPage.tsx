import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Ticket } from '../../../shared/types.ts';
import { sortTickets, useCurrentUser, useTickets, useUsers } from '../lib/queries.ts';
import { formatLongDate, toDateStr, todayStr } from '../lib/dates.ts';
import { STATUS_STYLE } from '../lib/status.ts';
import { useUI } from '../lib/ui.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { TicketRow } from '../components/TicketRow.tsx';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function CalendarPage() {
  const ui = useUI();
  const me = useCurrentUser();
  const { data: tickets = [] } = useTickets();
  const { data: users = [] } = useUsers();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [person, setPerson] = useState<number | 'all'>('all');
  const [selected, setSelected] = useState<string>(todayStr());
  const today = todayStr();

  const byDay = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of tickets) {
      if (person !== 'all' && t.assignee_id !== person) continue;
      // Pendientes con fecha límite, y seguimientos de los que están esperando
      const date = t.due_date ?? (t.status === 'waiting' ? t.follow_up_date : null);
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
          <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight capitalize">
            {format(month, 'MMMM yyyy', { locale: es })}
          </h1>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-line-2 bg-card p-1">
          <button
            onClick={() => setPerson('all')}
            className={`rounded-full px-3 py-1 text-[13px] font-bold ${person === 'all' ? 'bg-ink text-white' : 'text-ink-2'}`}
          >
            Todos
          </button>
          {users
            .filter((u) => u.active)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => setPerson(person === u.id ? 'all' : u.id)}
                className={`rounded-full transition-all ${person === u.id ? 'ring-2 ring-ink ring-offset-1' : 'opacity-60 hover:opacity-100'}`}
                title={u.id === me.id ? 'Solo lo mío' : u.name}
              >
                <Avatar user={u} size="sm" />
              </button>
            ))}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-secondary size-10 px-0" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior">
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
          <button className="btn-secondary size-10 px-0" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </header>

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
                  className={`group relative flex min-h-[74px] flex-col items-stretch border-r border-b border-line/70 p-1.5 text-left transition-colors sm:min-h-[112px] ${
                    inMonth ? 'bg-card' : 'bg-paper/60 text-ink-3'
                  } ${isSel ? 'ring-2 ring-pine ring-inset' : 'hover:bg-paper-2/50'}`}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className={`flex size-7 items-center justify-center rounded-full text-[13px] font-bold ${
                        isToday ? 'bg-pine text-white' : late ? 'text-clay' : ''
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {list.length > 0 && (
                      <span className={`rounded-full px-1.5 text-[11px] font-bold sm:hidden ${late ? 'bg-clay text-white' : 'bg-paper-3 text-ink-2'}`}>
                        {list.length}
                      </span>
                    )}
                  </span>
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
              Nada para este día. Doble clic en un día del calendario para agregar un pendiente.
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
    </div>
  );
}
