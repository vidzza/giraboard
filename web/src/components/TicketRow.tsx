import type { ReactNode } from 'react';
import { Check, Eye, MessageSquareText, Paperclip, UserRound } from 'lucide-react';
import type { Ticket } from '../../../shared/types.ts';
import { useCategoryMap, useCurrentUser } from '../lib/queries.ts';
import { AvatarStack } from './Avatar.tsx';
import { CategoryTag, DueChip, PriorityFlag, ProgressBar, RecurrenceIcon, StatusPill, WaitingNote } from './TicketBits.tsx';
import { PostponeMenuButton, StatusMenuButton, useCompleteTicket } from './TicketActions.tsx';

// Se re-exportan para quien ya los usaba desde aquí.
export { useCompleteTicket, usePostpone } from './TicketActions.tsx';

/** Fila de pendiente para listas («Mi día», calendario, clientes, archivo). */
export function TicketRow({
  ticket,
  onOpen,
  showAssignee = false,
  showStatus = true,
  delay = 0,
  extra,
}: {
  ticket: Ticket;
  onOpen: (id: number) => void;
  showAssignee?: boolean;
  showStatus?: boolean;
  delay?: number;
  /** Acciones adicionales (p. ej. «Asignar» en la bandeja). */
  extra?: ReactNode;
}) {
  const me = useCurrentUser();
  const categories = useCategoryMap();
  const complete = useCompleteTicket();
  const done = ticket.status === 'done';
  const closed = done || !!ticket.archived_at;
  const category = ticket.category_id ? categories.get(ticket.category_id) : null;
  const following = ticket.follower_ids.includes(me.id) && !ticket.assignee_ids.includes(me.id);

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
      className="group @container animate-rise cursor-pointer rounded-2xl border border-line bg-card px-3 py-3 shadow-card transition-[box-shadow,border-color] hover:border-line-2 hover:shadow-lift sm:px-4"
    >
      {/* En espacios angostos la fecha y las acciones bajan debajo del título */}
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 @xl:grid-cols-[auto_1fr_auto]">
        <button
          type="button"
          aria-label={done ? 'Terminado' : `Marcar #${ticket.id} como listo`}
          title={done ? 'Terminado' : 'Marcar como listo'}
          disabled={closed}
          onClick={(e) => {
            e.stopPropagation();
            complete(ticket);
          }}
          className={`-m-1.5 flex size-11 shrink-0 items-center justify-center rounded-full disabled:cursor-default`}
        >
          <span
            className={`flex size-7 items-center justify-center rounded-full border-2 transition-all ${
              done
                ? 'border-moss-solid bg-moss-solid text-white'
                : 'border-field text-transparent group-hover:border-ink-3 hover:border-moss-solid! hover:bg-moss-soft hover:text-moss!'
            }`}
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[12px] font-bold text-ink-3 tabular-nums">#{ticket.id}</span>
            <CategoryTag category={category} />
            <PriorityFlag priority={ticket.priority} />
            {showStatus && ticket.status !== 'todo' && <StatusPill status={ticket.status} />}
            {ticket.archived_at && <span className="rounded-full bg-paper-3 px-2 py-0.5 text-[12px] font-bold text-ink-2">Archivado</span>}
            <RecurrenceIcon ticket={ticket} />
          </div>
          <p className={`mt-0.5 text-[16px] leading-snug font-semibold break-words ${done ? 'text-ink-3 line-through' : 'text-ink'}`}>
            {ticket.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            {ticket.client_name && (
              <span className="inline-flex min-w-0 items-center gap-1 font-medium">
                <UserRound className="size-3.5 shrink-0 text-ink-3" />
                <span className="truncate">{ticket.client_name}</span>
              </span>
            )}
            {following && (
              <span className="inline-flex items-center gap-1 font-semibold text-ink-3" title="Estás en copia: lo ves y te llegan avisos">
                <Eye className="size-3.5" /> En copia
              </span>
            )}
            {ticket.comment_count > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-3" title="Notas">
                <MessageSquareText className="size-3.5" /> {ticket.comment_count}
              </span>
            )}
            {ticket.attachment_count > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-3" title="Archivos">
                <Paperclip className="size-3.5" /> {ticket.attachment_count}
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

        <div
          className="col-span-2 flex flex-wrap items-center gap-1.5 pl-1 @xl:col-span-1 @xl:col-start-3 @xl:row-start-1 @xl:justify-end @xl:pl-0"
          onClick={(e) => e.stopPropagation()}
        >
          <DueChip date={ticket.due_date} done={done} size="md" />
          {showAssignee && <AvatarStack ids={ticket.assignee_ids} size="sm" />}
          {extra}
          {!closed && (
            <span className="flex items-center can-hover:opacity-70 can-hover:group-hover:opacity-100 can-hover:focus-within:opacity-100">
              <PostponeMenuButton ticket={ticket} labelClass="@xl:hidden" />
              <StatusMenuButton ticket={ticket} labelClass="@xl:hidden" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
