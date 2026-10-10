import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { api } from '../lib/api.ts';
import { qk, useNotifications, useUserMap } from '../lib/queries.ts';
import { timeAgo } from '../lib/dates.ts';
import { Avatar } from './Avatar.tsx';
import { Menu } from './Menu.tsx';

export function NotificationsMenu({ onOpenTicket }: { onOpenTicket: (id: number) => void }) {
  const qc = useQueryClient();
  const users = useUserMap();
  const { data } = useNotifications();
  const unread = data?.unread ?? 0;
  // Los avisos del navegador solo existen en conexiones seguras (https o localhost).
  const [permission, setPermission] = useState(() =>
    window.isSecureContext && 'Notification' in window ? Notification.permission : 'denied',
  );

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Giraboard` : 'Giraboard';
  }, [unread]);

  const markRead = async (ids?: number[]) => {
    await api.post('/notifications/read', ids ? { ids } : {});
    qc.invalidateQueries({ queryKey: qk.notifications });
  };

  return (
    <Menu
      width="w-[min(92vw,400px)]"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className={`btn-ghost relative size-11 px-0 ${open ? 'bg-paper-2' : ''}`}
          aria-label={`Avisos${unread ? ` (${unread} sin leer)` : ''}`}
        >
          {unread > 0 ? <BellRing className="size-[22px] text-ink" /> : <Bell className="size-[22px]" />}
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-clay-solid px-1 text-[11px] leading-5 font-bold text-white ring-2 ring-paper">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-3 pt-2 pb-2">
            <h3 className="font-display text-lg font-semibold">Avisos</h3>
            {unread > 0 && (
              <button className="btn-ghost btn-sm" onClick={() => markRead()}>
                <CheckCheck className="size-4" /> Marcar todo leído
              </button>
            )}
          </div>
          {permission === 'default' && (
            <button
              className="mx-1 mb-2 w-[calc(100%-0.5rem)] rounded-xl bg-pine-soft px-3 py-2.5 text-left text-[14px] font-semibold text-pine hover:bg-pine-soft/70"
              onClick={async () => setPermission(await Notification.requestPermission())}
            >
              🔔 Activar avisos en esta computadora, para enterarte aunque estés en otra ventana
            </button>
          )}
          <div className="scroll-thin max-h-[60vh] overflow-y-auto">
            {(data?.items ?? []).length === 0 && (
              <p className="px-3 py-8 text-center text-ink-3">No tienes avisos todavía.</p>
            )}
            {(data?.items ?? []).map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  close();
                  if (!n.read_at) markRead([n.id]);
                  if (n.ticket_id) onOpenTicket(n.ticket_id);
                }}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-paper-2 ${n.read_at ? '' : 'bg-pine-soft/40'}`}
              >
                {n.actor_id ? (
                  <Avatar user={users.get(n.actor_id)} size="sm" />
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-soft text-amber">
                    <Bell className="size-3.5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] leading-snug ${n.read_at ? 'text-ink-2' : 'font-semibold text-ink'}`}>
                    {n.message}
                  </span>
                  <span className="text-[12px] text-ink-3">{timeAgo(n.created_at)}</span>
                </span>
                {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-clay-solid" aria-label="Sin leer" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </Menu>
  );
}
