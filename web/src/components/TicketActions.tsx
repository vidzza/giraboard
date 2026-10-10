import { useState, useSyncExternalStore } from 'react';
import { addDays, nextMonday } from 'date-fns';
import { toast } from 'sonner';
import { ArrowRightLeft, Check, Clock, UserRoundPlus } from 'lucide-react';
import { STATUSES, STATUS_LABEL, type Status, type Ticket } from '../../../shared/types.ts';
import { useCurrentUser, useSettings, useUpdateTicket, useUsers, type TicketPatch } from '../lib/queries.ts';
import { toDateStr } from '../lib/dates.ts';
import { canAssignOthers } from '../lib/permissions.ts';
import { STATUS_STYLE } from '../lib/status.ts';
import { Avatar } from './Avatar.tsx';
import { Menu, MenuItem, MenuLabel } from './Menu.tsx';
import { Modal } from './Modal.tsx';
import { DueDatePicker } from './Pickers.tsx';

function short(t: string) {
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

// ---------- «¿Qué estamos esperando?» (se pregunta al mover algo a Esperando desde cualquier lugar) ----------

let waitingTicket: Ticket | null = null;
const listeners = new Set<() => void>();
const waitingStore = {
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get: () => waitingTicket,
  set: (t: Ticket | null) => {
    waitingTicket = t;
    listeners.forEach((fn) => fn());
  },
};

export function askWhatWeAreWaitingFor(t: Ticket) {
  waitingStore.set(t);
}

/** Se monta una vez (en el marco de la app). */
export function WaitingPrompt() {
  const ticket = useSyncExternalStore(waitingStore.subscribe, waitingStore.get);
  const update = useUpdateTicket();
  const [waitingOn, setWaitingOn] = useState('');
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  if (ticket && ticket.id !== lastId) {
    setLastId(ticket.id);
    setWaitingOn(ticket.waiting_on ?? '');
    setFollowUp(ticket.follow_up_date ?? toDateStr(addDays(new Date(), 2)));
  }
  const close = () => {
    waitingStore.set(null);
    setLastId(null);
  };
  const submit = () => {
    if (ticket) update.mutate({ id: ticket.id, patch: { waiting_on: waitingOn.trim() || null, follow_up_date: followUp } });
    close();
  };
  return (
    <Modal
      open={!!ticket}
      onClose={close}
      title="¿Qué estamos esperando?"
      subtitle={ticket ? `#${ticket.id} · ${ticket.title}` : undefined}
      footer={
        <>
          <button className="btn-ghost" onClick={close}>
            Ahora no
          </button>
          <button className="btn-primary" onClick={submit}>
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="waiting-on">
            ¿A quién o qué esperamos?
          </label>
          <input
            id="waiting-on"
            autoFocus
            className="input"
            value={waitingOn}
            maxLength={200}
            onChange={(e) => setWaitingOn(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ej. Respuesta de la aseguradora, que el cliente pague…"
          />
        </div>
        <div>
          <span className="label">¿Cuándo volvemos a revisar?</span>
          <DueDatePicker value={followUp} onChange={setFollowUp} noneLabel="Sin recordatorio" />
          <p className="mt-2 text-[13px] text-ink-2">Ese día aparecerá en «Mi día» para dar seguimiento y no se quede olvidado.</p>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Cambiar estado ----------

/** Cambia el estado con «Deshacer». Al terminar avisa si se crea el siguiente; al pasar a Esperando pregunta qué se espera. */
export function useSetStatus() {
  const update = useUpdateTicket();
  return (t: Ticket, status: Status) => {
    if (status === t.status) return;
    const prev = t.status;
    update.mutate({ id: t.id, patch: { status } });
    const undo = { label: 'Deshacer', onClick: () => update.mutate({ id: t.id, patch: { status: prev } }) };
    if (status === 'done') {
      toast.success(`¡Listo! «${short(t.title)}»`, {
        description: t.recurrence !== 'none' ? 'Como se repite, ya quedó creado el siguiente.' : undefined,
        duration: 8000,
        action: undo,
      });
    } else if (status === 'waiting') {
      askWhatWeAreWaitingFor({ ...t, status });
    } else {
      toast(`#${t.id} pasó a «${STATUS_LABEL[status]}»`, { action: undo });
    }
  };
}

/** Marcar como listo con opción de deshacer. */
export function useCompleteTicket() {
  const setStatus = useSetStatus();
  return (t: Ticket) => setStatus(t, 'done');
}

export function usePostpone() {
  const update = useUpdateTicket();
  return (t: Ticket, date: string, label: string) => {
    const useFollowUp = t.status === 'waiting' && !!t.follow_up_date;
    const patch: TicketPatch = useFollowUp ? { follow_up_date: date } : { due_date: date };
    const before: TicketPatch = useFollowUp ? { follow_up_date: t.follow_up_date } : { due_date: t.due_date };
    update.mutate({ id: t.id, patch });
    toast(`Movido para ${label.toLowerCase()}`, {
      duration: 6000,
      action: { label: 'Deshacer', onClick: () => update.mutate({ id: t.id, patch: before }) },
    });
  };
}

/** Botón «Mover»: cambiar de estado sin arrastrar (para celular, teclado y lectores de pantalla). */
export function StatusMenuButton({ ticket, compact = false, labelClass = '' }: { ticket: Ticket; compact?: boolean; labelClass?: string }) {
  const setStatus = useSetStatus();
  return (
    <Menu
      title={`Mover #${ticket.id} a…`}
      width="w-56"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`Mover #${ticket.id} a otro estado`}
          title="Mover a otro estado"
          className={`btn-ghost btn-sm text-ink-2 ${compact ? 'px-2' : ''}`}
        >
          <ArrowRightLeft className="size-4" />
          {!compact && <span className={labelClass}>Mover</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Mover a…</MenuLabel>
          {STATUSES.map((s) => {
            const st = STATUS_STYLE[s];
            const Icon = st.icon;
            return (
              <MenuItem
                key={s}
                active={ticket.status === s}
                icon={<Icon className={st.text} />}
                onClick={() => {
                  close();
                  setStatus(ticket, s);
                }}
              >
                {STATUS_LABEL[s]}
                {ticket.status === s && <Check className="ml-auto size-4" />}
              </MenuItem>
            );
          })}
        </>
      )}
    </Menu>
  );
}

export function PostponeMenuButton({ ticket, label = true, labelClass = '' }: { ticket: Ticket; label?: boolean; labelClass?: string }) {
  const postpone = usePostpone();
  const now = new Date();
  const followUp = ticket.status === 'waiting' && !!ticket.follow_up_date;
  return (
    <Menu
      title={followUp ? 'Revisar de nuevo…' : 'Mover la fecha a…'}
      width="w-56"
      trigger={({ toggle, open }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className="btn-ghost btn-sm text-ink-2" title="Posponer" aria-label={`Posponer #${ticket.id}`}>
          <Clock className="size-4" />
          {label && <span className={labelClass}>Posponer</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{followUp ? 'Revisar de nuevo…' : 'Mover fecha a…'}</MenuLabel>
          {[
            { label: 'Mañana', date: toDateStr(addDays(now, 1)) },
            { label: 'Pasado mañana', date: toDateStr(addDays(now, 2)) },
            { label: 'El próximo lunes', date: toDateStr(nextMonday(now)) },
            { label: 'En una semana', date: toDateStr(addDays(now, 7)) },
          ].map((o) => (
            <MenuItem
              key={o.label}
              onClick={() => {
                close();
                postpone(ticket, o.date, o.label);
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

/** Asignar rápido (desde la bandeja «Por asignar» o una tarjeta). Agrega a la persona elegida. */
export function AssignMenuButton({ ticket, label = 'Asignar' }: { ticket: Ticket; label?: string }) {
  const me = useCurrentUser();
  const { data: settings } = useSettings();
  const { data: users = [] } = useUsers();
  const update = useUpdateTicket();
  const others = canAssignOthers(me, settings);
  const people = users.filter((u) => u.active && (others || u.id === me.id) && !ticket.assignee_ids.includes(u.id));
  const assign = (id: number) => {
    const prev = ticket.assignee_ids;
    update.mutate({ id: ticket.id, patch: { assignee_ids: [...prev, id] } });
    const name = id === me.id ? 'ti' : (users.find((u) => u.id === id)?.name ?? 'alguien');
    toast.success(`#${ticket.id} asignado a ${name}`, {
      action: { label: 'Deshacer', onClick: () => update.mutate({ id: ticket.id, patch: { assignee_ids: prev } }) },
    });
  };
  if (people.length === 0) return null;
  return (
    <Menu
      title={`¿Quién se encarga de #${ticket.id}?`}
      width="w-64"
      trigger={({ toggle, open }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className="btn-secondary btn-sm">
          <UserRoundPlus className="size-4" /> {label}
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>¿Quién se encarga?</MenuLabel>
          {people.map((u) => (
            <MenuItem
              key={u.id}
              icon={<Avatar user={u} size="xs" />}
              onClick={() => {
                close();
                assign(u.id);
              }}
            >
              {u.id === me.id ? `Yo (${u.name})` : u.name}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}
