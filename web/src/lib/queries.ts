import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api.ts';
import { PRIORITY_RANK } from './status.ts';
import type {
  Activity,
  Category,
  ChecklistItem,
  Client,
  MyStep,
  Notification,
  Settings,
  Stats,
  Ticket,
  TicketDetail,
  User,
} from '../../../shared/types.ts';

export const qk = {
  me: ['me'] as const,
  users: ['users'] as const,
  categories: ['categories'] as const,
  tickets: ['tickets'] as const,
  ticket: (id: number) => ['ticket', id] as const,
  clients: ['clients'] as const,
  client: (id: number) => ['client', id] as const,
  clientTickets: (id: number) => ['client-tickets', id] as const,
  stats: ['stats'] as const,
  notifications: ['notifications'] as const,
  activity: ['activity'] as const,
  settings: ['settings'] as const,
  mySteps: ['my-steps'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<{ user: User | null }>('/auth/me').then((r) => r.user),
    staleTime: Infinity,
  });
}

/** El usuario actual; solo usar dentro de páginas protegidas. */
export function useCurrentUser() {
  return useMe().data!;
}

export function useUsers() {
  return useQuery({ queryKey: qk.users, queryFn: () => api.get<User[]>('/users') });
}

export function useUserMap() {
  const { data } = useUsers();
  return new Map((data ?? []).map((u) => [u.id, u]));
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: () => api.get<Category[]>('/categories') });
}

export function useCategoryMap() {
  const { data } = useCategories();
  return new Map((data ?? []).map((c) => [c.id, c]));
}

export function useTickets() {
  return useQuery({ queryKey: qk.tickets, queryFn: () => api.get<Ticket[]>('/tickets') });
}

export function useTicket(id: number | null) {
  return useQuery({
    queryKey: qk.ticket(id ?? 0),
    queryFn: () => api.get<TicketDetail>(`/tickets/${id}`),
    enabled: !!id,
  });
}

export function useMySteps() {
  return useQuery({ queryKey: qk.mySteps, queryFn: () => api.get<MyStep[]>('/tickets/my-steps') });
}

export function useClients() {
  return useQuery({ queryKey: qk.clients, queryFn: () => api.get<Client[]>('/clients') });
}

export function useClient(id: number) {
  return useQuery({ queryKey: qk.client(id), queryFn: () => api.get<Client>(`/clients/${id}`) });
}

export function useClientTickets(id: number) {
  return useQuery({ queryKey: qk.clientTickets(id), queryFn: () => api.get<Ticket[]>(`/tickets?client_id=${id}`) });
}

export function useStats() {
  return useQuery({ queryKey: qk.stats, queryFn: () => api.get<Stats>('/stats') });
}

export function useActivity() {
  return useQuery({ queryKey: qk.activity, queryFn: () => api.get<Activity[]>('/activity?limit=60') });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => api.get<Settings>('/settings') });
}

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.get<{ items: Notification[]; unread: number }>('/notifications'),
    refetchInterval: 120_000,
  });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
}

export type TicketPatch = Partial<
  Pick<
    Ticket,
    | 'title'
    | 'description'
    | 'status'
    | 'priority'
    | 'assignee_ids'
    | 'follower_ids'
    | 'category_id'
    | 'client_id'
    | 'due_date'
    | 'waiting_on'
    | 'follow_up_date'
    | 'recurrence'
  >
> & { archived?: boolean; new_client_name?: string };

/** Actualiza un pendiente. El cambio se ve al instante y se corrige si el servidor falla. */
export function useUpdateTicket() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    // Si la persona se quitó a sí misma y ya no puede verlo, el servidor responde { hidden: true }.
    mutationFn: ({ id, patch }: { id: number; patch: TicketPatch }) => api.patch<Ticket & { hidden?: boolean }>(`/tickets/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tickets });
      const prev = qc.getQueryData<Ticket[]>(qk.tickets);
      const { archived: _a, new_client_name: _n, ...fields } = patch;
      const now = new Date().toISOString();
      qc.setQueryData<Ticket[]>(qk.tickets, (old) =>
        old?.map((t) =>
          t.id === id
            ? {
                ...t,
                ...fields,
                last_activity_at: now,
                ...(patch.status && patch.status !== t.status
                  ? { status_changed_at: now, completed_at: patch.status === 'done' ? now : null }
                  : {}),
              }
            : t,
        ),
      );
      qc.setQueryData<TicketDetail>(qk.ticket(id), (old) => (old ? { ...old, ...fields } : old));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.tickets, ctx.prev);
      toast.error(err.message);
    },
    onSuccess: (data, { id }) => {
      if (data.hidden) {
        qc.setQueryData<Ticket[]>(qk.tickets, (old) => old?.filter((t) => t.id !== id));
        qc.removeQueries({ queryKey: qk.ticket(id) });
        toast('Ya no estás en ese pendiente', { description: 'Quedó con las demás personas o en la bandeja «Por asignar».' });
      }
    },
    onSettled: () => invalidate(),
  });
}

export type NewTicket = TicketPatch & {
  title: string;
  checklist?: string[];
  new_client_phone?: string | null;
};

export function useCreateTicket() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (data: NewTicket) => api.post<Ticket>('/tickets', data),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });
}

export function useTicketAction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ method, url, body }: { method: 'post' | 'patch' | 'del'; url: string; body?: unknown }) =>
      method === 'del' ? api.del(url) : method === 'post' ? api.post(url, body) : api.patch(url, body),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });
}

export function useToggleChecklist() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ item, done }: { item: Pick<ChecklistItem, 'id' | 'ticket_id'>; done: boolean }) =>
      api.patch<ChecklistItem>(`/checklist/${item.id}`, { done }),
    onMutate: ({ item, done }) => {
      qc.setQueryData<TicketDetail>(qk.ticket(item.ticket_id), (old) =>
        old ? { ...old, checklist: old.checklist.map((c) => (c.id === item.id ? { ...c, done: done ? 1 : 0 } : c)) } : old,
      );
      if (done) qc.setQueryData<MyStep[]>(qk.mySteps, (old) => old?.filter((s) => s.id !== item.id));
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => invalidate(),
  });
}

export function useInvalidate() {
  return useInvalidateAll();
}

/** Orden natural: urgentes primero, luego por fecha (vencidos arriba), luego los más viejos. */
export function sortTickets(list: Ticket[]) {
  return [...list].sort((a, b) => {
    if (a.status === 'done' && b.status === 'done') return (b.completed_at ?? '').localeCompare(a.completed_at ?? '');
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p) return p;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return a.created_at.localeCompare(b.created_at);
  });
}
