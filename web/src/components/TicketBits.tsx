import { ArrowUp, CalendarClock, Flame, Hourglass, Repeat } from 'lucide-react';
import type { Category, Ticket } from '../../../shared/types.ts';
import { STATUS_LABEL } from '../../../shared/types.ts';
import { dueTone, formatDue } from '../lib/dates.ts';
import { STATUS_STYLE } from '../lib/status.ts';

// Fechas: entre más cerca, más intenso (rojo = ya pasó o es hoy). El ámbar se reserva para «Esperando».
const DUE_TONE = {
  overdue: 'bg-clay-solid text-white',
  today: 'bg-clay-soft text-clay',
  soon: 'bg-paper-3 text-ink',
  later: 'bg-paper-2 text-ink-2',
  none: 'bg-paper-2 text-ink-3',
};

export function DueChip({ date, done = false, size = 'sm' }: { date: string | null; done?: boolean; size?: 'sm' | 'md' }) {
  if (!date) return null;
  const tone = done ? 'later' : dueTone(date);
  const label = formatDue(date);
  return (
    <span
      title={tone === 'overdue' ? 'Ya pasó la fecha límite' : 'Fecha límite'}
      className={`inline-flex items-center gap-1 rounded-md font-bold whitespace-nowrap ${DUE_TONE[tone]} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[12px]' : 'px-2 py-1 text-[13px]'
      }`}
    >
      <CalendarClock className={size === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2.3} />
      {tone === 'overdue' ? `Venció ${label.toLowerCase()}` : label}
    </span>
  );
}

export function StatusPill({ status }: { status: Ticket['status'] }) {
  const st = STATUS_STYLE[status];
  const Icon = st.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold whitespace-nowrap ${st.bg} ${st.text}`}>
      <Icon className="size-3.5" strokeWidth={2.5} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CategoryTag({ category }: { category: Category | undefined | null }) {
  if (!category) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-wide whitespace-nowrap text-ink-2">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} />
      {category.name}
    </span>
  );
}

export function PriorityFlag({ priority }: { priority: Ticket['priority'] }) {
  if (priority === 'normal') return null;
  return priority === 'urgent' ? (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-clay-solid px-1.5 py-0.5 text-[12px] font-bold text-white">
      <Flame className="size-3.5" /> Urgente
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 rounded-md border border-clay/40 px-1.5 py-px text-[12px] font-bold text-clay">
      <ArrowUp className="size-3.5" strokeWidth={2.6} /> Importante
    </span>
  );
}

export function WaitingNote({ ticket }: { ticket: Ticket }) {
  if (ticket.status !== 'waiting' || (!ticket.waiting_on && !ticket.follow_up_date)) return null;
  const tone = ticket.follow_up_date ? dueTone(ticket.follow_up_date) : 'none';
  const due = tone === 'overdue' || tone === 'today';
  return (
    <div className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[13px] leading-snug ${due ? 'bg-amber-soft text-amber' : 'bg-paper-2/70 text-ink-2'}`}>
      <Hourglass className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} />
      <span>
        {ticket.waiting_on ? <b className="font-semibold">{ticket.waiting_on}</b> : 'Esperando'}
        {ticket.follow_up_date && (
          <span className={due ? 'font-bold' : ''}>
            {' · '}
            {due ? '¡Toca revisar!' : `revisar ${formatDue(ticket.follow_up_date).toLowerCase()}`}
          </span>
        )}
      </span>
    </div>
  );
}

export function RecurrenceIcon({ ticket }: { ticket: Ticket }) {
  if (ticket.recurrence === 'none') return null;
  return <Repeat className="size-3.5 text-ink-3" aria-label="Se repite" />;
}

export function ProgressBar({ done, total, className = '' }: { done: number; total: number; className?: string }) {
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className={`flex items-center gap-2 ${className}`} title={`${done} de ${total} pasos hechos`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-moss-solid' : 'bg-pine-solid'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[12px] font-bold text-ink-2 tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}
