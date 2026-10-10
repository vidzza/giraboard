import { memo, type ReactNode } from 'react';
import { MessageSquareText, Paperclip, Moon, UserRound } from 'lucide-react';
import { STALE_DAYS, type Ticket } from '../../../shared/types.ts';
import { useCategoryMap } from '../lib/queries.ts';
import { daysSince } from '../lib/dates.ts';
import { AvatarStack } from './Avatar.tsx';
import { CategoryTag, DueChip, PriorityFlag, ProgressBar, RecurrenceIcon, StatusPill, WaitingNote } from './TicketBits.tsx';

/** Tarjeta del tablero. */
export const TicketCard = memo(function TicketCard({
  ticket,
  onOpen,
  overlay = false,
  hideAssignee = false,
  showStatus = false,
  actions,
  actionsLayout = 'row',
}: {
  ticket: Ticket;
  onOpen?: (id: number) => void;
  overlay?: boolean;
  hideAssignee?: boolean;
  showStatus?: boolean;
  /** Botones extra (p. ej. «Mover»). En celular van en una fila al pie; en computadora, junto a la fecha. */
  actions?: ReactNode;
  actionsLayout?: 'row' | 'inline';
}) {
  const categories = useCategoryMap();
  const category = ticket.category_id ? categories.get(ticket.category_id) : null;
  const done = ticket.status === 'done';
  const idle = !done && daysSince(ticket.last_activity_at) >= STALE_DAYS ? daysSince(ticket.last_activity_at) : 0;

  return (
    <article
      onClick={() => onOpen?.(ticket.id)}
      className={`group relative cursor-pointer rounded-xl border py-3 pr-3 pl-4 transition-[box-shadow,transform,border-color] duration-150 ${
        overlay
          ? 'rotate-[1.5deg] border-pine/40 bg-card shadow-lift'
          : 'border-line shadow-card can-hover:hover:-translate-y-px hover:border-line-2 hover:shadow-lift'
      } ${idle ? 'bg-amber-soft/45' : 'bg-card'} ${done ? 'opacity-80' : ''}`}
    >
      <span className="absolute inset-y-0 -left-px w-[5px] rounded-l-xl" style={{ backgroundColor: category?.color ?? 'var(--color-line-2)' }} aria-hidden />
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] font-bold text-ink-3 tabular-nums">#{ticket.id}</span>
        <CategoryTag category={category} />
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {showStatus && <StatusPill status={ticket.status} />}
          <RecurrenceIcon ticket={ticket} />
          <PriorityFlag priority={ticket.priority} />
        </span>
      </div>
      <h3 className={`line-clamp-3 text-[15px] leading-snug font-semibold break-words text-ink ${done ? 'line-through decoration-ink-3/50' : ''}`}>
        {ticket.title}
      </h3>
      {ticket.client_name && (
        <p className="mt-1 flex items-center gap-1 text-[13px] font-medium text-ink-2">
          <UserRound className="size-3.5 shrink-0 text-ink-3" />
          <span className="truncate">{ticket.client_name}</span>
        </p>
      )}
      {!done && (
        <div className="mt-2 empty:hidden">
          <WaitingNote ticket={ticket} />
        </div>
      )}
      <ProgressBar done={ticket.checklist_done} total={ticket.checklist_total} className="mt-2.5" />
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <DueChip date={ticket.due_date} done={done} />
        {ticket.comment_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-ink-3" title="Notas">
            <MessageSquareText className="size-3.5" /> {ticket.comment_count}
          </span>
        )}
        {ticket.attachment_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-ink-3" title="Archivos">
            <Paperclip className="size-3.5" /> {ticket.attachment_count}
          </span>
        )}
        {idle > 0 && (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber" title="Nadie lo ha movido en días">
            <Moon className="size-3.5" /> {idle} días quieto
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {actions && actionsLayout === 'inline' && (
            <span
              className="flex items-center can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              {actions}
            </span>
          )}
          {!hideAssignee && <AvatarStack ids={ticket.assignee_ids} size="sm" />}
        </span>
      </div>
      {actions && actionsLayout === 'row' && (
        <div className="-mx-1.5 mt-2 flex items-center justify-end gap-1 border-t border-line pt-1.5" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </article>
  );
});
