import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  Archive,
  ArchiveRestore,
  Check,
  Download,
  FileText,
  Hourglass,
  Link2,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Trash2,
  Upload,
  X,
  History,
  ExternalLink,
} from 'lucide-react';
import { RECURRENCES, RECURRENCE_LABEL, type Status, type TicketDetail } from '../../../shared/types.ts';
import {
  useCategoryMap,
  useCurrentUser,
  useInvalidate,
  useTicket,
  useTicketAction,
  useToggleChecklist,
  useUpdateTicket,
  useUserMap,
  useUsers,
  type TicketPatch,
} from '../lib/queries.ts';
import { api } from '../lib/api.ts';
import { formatDateTime, timeAgo } from '../lib/dates.ts';
import { describeActivity, whatsappLink } from '../lib/activity.ts';
import { Avatar } from './Avatar.tsx';
import { AutoTextarea, EditableText } from './Editable.tsx';
import { useEscape } from './Modal.tsx';
import { Menu, MenuItem } from './Menu.tsx';
import { CategoryPicker, ClientPicker, DueDatePicker, PersonPicker, PriorityPicker, StatusPicker } from './Pickers.tsx';
import { ProgressBar } from './TicketBits.tsx';

// Notas a medio escribir, por pendiente (se conservan si cierras y vuelves a abrir).
const commentDrafts = new Map<number, string>();

export function TicketDrawer({ id, onClose: closeDrawer }: { id: number; onClose: () => void }) {
  const { data: ticket, error, isLoading } = useTicket(id);
  const qc = useQueryClient();
  // Antes de cerrar, sacar el foco del campo activo para que se guarde lo que se estaba escribiendo.
  const onClose = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    closeDrawer();
  };
  useEscape(onClose);

  // Al abrir el pendiente, sus avisos se dan por leídos.
  useEffect(() => {
    api
      .post('/notifications/read', { ticket_id: id })
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
      .catch(() => {});
  }, [id, qc]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade bg-ink/25" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del pendiente"
        className="relative flex h-full w-full max-w-[640px] animate-slide-in flex-col bg-paper shadow-panel sm:border-l sm:border-line"
      >
        {isLoading && <DrawerSkeleton onClose={onClose} />}
        {error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-lg font-semibold">{error.message}</p>
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        )}
        {ticket && <DrawerBody ticket={ticket} onClose={onClose} />}
      </aside>
    </div>,
    document.body,
  );
}

function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex justify-end">
        <button onClick={onClose} className="btn-ghost size-10 px-0" aria-label="Cerrar">
          <X className="size-5" />
        </button>
      </div>
      <div className="h-8 w-3/4 animate-pulse rounded-lg bg-paper-3" />
      <div className="h-12 animate-pulse rounded-xl bg-paper-3" />
      <div className="h-40 animate-pulse rounded-xl bg-paper-3" />
    </div>
  );
}

