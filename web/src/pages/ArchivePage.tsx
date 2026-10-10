import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { Ticket } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { formatDateTime } from '../lib/dates.ts';
import { useUI } from '../lib/ui.tsx';
import { TicketRow } from '../components/TicketRow.tsx';

export function ArchivePage() {
  const ui = useUI();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ['archive', debounced, page],
    queryFn: () =>
      api.get<{ items: Ticket[]; total: number; page: number; page_size: number }>(
        `/tickets/archive?q=${encodeURIComponent(debounced)}&page=${page}`,
      ),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <p className="eyebrow">Todo lo que ya se terminó o se archivó</p>
        <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight">Archivo</h1>
        <p className="mt-1 text-ink-2">Nada se borra: aquí puedes consultar cualquier pendiente pasado y su bitácora completa.</p>
      </header>
      <div className="relative mt-5">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" />
        <input
          className="input min-h-12 pl-11 text-[16px]"
          placeholder="Buscar en el archivo por título, cliente o número…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <p className="mt-4 text-[14px] font-semibold text-ink-3">
        {isLoading ? 'Buscando…' : `${data?.total ?? 0} pendiente${data?.total === 1 ? '' : 's'}`}
      </p>
      <div className="mt-2 space-y-2">
        {data?.items.map((t) => (
          <div key={t.id}>
            <TicketRow ticket={t} onOpen={ui.openTicket} showAssignee />
            <p className="mt-0.5 pl-14 text-[12px] text-ink-3">
              {t.archived_at ? `Archivado ${formatDateTime(t.archived_at)}` : t.completed_at ? `Terminado ${formatDateTime(t.completed_at)}` : ''}
            </p>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anteriores
          </button>
          <span className="px-3 text-[14px] font-semibold text-ink-2">
            Página {page} de {pages}
          </span>
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Siguientes
          </button>
        </div>
      )}
    </div>
  );
}
