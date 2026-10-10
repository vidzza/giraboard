import { memo } from 'react';
import { MessageSquareText, Paperclip, Moon, UserRound } from 'lucide-react';
import { STALE_DAYS, type Ticket } from '../../../shared/types.ts';
import { useCategoryMap, useUserMap } from '../lib/queries.ts';
import { daysSince } from '../lib/dates.ts';
import { Avatar } from './Avatar.tsx';
import { CategoryTag, DueChip, PriorityFlag, ProgressBar, RecurrenceIcon, StatusPill, WaitingNote } from './TicketBits.tsx';

export const TicketCard = memo(function TicketCard({
  ticket,
  onOpen,
  overlay = false,
  hideAssignee = false,
  showStatus = false,
}: {
  ticket: Ticket;
  onOpen?: (id: number) => void;
  overlay?: boolean;
  hideAssignee?: boolean;
  showStatus?: boolean;
}) {
  const users = useUserMap();
  const categories = useCategoryMap();
  const category = ticket.category_id ? categories.get(ticket.category_id) : null;
  const done = ticket.status === 'done';
  const idle = !done && daysSince(ticket.last_activity_at) >= STALE_DAYS ? daysSince(ticket.last_activity_at) : 0;

  return (
    <article
      onClick={() => onOpen?.(ticket.id)}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card pl-4 pr-3 py-3 transition-[box-shadow,transform,border-color] duration-150 ${
        overlay
          ? 'rotate-[1.5deg] border-pine/40 shadow-lift'
          : 'border-line shadow-card hover:-translate-y-px hover:border-line-2 hover:shadow-lift'
      } ${idle ? 'bg-[#fbf6e9]' : ''} ${done ? 'opacity-75' : ''}`}
    >
      <span
        className="absolute inset-y-0 left-0 w-[5px]"
        style={{ backgroundColor: category?.color ?? 'var(--color-line-2)' }}
        aria-hidden
      />
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[12px] font-bold text-ink-3 tabular-nums">#{ticket.id}</span>
        <CategoryTag category={category} />
        <span className="ml-auto flex items-center gap-1">
          {showStatus && <StatusPill status={ticket.status} />}
          <RecurrenceIcon ticket={ticket} />
          <PriorityFlag priority={ticket.priority} />
        </span>
      </div>
      <h3 className={`text-[15px] leading-snug font-semibold text-ink line-clamp-3 ${done ? 'line-through decoration-ink-3/50' : ''}`}>
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
      <div className="mt-2.5 flex items-center gap-2">
        <DueChip date={ticket.due_date} done={done} />
        {ticket.comment_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-ink-3" title="Comentarios">
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
        {!hideAssignee && (
          <Avatar user={ticket.assignee_id ? users.get(ticket.assignee_id) : null} size="sm" className="ml-auto" />
        )}
      </div>
    </article>
  );
});
