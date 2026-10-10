import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Mail, MessageCircle, Phone, Plus, Search, Trash2, UserRound } from 'lucide-react';
import type { Client } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { sortTickets, useClient, useClientTickets, useClients, useCurrentUser, useInvalidate } from '../lib/queries.ts';
import { timeAgo } from '../lib/dates.ts';
import { whatsappLink } from '../lib/activity.ts';
import { useUI } from '../lib/ui.tsx';
import { Modal } from '../components/Modal.tsx';
import { TicketRow } from '../components/TicketRow.tsx';
import { EditableText } from '../components/Editable.tsx';

export function ClientsPage() {
  const { data: clients = [], isLoading } = useClients();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const query = q.trim().toLowerCase();
  const list = clients.filter(
    (c) => !query || c.name.toLowerCase().includes(query) || (c.phone ?? '').includes(query) || (c.email ?? '').toLowerCase().includes(query),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="eyebrow">Todo lo que se ha hecho por cada cliente</p>
          <h1 className="font-display text-[32px] leading-tight font-semibold tracking-tight">Clientes</h1>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Nuevo cliente
        </button>
      </header>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" />
        <input className="input min-h-12 pl-11 text-[16px]" placeholder="Buscar por nombre, teléfono o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="panel mt-4 overflow-hidden">
        {isLoading && <p className="p-6 text-ink-3">Cargando…</p>}
        {!isLoading && list.length === 0 && (
          <div className="p-10 text-center">
            <p className="font-semibold">{clients.length ? 'No encontré clientes con esa búsqueda.' : 'Aún no hay clientes.'}</p>
            <p className="mt-1 text-[14px] text-ink-3">
              También se crean solos cuando escribes un cliente nuevo al capturar un pendiente.
            </p>
          </div>
        )}
        <ul className="divide-y divide-line">
          {list.map((c, i) => (
            <li key={c.id}>
              <Link
                to={`/clientes/${c.id}`}
                style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
                className="flex animate-rise items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-2/50 sm:px-5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pine-soft font-display text-[17px] font-semibold text-pine">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-[13px] text-ink-3">
                    {[c.phone, c.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                  </span>
                </span>
                <span className="hidden text-right text-[13px] sm:block">
                  {c.open_count ? (
                    <span className="font-bold text-pine">{c.open_count} abiertos</span>
                  ) : (
                    <span className="text-ink-3">Sin pendientes abiertos</span>
                  )}
                  <span className="block text-ink-3">
                    {c.last_activity_at ? `Último movimiento ${timeAgo(c.last_activity_at)}` : `${c.total_count ?? 0} en total`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <ClientFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/clientes/${c.id}`)} />
    </div>
  );
}

function ClientFormModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (c: Client) => void }) {
  const invalidate = useInvalidate();
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Escribe el nombre del cliente');
      return;
    }
    setSaving(true);
    try {
      const c = await api.post<Client>('/clients', form);
      invalidate();
      setForm({ name: '', phone: '', email: '', notes: '' });
      onClose();
      onSaved(c);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo cliente"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            Guardar cliente
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="c-name">
            Nombre
          </label>
          <input id="c-name" autoFocus className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-phone">
              Teléfono / WhatsApp
            </label>
            <input id="c-phone" type="tel" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="c-email">
              Correo
            </label>
            <input id="c-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-notes">
            Notas
          </label>
          <textarea
            id="c-notes"
            rows={3}
            className="input"
            placeholder="Pólizas que tiene, cómo prefiere que lo contacten…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}

export function ClientDetailPage() {
  const id = Number(useParams().id);
  const me = useCurrentUser();
  const ui = useUI();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: client, error } = useClient(id);
  const { data: tickets = [] } = useClientTickets(id);

  const saveField = async (field: keyof Client, value: string) => {
    try {
      await api.patch(`/clients/${id}`, { [field]: value });
      invalidate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async () => {
    if (!window.confirm('¿Eliminar este cliente? Sus pendientes se conservan, solo pierden el vínculo.')) return;
    await api.del(`/clients/${id}`);
    invalidate();
    navigate('/clientes');
  };

  if (error) return <p className="text-ink-2">{error.message}</p>;
  if (!client) return <p className="text-ink-3">Cargando…</p>;

  const open = sortTickets(tickets.filter((t) => t.status !== 'done' && !t.archived_at));
  const closed = tickets.filter((t) => t.status === 'done' || t.archived_at);

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/clientes" className="btn-ghost btn-sm -ml-2">
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <div className="mt-3 grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className="panel h-fit space-y-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-pine-soft font-display text-2xl font-semibold text-pine">
              {client.name.charAt(0).toUpperCase()}
            </span>
            <EditableText
              value={client.name}
              allowEmpty={false}
              onSave={(v) => saveField('name', v)}
              className="w-full rounded-lg px-1 font-display text-[22px] leading-tight font-semibold hover:bg-paper-2 focus:bg-card focus:outline-none focus:ring-3 focus:ring-pine/15"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {client.phone && (
              <>
                <a className="btn-secondary btn-sm text-moss" href={whatsappLink(client.phone)} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
                <a className="btn-secondary btn-sm" href={`tel:${client.phone}`}>
                  <Phone className="size-4" /> Llamar
                </a>
              </>
            )}
            {client.email && (
              <a className="btn-secondary btn-sm" href={`mailto:${client.email}`}>
                <Mail className="size-4" /> Correo
              </a>
            )}
          </div>
          <ContactField label="Teléfono / WhatsApp" value={client.phone ?? ''} onSave={(v) => saveField('phone', v)} />
          <ContactField label="Correo" value={client.email ?? ''} onSave={(v) => saveField('email', v)} />
          <div>
            <span className="label">Notas</span>
            <EditableText
              multiline
              minRows={3}
              value={client.notes ?? ''}
              onSave={(v) => saveField('notes', v)}
              placeholder="Pólizas, preferencias, datos importantes…"
              className="input py-2.5 leading-relaxed"
            />
          </div>
          {me.role === 'admin' && (
            <button className="btn-danger btn-sm" onClick={remove}>
              <Trash2 className="size-4" /> Eliminar cliente
            </button>
          )}
        </aside>

        <section>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-[24px] font-semibold">Pendientes abiertos</h2>
            <span className="rounded-full bg-pine-soft px-2 py-0.5 text-[13px] font-bold text-pine">{open.length}</span>
            <button
              className="btn-primary btn-sm ml-auto"
              onClick={() => ui.openNewTicket({ client_id: client.id, client_name: client.name })}
            >
              <Plus className="size-4" /> Pendiente para este cliente
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {open.length === 0 && (
              <p className="panel px-4 py-8 text-center text-ink-3">
                <UserRound className="mx-auto mb-2 size-6" />
                No hay nada pendiente con este cliente.
              </p>
            )}
            {open.map((t) => (
              <TicketRow key={t.id} ticket={t} onOpen={ui.openTicket} showAssignee />
            ))}
          </div>
          {closed.length > 0 && (
            <>
              <h2 className="mt-8 font-display text-[20px] font-semibold text-ink-2">Historial ({closed.length})</h2>
              <div className="mt-3 space-y-2">
                {closed.map((t) => (
                  <TicketRow key={t.id} ticket={t} onOpen={ui.openTicket} showAssignee />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ContactField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <EditableText value={value} onSave={onSave} placeholder="—" className="input py-2.5" />
    </div>
  );
}
