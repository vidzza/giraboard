// Las mismas reglas que aplica el servidor, para mostrar solo lo que cada quien puede hacer.
// (El servidor siempre vuelve a revisar; esto solo evita botones que no funcionarían.)
import { seesEverything, type Settings, type Ticket, type User } from '../../../shared/types.ts';

/** Minutos en que alguien puede borrar su propia nota o archivo (igual que en el servidor). */
export const OWN_DELETE_MINUTES = 15;

export function isLead(user: User) {
  return seesEverything(user.role);
}

export function isAdmin(user: User) {
  return user.role === 'admin';
}

export function canArchive(user: User, ticket: Pick<Ticket, 'creator_id'>) {
  return isLead(user) || ticket.creator_id === user.id;
}

/** ¿Puede asignar pendientes a otras personas? (si no, solo a sí mismo o dejarlo por asignar) */
export function canAssignOthers(user: User, settings: Settings | undefined) {
  return isLead(user) || (settings?.members_can_assign ?? true);
}

export function canDeleteOwn(user: User, ownerId: number, createdAt: string) {
  if (isAdmin(user)) return true;
  if (user.id !== ownerId) return false;
  return Date.now() - new Date(createdAt).getTime() < OWN_DELETE_MINUTES * 60_000;
}

/** Es responsable, lo creó o está en copia. */
export function involvement(user: User, t: Ticket): 'assignee' | 'creator' | 'follower' | null {
  if (t.assignee_ids.includes(user.id)) return 'assignee';
  if (t.follower_ids.includes(user.id)) return 'follower';
  if (t.creator_id === user.id) return 'creator';
  return null;
}
