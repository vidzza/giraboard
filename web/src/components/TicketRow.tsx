import { Check, Clock, MessageSquareText, UserRound } from 'lucide-react';
import { addDays, nextMonday } from 'date-fns';
import { toast } from 'sonner';
import type { Ticket } from '../../../shared/types.ts';
import { useCategoryMap, useUpdateTicket, useUserMap, type TicketPatch } from '../lib/queries.ts';
import { toDateStr } from '../lib/dates.ts';
import { Avatar } from './Avatar.tsx';
import { CategoryTag, DueChip, PriorityFlag, ProgressBar, StatusPill, WaitingNote } from './TicketBits.tsx';
import { Menu, MenuItem } from './Menu.tsx';

function short(t: string) {
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

/** Marcar como listo con opción de deshacer. */
export function useCompleteTicket() {
  const update = useUpdateTicket();
  return (t: Ticket) => {
    const prev = t.status;
    update.mutate({ id: t.id, patch: { status: 'done' } });
    toast.success(`¡Listo! «${short(t.title)}»`, {
      description: t.recurrence !== 'none' ? 'Como se repite, ya quedó creado el siguiente.' : undefined,
      duration: 8000,
      action: { label: 'Deshacer', onClick: () => update.mutate({ id: t.id, patch: { status: prev } }) },
    });
  };
}

export function usePostpone() {
  const update = useUpdateTicket();
  return (t: Ticket, date: string, label: string) => {
    const useFollowUp = t.status === 'waiting' && !!t.follow_up_date;
    const patch: TicketPatch = useFollowUp ? { follow_up_date: date } : { due_date: date };
    const before: TicketPatch = useFollowUp ? { follow_up_date: t.follow_up_date } : { due_date: t.due_date };
    update.mutate({ id: t.id, patch });
    toast(`Movido para ${label.toLowerCase()}`, {
      duration: 6000,
      action: { label: 'Deshacer', onClick: () => update.mutate({ id: t.id, patch: before }) },
    });
  };
}

export function TicketRow({
  ticket,
  onOpen,
  showAssignee = false,
  showStatus = true,
  delay = 0,
}: {
  ticket: Ticket;
  onOpen: (id: number) => void;
  showAssignee?: boolean;
  showStatus?: boolean;
  delay?: number;
}) {
  const users = useUserMap();
  const categories = useCategoryMap();
  const complete = useCompleteTicket();
  const postpone = usePostpone();
  const done = ticket.status === 'done';
  const category = ticket.category_id ? categories.get(ticket.category_id) : null;
  const now = new Date();

  return (
    <div
      onClick={() => onOpen(ticket.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(ticket.id);
      }}
      role="button"
      tabIndex={0}
      aria-label={`#${ticket.id} ${ticket.title}`}
      style={{ animationDelay: `${delay}ms` }}
      className="group @container animate-rise cursor-pointer rounded-2xl border border-line bg-card px-3.5 py-3 shadow-card transition-all hover:border-line-2 hover:shadow-lift sm:px-4"
    >
      {/* En espacios angostos la fecha y acciones bajan debajo del título */}
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 @lg:grid-cols-[auto_1fr_auto]">
        <button
          type="button"
          aria-label={done ? 'Terminado' : 'Marcar como listo'}
          title={done ? 'Terminado' : 'Marcar como listo'}
          disabled={done}
          onClick={(e) => {
            e.stopPropagation();
            complete(ticket);
          }}
          className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            done
              ? 'border-moss bg-moss text-white'
              : 'border-ink-3/50 text-transparent hover:border-moss hover:bg-moss-soft hover:text-moss'
          }`}
        >
          <Check className="size-4" strokeWidth={3} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[12px] font-bold text-ink-3 tabular-nums">#{ticket.id}</span>
            <CategoryTag category={category} />
            <PriorityFlag priority={ticket.priority} />
            {showStatus && ticket.status !== 'todo' && <StatusPill status={ticket.status} />}
          </div>
          <p className={`mt-0.5 text-[16px] leading-snug font-semibold ${done ? 'text-ink-3 line-through' : 'text-ink'}`}>{ticket.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            {ticket.client_name && (
              <span className="inline-flex items-center gap-1 font-medium">
                <UserRound className="size-3.5 text-ink-3" />
                {ticket.client_name}
              </span>
            )}
            {ticket.comment_count > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-3">
                <MessageSquareText className="size-3.5" /> {ticket.comment_count}
              </span>
            )}
            {ticket.checklist_total > 0 && <ProgressBar done={ticket.checklist_done} total={ticket.checklist_total} className="w-28" />}
          </div>
          {!done && ticket.status === 'waiting' && (
            <div className="mt-2 max-w-md">
              <WaitingNote ticket={ticket} />
            </div>
          )}
        </div>

        <div className="col-start-2 flex items-center gap-2 @lg:col-start-3 @lg:row-start-1 @lg:flex-col @lg:items-end @2xl:flex-row @2xl:items-center">
          <DueChip date={ticket.due_date} done={done} size="md" />
          {showAssignee && <Avatar user={ticket.assignee_id ? users.get(ticket.assignee_id) : null} size="sm" />}
          {!done && (
            <Menu
              width="w-56"
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="btn-ghost btn-sm text-ink-3 @lg:opacity-60 @lg:group-hover:opacity-100"
                  title="Posponer"
                >
                  <Clock className="size-4" />
                  <span className="hidden @2xl:inline">Posponer</span>
                </button>
              )}
            >
              {(close) => (
                <>
                  <p className="px-3 pt-1.5 pb-1 eyebrow">
                    {ticket.status === 'waiting' && ticket.follow_up_date ? 'Revisar de nuevo…' : 'Mover fecha a…'}
                  </p>
                  {[
                    { label: 'Mañana', date: toDateStr(addDays(now, 1)) },
                    { label: 'Pasado mañana', date: toDateStr(addDays(now, 2)) },
                    { label: 'El próximo lunes', date: toDateStr(nextMonday(now)) },
                    { label: 'En una semana', date: toDateStr(addDays(now, 7)) },
                  ].map((o) => (
                    <MenuItem
                      key={o.label}
                      onClick={() => {
                        close();
                        postpone(ticket, o.date, o.label);
                      }}
                    >
                      {o.label}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          )}
        </div>
      </div>
    </div>
  );
}
