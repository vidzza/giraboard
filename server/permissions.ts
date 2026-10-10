// Quién puede ver y hacer qué. Todas las rutas de pendientes pasan por aquí.
//
//  Admin         → todo (cuentas, ajustes, borrar, descargar datos).
//  Coordinación  → ve todos los pendientes, los reparte y ve el Resumen.
//  Equipo        → solo ve los pendientes donde es responsable, los que creó y donde está en copia.
//
// Lo que no tiene responsable («por asignar») solo lo ven Admin, Coordinación y quien lo creó.
import { all, get, getSetting } from './db.ts';
import { fail } from './http.ts';
import { seesEverything, type User } from '../shared/types.ts';

/** Minutos en que alguien puede borrar su propio comentario o archivo (después, solo un admin). */
export const OWN_DELETE_MINUTES = 15;

export function isLead(user: User) {
  return seesEverything(user.role);
}

/** Condición SQL para filtrar pendientes visibles por esta persona (alias de la tabla tickets: t). */
export function visibleClause(user: User, alias = 't'): { sql: string; params: unknown[] } {
  if (isLead(user)) return { sql: '1', params: [] };
  return {
    sql: `(${alias}.creator_id = ? OR EXISTS (SELECT 1 FROM ticket_people vp WHERE vp.ticket_id = ${alias}.id AND vp.user_id = ?))`,
    params: [user.id, user.id],
  };
}

export function canViewTicket(user: User, ticket: { id: number; creator_id: number }) {
  if (isLead(user) || ticket.creator_id === user.id) return true;
  return !!get('SELECT 1 FROM ticket_people WHERE ticket_id = ? AND user_id = ?', ticket.id, user.id);
}

/** Archivar (ocultar porque ya no aplica): Admin, Coordinación o quien lo creó. */
export function canArchive(user: User, ticket: { creator_id: number }) {
  return isLead(user) || ticket.creator_id === user.id;
}

export function membersCanAssign() {
  return getSetting('members_can_assign', '1') === '1';
}

/** Borrar lo propio solo durante unos minutos (para corregir un error); después, solo un admin. */
export function canDeleteOwn(user: User, ownerId: number, createdAt: string) {
  if (user.role === 'admin') return true;
  if (user.id !== ownerId) return false;
  return Date.now() - new Date(createdAt).getTime() < OWN_DELETE_MINUTES * 60_000;
}

export function leadIds(): number[] {
  return all<{ id: number }>("SELECT id FROM users WHERE active = 1 AND role IN ('admin','manager')").map((u) => u.id);
}

/** Verifica que todas las personas existan y tengan acceso. Las ya asignadas se permiten aunque estén inactivas. */
export function assertActiveUsers(ids: number[], alreadyThere: number[] = []) {
  for (const id of ids) {
    if (alreadyThere.includes(id)) continue;
    if (!get('SELECT id FROM users WHERE id = ? AND active = 1', id)) fail(400, 'Una de las personas elegidas ya no tiene acceso');
  }
}
