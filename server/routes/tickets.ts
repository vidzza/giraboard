import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, nowIso, todayStr, UPLOADS_DIR } from '../db.ts';
import { type AppEnv, requireAdmin } from '../auth.ts';
import { dateStr, fail, idParam, optionalText, readJson } from '../http.ts';
import { broadcastChange, logActivity, notify } from '../events.ts';
import {
  OWN_DELETE_MINUTES,
  assertActiveUsers,
  canArchive,
  canDeleteOwn,
  canViewTicket,
  isLead,
  leadIds,
  membersCanAssign,
  visibleClause,
} from '../permissions.ts';
import {
  PRIORITIES,
  RECURRENCES,
  STATUSES,
  STATUS_LABEL,
  type Activity,
  type Attachment,
  type ChecklistItem,
  type Comment,
  type MyStep,
  type Recurrence,
  type Ticket,
  type User,
} from '../../shared/types.ts';

export const ticketRoutes = new Hono<AppEnv>();

const TICKET_SELECT = `
  SELECT t.*, cl.name AS client_name, cl.phone AS client_phone,
    (SELECT group_concat(user_id) FROM (SELECT user_id FROM ticket_people
       WHERE ticket_id = t.id AND role = 'assignee' ORDER BY added_at, user_id)) AS assignee_csv,
    (SELECT group_concat(user_id) FROM ticket_people WHERE ticket_id = t.id AND role = 'follower') AS follower_csv,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.ticket_id = t.id) AS checklist_total,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.ticket_id = t.id AND ci.done = 1) AS checklist_done,
    (SELECT COUNT(*) FROM comments co WHERE co.ticket_id = t.id) AS comment_count,
    (SELECT COUNT(*) FROM attachments a WHERE a.ticket_id = t.id) AS attachment_count
  FROM tickets t LEFT JOIN clients cl ON cl.id = t.client_id`;

type TicketRow = Omit<Ticket, 'assignee_ids' | 'follower_ids'> & {
  assignee_csv: string | null;
  follower_csv: string | null;
  assignee_id?: unknown;
};

const csvIds = (csv: string | null) => (csv ? csv.split(',').map(Number) : []);

function hydrate(row: TicketRow): Ticket {
  const { assignee_csv, follower_csv, assignee_id: _legacy, ...rest } = row;
  return { ...rest, assignee_ids: csvIds(assignee_csv), follower_ids: csvIds(follower_csv) };
}

/** Pendientes con sus responsables y conteos. `where` usa el alias t. */
export function selectTickets(where: string, params: unknown[], tail = ''): Ticket[] {
  return all<TicketRow>(`${TICKET_SELECT} WHERE ${where} ${tail}`, ...params).map(hydrate);
}

export function getTicket(id: number) {
  return selectTickets('t.id = ?', [id])[0];
}

const DONE_VISIBLE_DAYS = 30;
const MAX_UPLOAD_MB = 25;
const MAX_PEOPLE = 12;

function short(title: string) {
  return title.length > 70 ? `${title.slice(0, 67)}…` : title;
}

/** El pendiente, si esta persona puede verlo. Si no, responde como si no existiera. */
function viewable(user: User, id: number): Ticket {
  const t = getTicket(id);
  if (!t || !canViewTicket(user, t)) fail(404, 'No tienes acceso a ese pendiente o ya no existe');
  return t;
}

// ---------- Personas del pendiente ----------

function setRole(ticketId: number, userId: number, role: 'assignee' | 'follower') {
  run(
    `INSERT INTO ticket_people (ticket_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT(ticket_id, user_id) DO UPDATE SET role = excluded.role, added_at = CASE WHEN role != excluded.role THEN excluded.added_at ELSE added_at END`,
    ticketId,
    userId,
    role,
  );
}

function removePerson(ticketId: number, userId: number, role: 'assignee' | 'follower') {
  run('DELETE FROM ticket_people WHERE ticket_id = ? AND user_id = ? AND role = ?', ticketId, userId, role);
}

/** Todas las personas involucradas (responsables, en copia y quien lo creó). */
function participants(t: Ticket) {
  return new Set([...t.assignee_ids, ...t.follower_ids, t.creator_id]);
}

function notifyMany(ids: Iterable<number>, opts: { actorId: number; ticketId: number; type: string; message: string }) {
  for (const userId of new Set(ids)) notify({ userId, ...opts });
}

