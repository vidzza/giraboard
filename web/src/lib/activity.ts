import {
  PRIORITY_LABEL,
  RECURRENCE_LABEL,
  STATUS_LABEL,
  type Activity,
  type Category,
  type Priority,
  type Recurrence,
  type Status,
  type User,
} from '../../../shared/types.ts';
import { formatDue } from './dates.ts';

/** Convierte un registro del historial en una frase legible. */
export function describeActivity(a: Activity, users: Map<number, User>, categories: Map<number, Category>): string {
  const d = a.data as Record<string, any>;
  const name = (id: number | null | undefined) => (id ? (users.get(id)?.name ?? 'alguien') : 'nadie');
  switch (a.type) {
    case 'created':
      return d.assignee_id && d.assignee_id !== a.user_id
        ? `creó el pendiente y se lo asignó a ${name(d.assignee_id)}`
        : 'creó el pendiente';
    case 'status':
      return `lo movió a «${STATUS_LABEL[d.to as Status]}»`;
    case 'assignee':
      return d.to_id ? `se lo asignó a ${name(d.to_id)}` : 'lo dejó sin responsable';
    case 'due':
      return d.to ? `puso fecha límite: ${formatDue(d.to).toLowerCase()}` : 'quitó la fecha límite';
    case 'priority':
      return `cambió la prioridad a «${PRIORITY_LABEL[d.to as Priority]}»`;
    case 'title':
      return `cambió el título (antes: «${d.from}»)`;
    case 'category':
      return d.to_id ? `lo puso en la categoría «${categories.get(d.to_id)?.name ?? '—'}»` : 'quitó la categoría';
    case 'client':
      return d.name ? `lo ligó al cliente ${d.name}` : 'quitó el cliente';
    case 'waiting': {
      const parts = [];
      if (d.waiting_on) parts.push(`se espera: ${d.waiting_on}`);
      if (d.follow_up_date) parts.push(`revisar ${formatDue(d.follow_up_date).toLowerCase()}`);
      return parts.length ? `anotó que ${parts.join(', ')}` : 'quitó los datos de espera';
    }
    case 'recurrence':
      return `cambió la repetición a «${RECURRENCE_LABEL[d.to as Recurrence]}»`;
    case 'checklist_add':
      return `agregó el paso «${d.text}»`;
    case 'checklist_done':
      return `completó el paso «${d.text}»`;
    case 'checklist_undone':
      return `desmarcó el paso «${d.text}»`;
    case 'comment':
      return 'escribió una nota';
    case 'attachment':
      return `subió el archivo «${d.filename}»`;
    case 'archived':
      return 'lo archivó';
    case 'unarchived':
      return 'lo sacó del archivo';
    case 'recurring_next':
      return d.to_ticket
        ? `se creó el siguiente (#${d.to_ticket}) para ${formatDue(d.due_date).toLowerCase()}`
        : `se creó solo porque se repite (viene del #${d.from_ticket})`;
    case 'user_created':
      return `dio acceso a ${name(d.user_id)}${d.role === 'admin' ? ' como admin' : ''}`;
    case 'user_deactivated':
      return `le quitó el acceso a ${name(d.user_id)}${d.reassigned ? ` y repartió sus ${d.reassigned} pendientes` : ''}`;
    case 'user_reactivated':
      return `le devolvió el acceso a ${name(d.user_id)}`;
    case 'password_reset':
      return `le dio una contraseña temporal a ${name(d.user_id)}`;
    case 'password_set':
      return 'creó su contraseña';
    case 'role_changed':
      return d.role === 'admin' ? `le dio permisos de admin a ${name(d.user_id)}` : `le quitó los permisos de admin a ${name(d.user_id)}`;
    default:
      return 'hizo un cambio';
  }
}

export function whatsappLink(phone: string, text?: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `52${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