function Section({ title, icon, children, aside }: { title: string; icon: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-ink-3 [&>svg]:size-[18px]">{icon}</span>
        <h3 className="font-display text-[17px] font-semibold">{title}</h3>
        <div className="ml-auto">{aside}</div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function DrawerBody({ ticket, onClose }: { ticket: TicketDetail; onClose: () => void }) {
  const me = useCurrentUser();
  const users = useUserMap();
  const update = useUpdateTicket();
  const action = useTicketAction();
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const waitingRef = useRef<HTMLInputElement>(null);

  const save = (patch: TicketPatch) => {
    setSaved('saving');
    update.mutate(
      { id: ticket.id, patch },
      {
        onSuccess: () => setSaved('saved'),
        onError: () => setSaved('idle'),
      },
    );
  };

  const setStatus = (s: Status) => {
    if (s === ticket.status) return;
    const prev = ticket.status;
    save({ status: s });
    if (s === 'done') {
      toast.success('¡Pendiente terminado!', {
        description: ticket.recurrence !== 'none' ? 'Como se repite, ya quedó creado el siguiente.' : undefined,
        action: { label: 'Deshacer', onClick: () => save({ status: prev }) },
      });
    }
    if (s === 'waiting') setTimeout(() => waitingRef.current?.focus(), 80);
  };

  const archive = (archived: boolean) => {
    save({ archived });
    if (archived) {
      toast('Pendiente archivado', { action: { label: 'Deshacer', onClick: () => save({ archived: false }) } });
      onClose();
    }
  };

  const remove = () => {
    if (!window.confirm(`¿Eliminar para siempre el pendiente #${ticket.id}? Esto no se puede deshacer.`)) return;
    action.mutate({ method: 'del', url: `/tickets/${ticket.id}` }, { onSuccess: () => onClose() });
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/?p=${ticket.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado. Pégalo en WhatsApp o correo.');
    } catch {
      toast(url);
    }
  };

  const creator = users.get(ticket.creator_id);

  return (
    <>
      <header className="flex items-center gap-2 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur sm:px-6">
        <span className="rounded-lg bg-paper-2 px-2 py-1 text-sm font-bold text-ink-2 tabular-nums">#{ticket.id}</span>
        <span className="text-[13px] font-medium text-ink-3" aria-live="polite">
          {saved === 'saving' ? 'Guardando…' : saved === 'saved' ? (
            <span className="inline-flex items-center gap-1 text-moss">
              <Check className="size-4" /> Guardado
            </span>
          ) : ticket.archived_at ? (
            'Archivado'
          ) : null}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={copyLink} className="btn-ghost btn-sm" title="Copiar enlace">
            <Link2 className="size-4" />
            <span className="hidden sm:inline">Copiar enlace</span>
          </button>
          <Menu
            trigger={({ toggle }) => (
              <button onClick={toggle} className="btn-ghost size-10 px-0" aria-label="Más opciones">
                <MoreHorizontal className="size-5" />
              </button>
            )}
          >
            {(close) => (
              <>
                {ticket.archived_at ? (
                  <MenuItem icon={<ArchiveRestore />} onClick={() => (close(), archive(false))}>
                    Sacar del archivo
                  </MenuItem>
                ) : (
                  <MenuItem icon={<Archive />} onClick={() => (close(), archive(true))}>
                    Archivar (ya no aplica)
                  </MenuItem>
                )}
                {me.role === 'admin' && (
                  <MenuItem danger icon={<Trash2 />} onClick={() => (close(), remove())}>
                    Eliminar para siempre
                  </MenuItem>
                )}
              </>
            )}
          </Menu>
          <button onClick={onClose} className="btn-ghost size-10 px-0" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
      </header>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 pt-5 pb-10 sm:px-6">
        <EditableText
          value={ticket.title}
          allowEmpty={false}
          maxLength={200}
          onSave={(title) => save({ title })}
          className="-mx-2 w-[calc(100%+1rem)] rounded-xl px-2 py-1 font-display text-[26px] leading-tight font-semibold text-ink hover:bg-paper-2 focus:bg-card focus:outline-none focus:ring-3 focus:ring-pine/15"
        />
        <p className="-mt-2 text-[13px] text-ink-3">
          Creado por {creator?.name ?? 'alguien'} · {formatDateTime(ticket.created_at)}
          {ticket.completed_at && ticket.status === 'done' && <> · Terminado {formatDateTime(ticket.completed_at)}</>}
        </p>

        <StatusPicker value={ticket.status} onChange={setStatus} />

        {ticket.status === 'waiting' && (
          <div className="animate-rise space-y-3 rounded-2xl border border-amber/30 bg-amber-soft/60 p-4">
            <div className="flex items-center gap-2 font-semibold text-amber">
              <Hourglass className="size-4" /> ¿Qué estamos esperando?
            </div>
            <WaitingOnInput
              inputRef={waitingRef}
              value={ticket.waiting_on ?? ''}
              onSave={(waiting_on) => save({ waiting_on: waiting_on || null })}
            />
            <div>
              <span className="label text-amber/80">Volver a revisar el…</span>
              <DueDatePicker
                value={ticket.follow_up_date}
                onChange={(follow_up_date) => save({ follow_up_date })}
                noneLabel="Sin recordatorio"
              />
              <p className="mt-2 text-[13px] text-ink-2">Ese día te aparecerá en «Mi día» para dar seguimiento.</p>
            </div>
          </div>
        )}

        <section className="panel space-y-5 p-4 sm:p-5">
          <Field label="¿Quién lo tiene?">
            <PersonPicker value={ticket.assignee_id} onChange={(assignee_id) => save({ assignee_id })} />
          </Field>
          <Field label="¿Para cuándo?">
            <DueDatePicker value={ticket.due_date} onChange={(due_date) => save({ due_date })} />
          </Field>
          <Field label="Cliente">
            <ClientPicker
              value={{ id: ticket.client_id, name: ticket.client_name }}
              onChange={(v) => (v.isNew ? save({ new_client_name: v.name! }) : save({ client_id: v.id }))}
            />
            {ticket.client_id && (
              <div className="mt-2 flex flex-wrap gap-2">
                {ticket.client_phone && (
                  <>
                    <a
                      href={whatsappLink(ticket.client_phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary btn-sm text-moss"
                    >
                      <MessageCircle className="size-4" /> WhatsApp
                    </a>
                    <a href={`tel:${ticket.client_phone}`} className="btn-secondary btn-sm">
                      <Phone className="size-4" /> {ticket.client_phone}
                    </a>
                  </>
                )}
                <Link to={`/clientes/${ticket.client_id}`} onClick={onClose} className="btn-ghost btn-sm">
                  <ExternalLink className="size-4" /> Ver todo del cliente
                </Link>
              </div>
            )}
          </Field>
          <Field label="Tipo de pendiente">
            <CategoryPicker value={ticket.category_id} onChange={(category_id) => save({ category_id })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <Field label="Prioridad">
              <PriorityPicker value={ticket.priority} onChange={(priority) => save({ priority })} />
            </Field>
            <Field label="¿Se repite?">
              <select
                className="input min-w-44"
                value={ticket.recurrence}
                onChange={(e) => save({ recurrence: e.target.value as TicketDetail['recurrence'] })}
              >
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notas y detalles">
            <EditableText
              multiline
              minRows={3}
              maxLength={10000}
              value={ticket.description}
              onSave={(description) => save({ description })}
              placeholder="Número de póliza, datos importantes, qué falta…"
              className="input min-h-24 py-2.5 leading-relaxed"
            />
          </Field>
        </section>

        <Checklist ticket={ticket} />
        <Attachments ticket={ticket} />
        <Timeline ticket={ticket} />
      </div>
    </>
  );
}

function WaitingOnInput({
  value,
  onSave,
  inputRef,
}: {
  value: string;
  onSave: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value);
  }, [value, inputRef]);
  return (
    <input
      ref={inputRef}
      className="input"
      value={draft}
      placeholder="Ej. Que el cliente mande su INE, respuesta de la aseguradora…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Checklist({ ticket }: { ticket: TicketDetail }) {
  const toggle = useToggleChecklist();
  const action = useTicketAction();
  const [text, setText] = useState('');
  const done = ticket.checklist.filter((c) => c.done).length;

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    action.mutate({ method: 'post', url: `/tickets/${ticket.id}/checklist`, body: { text: t } });
  };

  return (
    <Section
      title="Pasos"
      icon={<ListChecks />}
      aside={ticket.checklist.length > 0 && <span className="text-sm font-bold text-ink-2">{Math.round((done / ticket.checklist.length) * 100)}%</span>}
    >
      {ticket.checklist.length > 0 && <ProgressBar done={done} total={ticket.checklist.length} className="mb-3" />}
      <ul className="space-y-1">
        {ticket.checklist.map((item) => (
          <li key={item.id} className="group flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-paper-2/60">
            <button
              type="button"
              onClick={() => toggle.mutate({ item, done: !item.done })}
              aria-label={item.done ? 'Desmarcar' : 'Marcar como hecho'}
              className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                item.done ? 'border-moss bg-moss text-white' : 'border-ink-3/50 hover:border-moss'
              }`}
            >
              {item.done ? <Check className="size-4" strokeWidth={3} /> : null}
            </button>
            <span className={`flex-1 text-[15px] ${item.done ? 'text-ink-3 line-through' : 'text-ink'}`}>{item.text}</span>
            <button
              type="button"
              onClick={() => action.mutate({ method: 'del', url: `/checklist/${item.id}` })}
              className="btn-ghost btn-sm text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Quitar paso"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          className="input"
          value={text}
          placeholder={ticket.checklist.length ? 'Agregar otro paso…' : 'Divide el pendiente en pasos para ver el avance'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn-secondary shrink-0" onClick={add} disabled={!text.trim()}>
          <Plus className="size-4" /> Agregar
        </button>
      </div>
    </Section>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Attachments({ ticket }: { ticket: TicketDetail }) {
  const me = useCurrentUser();
  const users = useUserMap();
  const invalidate = useInvalidate();
  const action = useTicketAction();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await api.upload(`/tickets/${ticket.id}/attachments`, form);
      }
      toast.success(files.length > 1 ? 'Archivos subidos' : 'Archivo subido');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      invalidate();
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Section
      title="Archivos"
      icon={<Paperclip />}
      aside={
        <button className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="size-4" /> {uploading ? 'Subiendo…' : 'Subir archivo'}
        </button>
      }
    >
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        className={`rounded-xl transition-colors ${dragOver ? 'bg-pine-soft ring-2 ring-pine/40' : ''}`}
      >
        {ticket.attachments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-2 px-4 py-5 text-center text-[14px] text-ink-3">
            Arrastra aquí pólizas, INE, comprobantes o fotos (PDF o imagen, hasta 25 MB).
          </p>
        ) : (
          <ul className="space-y-1.5">
            {ticket.attachments.map((a) => (
              <li key={a.id} className="group flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                <FileText className="size-5 shrink-0 text-ink-3" />
                <a
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 hover:underline"
                >
                  <span className="block truncate text-[15px] font-semibold">{a.filename}</span>
                  <span className="text-[12px] text-ink-3">
                    {formatSize(a.size)} · {users.get(a.user_id)?.name} · {timeAgo(a.created_at)}
                  </span>
                </a>
                <a href={`/api/attachments/${a.id}?download`} className="btn-ghost btn-sm" aria-label="Descargar">
                  <Download className="size-4" />
                </a>
                {(a.user_id === me.id || me.role === 'admin') && (
                  <button
                    className="btn-ghost btn-sm text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label="Borrar archivo"
                    onClick={() =>
                      window.confirm(`¿Borrar «${a.filename}»?`) && action.mutate({ method: 'del', url: `/attachments/${a.id}` })
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function Timeline({ ticket }: { ticket: TicketDetail }) {
  const me = useCurrentUser();
  const users = useUserMap();
  const categories = useCategoryMap();
  const action = useTicketAction();
  const { data: allUsers = [] } = useUsers();
  const [body, setBodyState] = useState(() => commentDrafts.get(ticket.id) ?? '');
  const [showAll, setShowAll] = useState(false);
  const setBody = (v: string) => {
    setBodyState(v);
    if (v) commentDrafts.set(ticket.id, v);
    else commentDrafts.delete(ticket.id);
  };
  const others = allUsers.filter((u) => u.active && u.id !== me.id);

  const send = () => {
    const text = body.trim();
    if (!text) return;
    action.mutate({ method: 'post', url: `/tickets/${ticket.id}/comments`, body: { body: text } }, { onSuccess: () => setBody('') });
  };

  const mention = (username: string) => {
    const tag = `@${username}`;
    if (body.includes(tag)) return;
    setBody(`${body}${body && !body.endsWith(' ') ? ' ' : ''}${tag} `);
  };

  type Entry = { kind: 'comment' | 'activity'; at: string; key: string; node: ReactNode };
  const entries: Entry[] = [
    ...ticket.comments.map((c) => ({
      kind: 'comment' as const,
      at: c.created_at,
      key: `c${c.id}`,
      node: (
        <div className="flex gap-3">
          <Avatar user={users.get(c.user_id)} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-bold">{users.get(c.user_id)?.name ?? 'Alguien'}</span>
              <span className="text-[12px] text-ink-3" title={formatDateTime(c.created_at)}>
                {timeAgo(c.created_at)}
              </span>
              {(c.user_id === me.id || me.role === 'admin') && (
                <button
                  className="ml-auto text-[12px] font-semibold text-ink-3 hover:text-clay"
                  onClick={() => window.confirm('¿Borrar esta nota?') && action.mutate({ method: 'del', url: `/comments/${c.id}` })}
                >
                  Borrar
                </button>
              )}
            </div>
            <p className="mt-1 rounded-2xl rounded-tl-md border border-line bg-paper/70 px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
              {c.body}
            </p>
          </div>
        </div>
      ),
    })),
    ...ticket.activity
      .filter((a) => a.type !== 'comment')
      .map((a) => ({
        kind: 'activity' as const,
        at: a.created_at,
        key: `a${a.id}`,
        node: (
          <div className="flex items-center gap-3 pl-1.5 text-[14px] text-ink-2">
            <span className="flex w-6 justify-center">
              <span className="size-2 rounded-full bg-line-2" />
            </span>
            <span>
              <b className="font-semibold text-ink">{a.user_id ? (users.get(a.user_id)?.name ?? 'Alguien') : 'Sistema'}</b>{' '}
              {describeActivity(a, users, categories)}
              <span className="ml-1.5 text-[12px] text-ink-3" title={formatDateTime(a.created_at)}>
                · {timeAgo(a.created_at)}
              </span>
            </span>
          </div>
        ),
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const visible = showAll ? entries : entries.slice(0, 8);

  return (
    <Section title="Bitácora" icon={<History />}>
      <div className="mb-4 flex gap-3">
        <Avatar user={me} size="md" />
        <div className="flex-1">
          <AutoTextarea
            minRows={2}
            maxLength={5000}
            className="input py-2.5 leading-relaxed"
            placeholder="Escribe un avance o nota… (ej. «Le llamé, queda de mandar los papeles el lunes»)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {others.length > 0 && <span className="mr-0.5 text-[12px] font-semibold text-ink-3">Avisarle a:</span>}
            {others.map((u) => {
              const on = body.includes(`@${u.username}`);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => mention(u.username)}
                  className={`inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-[12px] font-semibold transition-colors ${
                    on ? 'border-pine bg-pine-soft text-pine' : 'border-line-2 text-ink-2 hover:bg-paper-2'
                  }`}
                  title={`Le llegará un aviso a ${u.name}`}
                >
                  <Avatar user={u} size="xs" /> {u.name.split(' ')[0]}
                </button>
              );
            })}
            <button className="btn-primary btn-sm ml-auto" onClick={send} disabled={!body.trim() || action.isPending}>
              Agregar nota
            </button>
          </div>
        </div>
      </div>
      <ol className="space-y-3.5">
        {visible.map((e) => (
          <li key={e.key}>{e.node}</li>
        ))}
      </ol>
      {entries.length > visible.length && (
        <button className="btn-ghost btn-sm mt-3" onClick={() => setShowAll(true)}>
          Ver todo el historial ({entries.length - visible.length} más)
        </button>
      )}
    </Section>
  );
}
