import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Search, UserRound } from 'lucide-react';
import type { Client, Ticket } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { Modal } from './Modal.tsx';
import { DueChip, StatusPill } from './TicketBits.tsx';

export function SearchDialog({ open, onClose, onOpenTicket }: { open: boolean; onClose: () => void; onOpenTicket: (id: number) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQ('');
      setDebounced('');
    }
  }, [open]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const { data } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<{ tickets: Ticket[]; clients: Client[] }>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length > 0,
    placeholderData: keepPreviousData,
  });

  const results = [
    ...(data?.clients ?? []).map((c) => ({ type: 'client' as const, id: c.id, item: c })),
    ...(data?.tickets ?? []).map((t) => ({ type: 'ticket' as const, id: t.id, item: t })),
  ];

  const choose = (r: (typeof results)[number]) => {
    onClose();
    if (r.type === 'client') navigate(`/clientes/${r.id}`);
    else onOpenTicket(r.id);
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-2xl">
      <div className="sticky top-0 -mx-6 border-b border-line bg-card px-6 pt-5 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" />
          <input
            autoFocus
            className="input min-h-13 pl-11 text-[17px]"
            placeholder="Buscar por título, cliente o número (#12)…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && results[active]) {
                choose(results[active]);
              }
            }}
          />
        </div>
      </div>
      <div className="min-h-40 py-3">
        {!debounced && (
          <p className="py-8 text-center text-ink-3">Escribe para buscar en todos los pendientes, incluso los ya terminados.</p>
        )}
        {debounced && data && results.length === 0 && (
          <p className="py-8 text-center text-ink-3">No encontré nada con «{debounced}».</p>
        )}
        <ul className="space-y-1">
          {results.map((r, i) => (
            <li key={`${r.type}-${r.id}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === active ? 'bg-paper-2' : ''}`}
              >
                {r.type === 'client' ? (
                  <>
                    <span className="flex size-8 items-center justify-center rounded-full bg-pine-soft text-pine">
                      <UserRound className="size-4" />
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold">{r.item.name}</span>
                      <span className="text-[13px] text-ink-3">Cliente{r.item.phone ? ` · ${r.item.phone}` : ''}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-10 text-[13px] font-bold text-ink-3 tabular-nums">#{r.item.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-semibold ${r.item.status === 'done' ? 'text-ink-3 line-through' : ''}`}>
                        {r.item.title}
                      </span>
                      {r.item.client_name && <span className="text-[13px] text-ink-3">{r.item.client_name}</span>}
                    </span>
                    {r.item.archived_at ? (
                      <span className="text-[12px] font-bold text-ink-3">Archivado</span>
                    ) : (
                      <StatusPill status={r.item.status} />
                    )}
                    <DueChip date={r.item.due_date} done={r.item.status === 'done'} />
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