/** Avisa a Admin y Coordinación que hay algo por repartir. */
function notifyUnassigned(actor: User, ticketId: number, message: string) {
  notifyMany(leadIds(), { actorId: actor.id, ticketId, type: 'unassigned', message });
}

const uniqueIds = (ids: number[]) => [...new Set(ids)];

/** Evita guardar un tipo o cliente que ya no existe (respondería con un error genérico). */
function assertRefs(body: { category_id?: number | null; client_id?: number | null }) {
  if (body.category_id && !get('SELECT id FROM categories WHERE id = ?', body.category_id)) fail(400, 'Ese tipo de pendiente ya no existe');
  if (body.client_id && !get('SELECT id FROM clients WHERE id = ?', body.client_id)) fail(400, 'Ese cliente ya no existe');
}

/**
 * Reglas para cambiar a quién le toca algo (responsables, en copia o pasos) según el rol y el ajuste del negocio:
 * si el admin apagó «el equipo puede asignar», alguien del Equipo solo puede ponerse o quitarse a sí mismo.
 */
function assertCanChangeAssignees(me: User, before: number[], after: number[], what = 'asignarte a ti') {
  if (isLead(me) || membersCanAssign()) return;
  const changed = [...after.filter((id) => !before.includes(id)), ...before.filter((id) => !after.includes(id))];
  if (changed.some((id) => id !== me.id)) {
    fail(403, `Solo puedes ${what}. Para darle algo a otra persona, déjalo «Por asignar» y coordinación lo reparte.`);
  }
}

