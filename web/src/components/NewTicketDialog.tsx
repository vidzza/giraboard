import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Flame, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { RECURRENCES, RECURRENCE_LABEL, type Recurrence, type Status } from '../../../shared/types.ts';
import { useCreateTicket, useCurrentUser, type NewTicket } from '../lib/queries.ts';
import { Modal } from './Modal.tsx';
import { CategoryPicker, ClientPicker, DueDatePicker, PersonPicker, type ClientValue } from './Pickers.tsx';
import { AutoTextarea } from './Editable.tsx';

export type NewTicketPrefill = Partial<NewTicket> & { client_name?: string };

export function NewTicketDialog({
  open,
  prefill,
  onClose,
  onCreated,
}: {
  open: boolean;
  prefill: NewTicketPrefill;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const me = useCurrentUser();
  const create = useCreateTicket();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<number | null>(me.id);
  const [due, setDue] = useState<string | null>(null);
  const [category, setCategory] = useState<number | null>(null);
  const [client, setClient] = useState<ClientValue>({ id: null, name: null });
  const [urgent, setUrgent] = useState(false);
  const [more, setMore] = useState(false);
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [step, setStep] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [status, setStatus] = useState<Status>('todo');

  useEffect(() => {
    if (!open) return;
    setTitle(prefill.title ?? '');
    setAssignee(prefill.assignee_id !== undefined ? prefill.assignee_id : me.id);
    setDue(prefill.due_date ?? null);
    setCategory(prefill.category_id ?? null);
    setClient(prefill.client_id ? { id: prefill.client_id, name: prefill.client_name ?? 'Cliente' } : { id: null, name: null });
    setUrgent(prefill.priority === 'urgent');
    setMore(false);
    setDescription('');
    setSteps([]);
    setStep('');
    setRecurrence('none');
    setStatus(prefill.status ?? 'todo');
  }, [open, prefill, me.id]);

  const submit = (another: boolean) => {
    if (!title.trim()) {
      toast.error('Escribe qué hay que hacer');
      return;
    }
    const pendingStep = step.trim();
    const data: NewTicket = {
      title: title.trim(),
      assignee_id: assignee,
      due_date: due,
      category_id: category,
      priority: urgent ? 'urgent' : 'normal',
      description,
      checklist: pendingStep ? [...steps, pendingStep] : steps,
      recurrence,
      status,
      ...(client.isNew ? { new_client_name: client.name! } : { client_id: client.id }),
    };
    create.mutate(data, {
      onSuccess: (t) => {
        toast.success(`Pendiente #${t.id} creado`, {
          action: { label: 'Abrir', onClick: () => onCreated(t.id) },
        });
        if (another) {
          setTitle('');
          setDescription('');
          setSteps([]);
          setStep('');
          document.getElementById('new-ticket-title')?.focus();
        } else {
          onClose();
        }
      },
    });
  };

  // Si ya se escribió algo, confirmar antes de cerrar para no perderlo.
  const requestClose = () => {
    const dirty = title.trim() || description.trim() || steps.length > 0;
    if (dirty && !window.confirm('¿Descartar este pendiente? Lo que escribiste no se guardará.')) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Nuevo pendiente"
      subtitle="Solo el título es obligatorio. Lo demás ayuda a que no se olvide."
      width="max-w-2xl"
      footer={
        <>
          <button className="btn-ghost mr-auto" onClick={requestClose}>
            Cancelar
          </button>
          <button className="btn-secondary" onClick={() => submit(true)} disabled={create.isPending}>
            Crear y agregar otro
          </button>
          <button className="btn-primary" onClick={() => submit(false)} disabled={create.isPending}>
            <Plus className="size-4" /> Crear pendiente
          </button>
        </>
      }
    >
      <form
        className="space-y-5 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <div>
          <label className="label" htmlFor="new-ticket-title">
            ¿Qué hay que hacer?
          </label>
          <AutoTextarea
            id="new-ticket-title"
            autoFocus
            minRows={1}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit(e.metaKey || e.ctrlKey);
              }
            }}
            placeholder="Ej. Renovar póliza de auto de Juan Pérez"
            className="input py-2.5 text-[18px] font-semibold"
          />
        </div>

        <div>
          <span className="label">¿Quién lo va a hacer?</span>
          <PersonPicker value={assignee} onChange={setAssignee} />
        </div>

        <div>
          <span className="label">¿Para cuándo?</span>
          <DueDatePicker value={due} onChange={setDue} />
        </div>

        <div>
          <span className="label">Tipo</span>
          <CategoryPicker value={category} onChange={setCategory} />
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <span className="label">Cliente (opcional)</span>
            <ClientPicker value={client} onChange={setClient} />
          </div>
          <button
            type="button"
            onClick={() => setUrgent((u) => !u)}
            className={`chip min-h-11 justify-center px-4 ${urgent ? 'border-clay bg-clay text-white' : 'border-line-2 bg-card text-clay hover:bg-clay-soft'}`}
          >
            <Flame className="size-4" /> {urgent ? 'Es urgente' : '¿Es urgente?'}
          </button>
        </div>

        <button type="button" className="btn-ghost btn-sm -ml-2" onClick={() => setMore((m) => !m)}>
          {more ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {more ? 'Menos opciones' : 'Más opciones: notas, pasos, repetir'}
        </button>

        {more && (
          <div className="animate-rise space-y-5">
            <div>
              <span className="label">Notas</span>
              <AutoTextarea
                minRows={3}
                className="input py-2.5 leading-relaxed"
                placeholder="Número de póliza, datos de contacto, qué se necesita…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <span className="label">Pasos (para ver el avance)</span>
              {steps.length > 0 && (
                <ol className="mb-2 space-y-1">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-paper-2/70 px-3 py-1.5 text-[15px]">
                      <span className="text-ink-3 tabular-nums">{i + 1}.</span>
                      <span className="flex-1">{s}</span>
                      <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="Quitar">
                        <X className="size-4 text-ink-3 hover:text-clay" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <input
                className="input"
                value={step}
                placeholder="Escribe un paso y presiona Enter"
                onChange={(e) => setStep(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (step.trim()) setSteps([...steps, step.trim()]);
                    setStep('');
                  }
                }}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <span className="label">¿Se repite?</span>
                <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
                  {RECURRENCES.map((r) => (
                    <option key={r} value={r}>
                      {RECURRENCE_LABEL[r]}
                    </option>
                  ))}
                </select>
                {recurrence !== 'none' && (
                  <p className="mt-1.5 text-[13px] text-ink-2">Al terminarlo se crea solo el siguiente.</p>
                )}
              </div>
              <div>
                <span className="label">¿Cómo va?</span>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                  <option value="todo">Por hacer</option>
                  <option value="doing">Ya se está haciendo</option>
                  <option value="waiting">Esperando a alguien</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
