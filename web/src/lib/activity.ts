import {
  PRIORITY_LABEL,
  RECURRENCE_LABEL,
  ROLE_LABEL,
  STATUS_LABEL,
  type Activity,
  type Category,
  type Priority,
  type Recurrence,
  type Role,
  type Status,
  type User,
} from '../../../shared/types.ts';
import { formatDue } from './dates.ts';

/** Convierte un registro del historial en una frase legible. */
export function describeActivity(a: Activity, users: Map<number, User>, categories: Map<number, Category>): string {
  const d = a.data as Record<string, any>;
  const name = (id: number | null | undefined) => (id ? (users.get(id)?.name ?? 'alguien') : 'nadie');
  const self = (id: number) => (id === a.user_id ? 'sí mismo' : name(id));
  const list = (ids: number[]) => {
    const names = ids.map(self);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : (names[0] ?? '');
  };
  switch (a.type) {
    case 'created': {
      // Los registros viejos guardaban un solo responsable (assignee_id).
      const ids: number[] = Array.isArray(d.assignee_ids) ? d.assignee_ids : d.assignee_id ? [d.assignee_id] : [];
      if (ids.length === 0) return 'creó el pendiente (por asignar)';
      if (ids.length === 1 && ids[0] === a.user_id) return 'creó el pendiente';
      return `creó el pendiente y se lo asignó a ${list(ids)}`;
    }
    case 'assignees': {
      const added: number[] = d.added ?? [];
      const removed: number[] = d.removed ?? [];
      const parts: string[] = [];
      if (added.length) parts.push(added.length === 1 && added[0] === a.user_id ? 'lo tomó' : `se lo asignó a ${list(added)}`);
      if (removed.length) parts.push(removed.length === 1 && removed[0] === a.user_id ? 'se quitó' : `quitó a ${list(removed)}`);
      return parts.join(' y ') || 'cambió a los responsables';
    }
    case 'followers': {
      const added: number[] = d.added ?? [];
      const removed: number[] = d.removed ?? [];
      if (added.length === 1 && added[0] === a.user_id && !removed.length) return 'empezó a seguirlo';
      if (removed.length === 1 && removed[0] === a.user_id && !added.length) return 'dejó de seguirlo';
      const parts: string[] = [];
      if (added.length) parts.push(`puso en copia a ${list(added)}`);
      if (removed.length) parts.push(`quitó de la copia a ${list(removed)}`);
      return parts.join(' y ') || 'cambió a quién está en copia';
    }
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
      return d.to_id ? `agregó el paso «${d.text}» y se lo encargó a ${self(d.to_id)}` : `agregó el paso «${d.text}»`;
    case 'checklist_assigned':
      return d.to_id ? `le encargó el paso «${d.text}» a ${self(d.to_id)}` : `dejó el paso «${d.text}» sin persona`;
    case 'checklist_removed':
      return `quitó el paso «${d.text}»`;
    case 'checklist_done':
      return `completó el paso «${d.text}»`;
    case 'checklist_undone':
      return `desmarcó el paso «${d.text}»`;
    case 'comment':
      return 'escribió una nota';
    case 'attachment':
      return `subió el archivo «${d.filename}»`;
    case 'attachment_deleted':
      return `borró el archivo «${d.filename}»`;
    case 'archived':
      return 'lo archivó';
    case 'unarchived':
      return 'lo sacó del archivo';
    case 'recurring_next':
      return d.to_ticket
        ? `se creó el siguiente (#${d.to_ticket}) para ${formatDue(d.due_date).toLowerCase()}`
        : `se creó solo porque se repite (viene del #${d.from_ticket})`;
    case 'user_created':
      return `dio acceso a ${name(d.user_id)}${d.role && d.role !== 'member' ? ` como ${ROLE_LABEL[d.role as Role] ?? d.role}` : ''}`;
    case 'user_deactivated':
      return `le quitó el acceso a ${name(d.user_id)}${d.reassigned ? ` y repartió sus ${d.reassigned} pendientes` : ''}`;
    case 'user_reactivated':
      return `le devolvió el acceso a ${name(d.user_id)}`;
    case 'password_reset':
      return `le dio una contraseña temporal a ${name(d.user_id)}`;
    case 'password_set':
      return 'creó su contraseña';
    case 'role_changed':
      return `cambió el rol de ${name(d.user_id)} a «${ROLE_LABEL[d.role as Role] ?? d.role}»`;
    default:
      return 'hizo un cambio';
  }
}

export function whatsappLink(phone: string, text?: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `52${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