// ---------- Repetición ----------

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number) {
  const [y, m, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function nextOccurrence(base: string, rec: Recurrence) {
  const step = (d: string) =>
    rec === 'daily' ? addDays(d, 1) : rec === 'weekly' ? addDays(d, 7) : rec === 'monthly' ? addMonths(d, 1) : addMonths(d, 12);
  const today = todayStr();
  let next = step(base);
  while (next < today) next = step(next);
  return next;
}

/** Al terminar un pendiente que se repite, crea automáticamente el siguiente (con las mismas personas). */
function spawnRecurring(ticket: Ticket, actorId: number) {
  if (ticket.recurrence === 'none' || ticket.next_ticket_id) return;
  const due = nextOccurrence(ticket.due_date ?? todayStr(), ticket.recurrence);
  const res = run(
    `INSERT INTO tickets (title, description, priority, creator_id, category_id, client_id, due_date, recurrence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ticket.title,
    ticket.description,
    ticket.priority,
    ticket.creator_id,
    ticket.category_id,
    ticket.client_id,
    due,
    ticket.recurrence,
  );
  const newId = Number(res.lastInsertRowid);
  ticket.assignee_ids.forEach((uid) => setRole(newId, uid, 'assignee'));
  ticket.follower_ids.forEach((uid) => setRole(newId, uid, 'follower'));
  const items = all<ChecklistItem>('SELECT * FROM checklist_items WHERE ticket_id = ? ORDER BY position, id', ticket.id);
  items.forEach((it, i) =>
    run('INSERT INTO checklist_items (ticket_id, text, position, assignee_id) VALUES (?, ?, ?, ?)', newId, it.text, i, it.assignee_id),
  );
  run('UPDATE tickets SET next_ticket_id = ? WHERE id = ?', newId, ticket.id);
  logActivity(newId, actorId, 'recurring_next', { from_ticket: ticket.id, due_date: due });
  logActivity(ticket.id, actorId, 'recurring_next', { to_ticket: newId, due_date: due });
}

/**
 * Si se reabre un pendiente que se repite (p. ej. con «Deshacer»), se borra el siguiente
 * que se había creado solo, siempre que nadie lo haya tocado todavía.
 */
function undoRecurring(ticket: Ticket) {
  const next = ticket.next_ticket_id;
  if (!next) return;
  const row = get<{ status: string; touched: number }>(
    `SELECT t.status,
       (SELECT COUNT(*) FROM activity a WHERE a.ticket_id = t.id AND a.type != 'recurring_next')
       + (SELECT COUNT(*) FROM comments co WHERE co.ticket_id = t.id)
       + (SELECT COUNT(*) FROM attachments at WHERE at.ticket_id = t.id)
       + (SELECT COUNT(*) FROM checklist_items ci WHERE ci.ticket_id = t.id AND ci.done = 1) AS touched
     FROM tickets t WHERE t.id = ?`,
    next,
  );
  if (row && (row.status !== 'todo' || row.touched > 0)) return;
  if (row) run('DELETE FROM tickets WHERE id = ?', next);
  run('UPDATE tickets SET next_ticket_id = NULL WHERE id = ?', ticket.id);
  run("DELETE FROM activity WHERE ticket_id = ? AND type = 'recurring_next' AND json_extract(data, '$.to_ticket') = ?", ticket.id, next);
}

// ---------- Listados ----------

ticketRoutes.get('/', (c) => {
  const me = c.get('user');
  const vis = visibleClause(me);
  const clientId = c.req.query('client_id');
  if (clientId) {
    return c.json(
      selectTickets(
        `t.client_id = ? AND ${vis.sql}`,
        [Number(clientId), ...vis.params],
        "ORDER BY (t.status = 'done' OR t.archived_at IS NOT NULL), t.created_at DESC",
      ),
    );
  }
  const cutoff = new Date(Date.now() - DONE_VISIBLE_DAYS * 86_400_000).toISOString();
  return c.json(
    selectTickets(
      `t.archived_at IS NULL AND (t.status != 'done' OR t.completed_at >= ?) AND ${vis.sql}`,
      [cutoff, ...vis.params],
      'ORDER BY t.id DESC',
    ),
  );
});

// Archivo: terminados y archivados, con búsqueda.
ticketRoutes.get('/archive', (c) => {
  const me = c.get('user');
  const vis = visibleClause(me);
  const q = (c.req.query('q') ?? '').trim();
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const pageSize = 30;
  const like = `%${q}%`;
  const where = `(t.status = 'done' OR t.archived_at IS NOT NULL) AND ${vis.sql}
    AND (? = '' OR t.title LIKE ? OR t.description LIKE ? OR cl.name LIKE ? OR CAST(t.id AS TEXT) = ?)`;
  const params = [...vis.params, q, like, like, like, q.replace('#', '')];
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM tickets t LEFT JOIN clients cl ON cl.id = t.client_id WHERE ${where}`, ...params)!.n;
  const items = selectTickets(where, [...params, pageSize, (page - 1) * pageSize], 'ORDER BY COALESCE(t.archived_at, t.completed_at) DESC LIMIT ? OFFSET ?');
  return c.json({ items, total, page, page_size: pageSize });
});

// Pasos que le encargaron a esta persona y siguen sin hacer (en pendientes abiertos).
ticketRoutes.get('/my-steps', (c) => {
  const me = c.get('user');
  return c.json(
    all<MyStep>(
      `SELECT ci.id, ci.ticket_id, ci.text, t.title AS ticket_title, t.due_date, t.status AS ticket_status
         FROM checklist_items ci JOIN tickets t ON t.id = ci.ticket_id
        WHERE ci.assignee_id = ? AND ci.done = 0 AND t.status != 'done' AND t.archived_at IS NULL
        ORDER BY t.due_date IS NULL, t.due_date, ci.ticket_id, ci.position, ci.id
        LIMIT 100`,
      me.id,
    ),
  );
});

ticketRoutes.get('/:id', (c) => {
  const id = idParam(c);
  const ticket = viewable(c.get('user'), id);
  const checklist = all<ChecklistItem>('SELECT * FROM checklist_items WHERE ticket_id = ? ORDER BY position, id', id);
  const comments = all<Comment>('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at', id);
  const attachments = all<Attachment>(
    'SELECT id, ticket_id, user_id, filename, mime, size, created_at FROM attachments WHERE ticket_id = ? ORDER BY created_at',
    id,
  );
  const activity = all<Activity & { data: string }>('SELECT * FROM activity WHERE ticket_id = ? ORDER BY created_at, id', id).map((a) => ({
    ...a,
    data: JSON.parse(a.data),
  }));
  return c.json({ ...ticket, checklist, comments, attachments, activity });
});

// ---------- Crear ----------

const peopleList = z.array(z.number().int()).max(MAX_PEOPLE, 'Son demasiadas personas');

const createSchema = z.object({
  title: z.string().trim().min(1, 'Escribe qué hay que hacer').max(200),
  description: z.string().max(10_000).optional().default(''),
  status: z.enum(STATUSES).optional().default('todo'),
  priority: z.enum(PRIORITIES).optional().default('normal'),
  assignee_ids: peopleList.optional(),
  follower_ids: peopleList.optional(),
  category_id: z.number().int().nullable().optional(),
  client_id: z.number().int().nullable().optional(),
  new_client_name: optionalText(120),
  new_client_phone: optionalText(40),
  due_date: dateStr.nullable().optional(),
  waiting_on: optionalText(200),
  follow_up_date: dateStr.nullable().optional(),
  recurrence: z.enum(RECURRENCES).optional().default('none'),
  checklist: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
});

ticketRoutes.post('/', async (c) => {
  const me = c.get('user');
  const body = await readJson(c, createSchema);
  const assignees = uniqueIds(body.assignee_ids ?? [me.id]);
  const followers = uniqueIds(body.follower_ids ?? []).filter((id) => !assignees.includes(id));
  assertActiveUsers([...assignees, ...followers]);
  assertCanChangeAssignees(me, [], assignees);
  assertCanChangeAssignees(me, [], followers, 'ponerte en copia a ti');
  assertRefs(body);

  const id = tx(() => {
    let clientId = body.client_id ?? null;
    if (!clientId && body.new_client_name) {
      const existing = get<{ id: number }>('SELECT id FROM clients WHERE name = ? COLLATE NOCASE', body.new_client_name);
      clientId =
        existing?.id ??
        Number(
          run('INSERT INTO clients (name, phone, created_by) VALUES (?, ?, ?)', body.new_client_name, body.new_client_phone ?? null, me.id)
            .lastInsertRowid,
        );
    }
    const now = nowIso();
    const res = run(
      `INSERT INTO tickets (title, description, status, priority, creator_id, category_id, client_id,
         due_date, waiting_on, follow_up_date, recurrence, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      body.title,
      body.description,
      body.status,
      body.priority,
      me.id,
      body.category_id ?? null,
      clientId,
      body.due_date ?? null,
      body.waiting_on ?? null,
      body.follow_up_date ?? null,
      body.recurrence,
      body.status === 'done' ? now : null,
    );
    const newId = Number(res.lastInsertRowid);
    assignees.forEach((uid) => setRole(newId, uid, 'assignee'));
    followers.forEach((uid) => setRole(newId, uid, 'follower'));
    (body.checklist ?? []).forEach((text, i) => run('INSERT INTO checklist_items (ticket_id, text, position) VALUES (?, ?, ?)', newId, text, i));
    logActivity(newId, me.id, 'created', { assignee_ids: assignees });
    const title = short(body.title);
    notifyMany(assignees, { actorId: me.id, ticketId: newId, type: 'assigned', message: `${me.name} te asignó: ${title}` });
    notifyMany(followers, { actorId: me.id, ticketId: newId, type: 'follower', message: `${me.name} te puso en copia: ${title}` });
    if (assignees.length === 0) notifyUnassigned(me, newId, `${me.name} creó un pendiente por asignar: ${title}`);
    return newId;
  });
  broadcastChange('tickets');
  return c.json(getTicket(id));
});

// ---------- Editar ----------

const updateSchema = z.object({
  title: z.string().trim().min(1, 'El título no puede quedar vacío').max(200).optional(),
  description: z.string().max(10_000).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee_ids: peopleList.optional(),
  follower_ids: peopleList.optional(),
  category_id: z.number().int().nullable().optional(),
  client_id: z.number().int().nullable().optional(),
  new_client_name: optionalText(120),
  due_date: dateStr.nullable().optional(),
  waiting_on: optionalText(200),
  follow_up_date: dateStr.nullable().optional(),
  recurrence: z.enum(RECURRENCES).optional(),
  archived: z.boolean().optional(),
});

ticketRoutes.patch('/:id', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const body = await readJson(c, updateSchema);
  const t = viewable(me, id);
  assertRefs(body);
  if (body.archived !== undefined && body.archived !== !!t.archived_at && !canArchive(me, t)) {
    fail(403, 'Solo admin, coordinación o quien lo creó pueden archivarlo');
  }
  const now = nowIso();
  const title = short(body.title ?? t.title);

  tx(() => {
    const set = (col: string, value: unknown) =>
      run(`UPDATE tickets SET ${col} = ?, updated_at = ?, last_activity_at = ? WHERE id = ?`, value, now, now, id);

    if (body.title !== undefined && body.title !== t.title) {
      set('title', body.title);
      logActivity(id, me.id, 'title', { from: t.title, to: body.title });
    }
    if (body.description !== undefined && body.description !== t.description) set('description', body.description);
    if (body.priority !== undefined && body.priority !== t.priority) {
      set('priority', body.priority);
      logActivity(id, me.id, 'priority', { from: t.priority, to: body.priority });
    }
    if (body.due_date !== undefined && body.due_date !== t.due_date) {
      set('due_date', body.due_date);
      logActivity(id, me.id, 'due', { from: t.due_date, to: body.due_date });
    }
    if (body.category_id !== undefined && body.category_id !== t.category_id) {
      set('category_id', body.category_id);
      logActivity(id, me.id, 'category', { from_id: t.category_id, to_id: body.category_id });
    }
    if (body.recurrence !== undefined && body.recurrence !== t.recurrence) {
      set('recurrence', body.recurrence);
      logActivity(id, me.id, 'recurrence', { from: t.recurrence, to: body.recurrence });
    }
    if (body.client_id !== undefined || body.new_client_name) {
      let clientId = body.client_id ?? null;
      if (body.new_client_name) {
        const existing = get<{ id: number }>('SELECT id FROM clients WHERE name = ? COLLATE NOCASE', body.new_client_name);
        clientId = existing?.id ?? Number(run('INSERT INTO clients (name, created_by) VALUES (?, ?)', body.new_client_name, me.id).lastInsertRowid);
      }
      if (clientId !== t.client_id) {
        set('client_id', clientId);
        const name = clientId ? get<{ name: string }>('SELECT name FROM clients WHERE id = ?', clientId)?.name : null;
        logActivity(id, me.id, 'client', { name });
      }
    }
    const waitingChanged =
      (body.waiting_on !== undefined && body.waiting_on !== t.waiting_on) ||
      (body.follow_up_date !== undefined && body.follow_up_date !== t.follow_up_date);
    if (waitingChanged) {
      if (body.waiting_on !== undefined) set('waiting_on', body.waiting_on);
      if (body.follow_up_date !== undefined) set('follow_up_date', body.follow_up_date);
      logActivity(id, me.id, 'waiting', {
        waiting_on: body.waiting_on !== undefined ? body.waiting_on : t.waiting_on,
        follow_up_date: body.follow_up_date !== undefined ? body.follow_up_date : t.follow_up_date,
      });
    }

    // Responsables
    let assignees = t.assignee_ids;
    if (body.assignee_ids !== undefined) {
      const next = uniqueIds(body.assignee_ids);
      assertActiveUsers(next, t.assignee_ids);
      assertCanChangeAssignees(me, t.assignee_ids, next);
      const added = next.filter((uid) => !t.assignee_ids.includes(uid));
      const removed = t.assignee_ids.filter((uid) => !next.includes(uid));
      if (added.length || removed.length) {
        removed.forEach((uid) => removePerson(id, uid, 'assignee'));
        added.forEach((uid) => setRole(id, uid, 'assignee'));
        run('UPDATE tickets SET updated_at = ? WHERE id = ?', now, id);
        logActivity(id, me.id, 'assignees', { added, removed });
        notifyMany(added, { actorId: me.id, ticketId: id, type: 'assigned', message: `${me.name} te asignó: ${title}` });
        notifyMany(removed, { actorId: me.id, ticketId: id, type: 'unassigned_me', message: `${me.name} te quitó de: ${title}` });
        if (next.length === 0 && t.status !== 'done') notifyUnassigned(me, id, `«${title}» quedó por asignar (${me.name} lo dejó sin responsable)`);
      }
      assignees = next;
    }

    // En copia
    if (body.follower_ids !== undefined) {
      const next = uniqueIds(body.follower_ids).filter((uid) => !assignees.includes(uid));
      const current = t.follower_ids.filter((uid) => !assignees.includes(uid));
      assertActiveUsers(next, current);
      assertCanChangeAssignees(me, current, next, 'ponerte o quitarte de la copia a ti');
      const added = next.filter((uid) => !current.includes(uid));
      const removed = current.filter((uid) => !next.includes(uid));
      if (added.length || removed.length) {
        removed.forEach((uid) => removePerson(id, uid, 'follower'));
        added.forEach((uid) => setRole(id, uid, 'follower'));
        logActivity(id, me.id, 'followers', { added, removed });
        notifyMany(added, { actorId: me.id, ticketId: id, type: 'follower', message: `${me.name} te puso en copia: ${title}` });
      }
    }

    if (body.status !== undefined && body.status !== t.status) {
      run(
        `UPDATE tickets SET status = ?, status_changed_at = ?, completed_at = ?, updated_at = ?, last_activity_at = ? WHERE id = ?`,
        body.status,
        now,
        body.status === 'done' ? now : null,
        now,
        now,
        id,
      );
      logActivity(id, me.id, 'status', { from: t.status, to: body.status });
      if (t.status === 'done') undoRecurring(t);
      const fresh = getTicket(id)!;
      notifyMany(participants(fresh), {
        actorId: me.id,
        ticketId: id,
        type: body.status === 'done' ? 'done' : 'status',
        message: body.status === 'done' ? `${me.name} terminó: ${title}` : `${me.name} movió a «${STATUS_LABEL[body.status]}»: ${title}`,
      });
      if (body.status === 'done') spawnRecurring(fresh, me.id);
    }
    if (body.archived !== undefined && body.archived !== !!t.archived_at) {
      set('archived_at', body.archived ? now : null);
      logActivity(id, me.id, body.archived ? 'archived' : 'unarchived');
    }
  });

  broadcastChange('tickets');
  // Si la persona se quitó a sí misma y ya no puede verlo, no le devolvemos el pendiente.
  const after = getTicket(id)!;
  return c.json(canViewTicket(me, after) ? after : { id, hidden: true });
});

// Seguir o dejar de seguir (estar «en copia»).
ticketRoutes.post('/:id/follow', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const body = await readJson(c, z.object({ follow: z.boolean() }));
  const t = viewable(me, id);
  if (t.assignee_ids.includes(me.id)) fail(400, 'Eres responsable de este pendiente');
  if (body.follow) setRole(id, me.id, 'follower');
  else removePerson(id, me.id, 'follower');
  logActivity(id, me.id, 'followers', body.follow ? { added: [me.id], removed: [] } : { added: [], removed: [me.id] });
  broadcastChange('tickets');
  return c.json({ ok: true });
});

ticketRoutes.delete('/:id', requireAdmin, (c) => {
  const id = idParam(c);
  const files = all<{ stored_name: string }>('SELECT stored_name FROM attachments WHERE ticket_id = ?', id);
  run('DELETE FROM tickets WHERE id = ?', id);
  for (const f of files) fs.rm(path.join(UPLOADS_DIR, f.stored_name), { force: true }, () => {});
  broadcastChange('tickets');
  return c.json({ ok: true });
});

// ---------- Pasos (checklist) ----------

/** Si se le asigna un paso a alguien del Equipo que no participa, queda en copia para que pueda verlo. */
function ensureCanSee(ticket: Ticket, userId: number, actor: User) {
  if (ticket.assignee_ids.includes(userId) || ticket.follower_ids.includes(userId) || ticket.creator_id === userId) return;
  const role = get<{ role: string }>('SELECT role FROM users WHERE id = ?', userId)?.role;
  if (role === 'admin' || role === 'manager') return;
  setRole(ticket.id, userId, 'follower');
  logActivity(ticket.id, actor.id, 'followers', { added: [userId], removed: [] });
}

ticketRoutes.post('/:id/checklist', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const body = await readJson(
    c,
    z.object({ text: z.string().trim().min(1, 'Escribe el paso').max(300), assignee_id: z.number().int().nullable().optional() }),
  );
  const t = viewable(me, id);
  if (body.assignee_id) assertCanChangeAssignees(me, [], [body.assignee_id], 'encargarte pasos a ti');
  const pos = get<{ p: number | null }>('SELECT MAX(position) p FROM checklist_items WHERE ticket_id = ?', id)!.p ?? -1;
  const itemId = tx(() => {
    if (body.assignee_id) {
      assertActiveUsers([body.assignee_id]);
      ensureCanSee(t, body.assignee_id, me);
    }
    const res = run(
      'INSERT INTO checklist_items (ticket_id, text, position, assignee_id) VALUES (?, ?, ?, ?)',
      id,
      body.text,
      pos + 1,
      body.assignee_id ?? null,
    );
    logActivity(id, me.id, 'checklist_add', { text: body.text, to_id: body.assignee_id ?? null });
    if (body.assignee_id) {
      notify({
        userId: body.assignee_id,
        actorId: me.id,
        ticketId: id,
        type: 'step',
        message: `${me.name} te encargó el paso «${body.text}» en ${short(t.title)}`,
      });
    }
    return res.lastInsertRowid;
  });
  broadcastChange('tickets');
  return c.json(get<ChecklistItem>('SELECT * FROM checklist_items WHERE id = ?', itemId));
});

export const checklistRoutes = new Hono<AppEnv>();

function checklistItem(user: User, itemId: number) {
  const item = get<ChecklistItem>('SELECT * FROM checklist_items WHERE id = ?', itemId);
  if (!item) fail(404, 'Ese paso ya no existe');
  return { item, ticket: viewable(user, item.ticket_id) };
}

checklistRoutes.patch('/:id', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const body = await readJson(
    c,
    z.object({
      text: z.string().trim().min(1).max(300).optional(),
      done: z.boolean().optional(),
      assignee_id: z.number().int().nullable().optional(),
    }),
  );
  const { item, ticket } = checklistItem(me, id);
  if (body.assignee_id !== undefined && body.assignee_id !== item.assignee_id) {
    assertCanChangeAssignees(me, item.assignee_id ? [item.assignee_id] : [], body.assignee_id ? [body.assignee_id] : [], 'encargarte pasos a ti');
  }
  tx(() => {
    if (body.text !== undefined) run('UPDATE checklist_items SET text = ? WHERE id = ?', body.text, id);
    if (body.assignee_id !== undefined && body.assignee_id !== item.assignee_id) {
      if (body.assignee_id) {
        assertActiveUsers([body.assignee_id]);
        ensureCanSee(ticket, body.assignee_id, me);
        notify({
          userId: body.assignee_id,
          actorId: me.id,
          ticketId: ticket.id,
          type: 'step',
          message: `${me.name} te encargó el paso «${body.text ?? item.text}» en ${short(ticket.title)}`,
        });
      }
      run('UPDATE checklist_items SET assignee_id = ? WHERE id = ?', body.assignee_id, id);
      logActivity(item.ticket_id, me.id, 'checklist_assigned', { text: body.text ?? item.text, to_id: body.assignee_id });
    }
    if (body.done !== undefined && body.done !== !!item.done) {
      run(
        'UPDATE checklist_items SET done = ?, done_by = ?, done_at = ? WHERE id = ?',
        body.done ? 1 : 0,
        body.done ? me.id : null,
        body.done ? nowIso() : null,
        id,
      );
      logActivity(item.ticket_id, me.id, body.done ? 'checklist_done' : 'checklist_undone', { text: body.text ?? item.text });
    }
  });
  broadcastChange('tickets');
  return c.json(get<ChecklistItem>('SELECT * FROM checklist_items WHERE id = ?', id));
});

checklistRoutes.delete('/:id', (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const { item } = checklistItem(me, id);
  run('DELETE FROM checklist_items WHERE id = ?', id);
  logActivity(item.ticket_id, me.id, 'checklist_removed', { text: item.text });
  broadcastChange('tickets');
  return c.json({ ok: true });
});

// ---------- Comentarios / avances ----------

ticketRoutes.post('/:id/comments', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const body = await readJson(c, z.object({ body: z.string().trim().min(1, 'Escribe algo').max(5000) }));
  const t = viewable(me, id);
  const commentId = tx(() => {
    const res = run('INSERT INTO comments (ticket_id, user_id, body) VALUES (?, ?, ?)', id, me.id, body.body);
    logActivity(id, me.id, 'comment', { comment_id: Number(res.lastInsertRowid) });
    const preview = body.body.length > 80 ? `${body.body.slice(0, 77)}…` : body.body;
    const recipients = participants(t);
    // Menciones con @usuario: avisarles y, si no podían verlo, ponerlos en copia.
    const users = all<User>('SELECT id, username, role FROM users WHERE active = 1');
    for (const u of users) {
      const escaped = u.username.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
      if (new RegExp(`@${escaped}(?![\\w-])`, 'i').test(body.body)) {
        if (u.id !== me.id) ensureCanSee(t, u.id, me);
        recipients.add(u.id);
      }
    }
    notifyMany(recipients, { actorId: me.id, ticketId: id, type: 'comment', message: `${me.name} comentó en «${short(t.title)}»: ${preview}` });
    return Number(res.lastInsertRowid);
  });
  broadcastChange('tickets');
  return c.json(get<Comment>('SELECT * FROM comments WHERE id = ?', commentId));
});

export const commentRoutes = new Hono<AppEnv>();

commentRoutes.delete('/:id', (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const comment = get<Comment>('SELECT * FROM comments WHERE id = ?', id);
  if (!comment) fail(404, 'Ese comentario ya no existe');
  viewable(me, comment.ticket_id);
  if (!canDeleteOwn(me, comment.user_id, comment.created_at)) {
    fail(403, `Solo un admin puede borrar notas (las tuyas las puedes borrar durante ${OWN_DELETE_MINUTES} minutos)`);
  }
  run('DELETE FROM comments WHERE id = ?', id);
  broadcastChange('tickets');
  return c.json({ ok: true });
});

// ---------- Archivos adjuntos ----------

ticketRoutes.post(
  '/:id/attachments',
  bodyLimit({
    maxSize: MAX_UPLOAD_MB * 1024 * 1024,
    onError: (c) => c.json({ error: `El archivo pesa más de ${MAX_UPLOAD_MB} MB` }, 413),
  }),
  async (c) => {
    const id = idParam(c);
    const me = c.get('user');
    viewable(me, id);
    const form = await c.req.parseBody();
    const file = form['file'];
    if (!(file instanceof File) || file.size === 0) fail(400, 'Elige un archivo');
    const ext = path.extname(file.name).slice(0, 10).replace(/[^.\w]/g, '');
    const storedName = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, storedName), Buffer.from(await file.arrayBuffer()));
    const res = run(
      'INSERT INTO attachments (ticket_id, user_id, filename, stored_name, mime, size) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      me.id,
      file.name.slice(0, 200),
      storedName,
      file.type || 'application/octet-stream',
      file.size,
    );
    logActivity(id, me.id, 'attachment', { filename: file.name });
    broadcastChange('tickets');
    return c.json(
      get<Attachment>('SELECT id, ticket_id, user_id, filename, mime, size, created_at FROM attachments WHERE id = ?', res.lastInsertRowid),
    );
  },
);

export const attachmentRoutes = new Hono<AppEnv>();

attachmentRoutes.get('/:id', (c) => {
  const id = idParam(c);
  const a = get<Attachment & { stored_name: string }>('SELECT * FROM attachments WHERE id = ?', id);
  if (!a) fail(404, 'Ese archivo ya no existe');
  viewable(c.get('user'), a.ticket_id);
  const filePath = path.join(UPLOADS_DIR, a.stored_name);
  if (!fs.existsSync(filePath)) fail(404, 'Ese archivo ya no existe');
  // Solo imágenes comunes y PDF se muestran en el navegador; lo demás (incluido SVG/HTML) se descarga.
  const inline = /^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf)$/.test(a.mime) && c.req.query('download') === undefined;
  c.header('Content-Type', inline ? a.mime : 'application/octet-stream');
  // El visor de PDF de Chrome no funciona en modo sandbox; los PDF van sin él.
  if (a.mime !== 'application/pdf') {
    c.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  }
  c.header('Content-Length', String(a.size));
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  return c.body(fs.readFileSync(filePath));
});

attachmentRoutes.delete('/:id', (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const a = get<Attachment & { stored_name: string }>('SELECT * FROM attachments WHERE id = ?', id);
  if (!a) fail(404, 'Ese archivo ya no existe');
  viewable(me, a.ticket_id);
  if (!canDeleteOwn(me, a.user_id, a.created_at)) {
    fail(403, `Solo un admin puede borrar archivos (los tuyos los puedes borrar durante ${OWN_DELETE_MINUTES} minutos)`);
  }
  run('DELETE FROM attachments WHERE id = ?', id);
  fs.rm(path.join(UPLOADS_DIR, a.stored_name), { force: true }, () => {});
  logActivity(a.ticket_id, me.id, 'attachment_deleted', { filename: a.filename });
  broadcastChange('tickets');
  return c.json({ ok: true });
});
