import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { NewTicket } from './queries.ts';

type UI = {
  openTicket: (id: number) => void;
  closeTicket: () => void;
  openNewTicket: (prefill?: Partial<NewTicket> & { client_name?: string }) => void;
  openSearch: () => void;
  openHelp: () => void;
};

const UIContext = createContext<UI | null>(null);

export function UIProvider({ value, children }: { value: UI; children: ReactNode }) {
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI fuera de UIProvider');
  return ctx;
}

/** El pendiente abierto vive en la URL (?p=12) para poder compartir el enlace y usar "atrás". */
export function useOpenTicketParam() {
  const [params, setParams] = useSearchParams();
  const id = Number(params.get('p')) || null;
  const open = useCallback(
    (tid: number) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('p', String(tid));
          return next;
        },
        { replace: !!params.get('p') },
      ),
    [setParams, params],
  );
  const close = useCallback(
    () =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('p');
        return next;
      }),
    [setParams],
  );
  return { id, open, close };
}

/**
 * Escucha cambios en tiempo real y avisos personales (Server-Sent Events).
 * Devuelve false si se perdió la conexión con el servidor por más de unos segundos.
 */
export function useRealtime(onOpenTicket: (id: number) => void) {
  const qc = useQueryClient();
  const openRef = useRef(onOpenTicket);
  openRef.current = onOpenTicket;
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let es: EventSource | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let offlineTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' }), 250);
    };

    const connect = () => {
      if (disposed) return;
      es = new EventSource('/api/events');
      es.addEventListener('ready', () => {
        clearTimeout(offlineTimer);
        setOnline(true);
        refresh();
      });
      es.addEventListener('changed', refresh);
      es.addEventListener('notification', (e) => {
        const data = JSON.parse((e as MessageEvent).data) as { message: string; ticket_id: number | null };
        qc.invalidateQueries({ queryKey: ['notifications'] });
        toast(data.message, {
          duration: 10_000,
          action: data.ticket_id ? { label: 'Ver', onClick: () => openRef.current(data.ticket_id!) } : undefined,
        });
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const n = new Notification('Giraboard', { body: data.message, icon: '/icon-192.png', tag: `gb-${data.ticket_id}` });
          n.onclick = () => {
            window.focus();
            if (data.ticket_id) openRef.current(data.ticket_id);
          };
        }
      });
      es.onerror = () => {
        clearTimeout(offlineTimer);
        offlineTimer = setTimeout(() => setOnline(false), 4000);
        // Si el navegador dejó de reintentar (p. ej. el servidor se reinició), volvemos a conectar.
        if (es?.readyState === EventSource.CLOSED) {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, 5000);
        }
      };
    };
    connect();

    return () => {
      disposed = true;
      clearTimeout(refreshTimer);
      clearTimeout(offlineTimer);
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [qc]);

  return online;
}
