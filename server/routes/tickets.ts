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
  PRIORITIES,
  RECURRENCES,
  STATUSES,
  STATUS_LABEL,
  type Activity,
  type Attachment,
  type ChecklistItem,
  type Comment,
  type Recurrence,
  type Ticket,
  type User,
} from '../../shared/types.ts';

export const ticketRoutes = new Hono<AppEnv>();

export const TICKET_SELECT = `
  SELECT t.*, cl.name AS client_name, cl.phone AS client_phone,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.ticket_id = t.id) AS checklist_total,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.ticket_id = t.id AND ci.done = 1) AS checklist_done,
    (SELECT COUNT(*) FROM comments co WHERE co.ticket_id = t.id) AS comment_count,
    (SELECT COUNT(*) FROM attachments a WHERE a.ticket_id = t.id) AS attachment_count
  FROM tickets t LEFT JOIN clients cl ON cl.id = t.client_id`;

const DONE_VISIBLE_DAYS = 30;
const MAX_UPLOAD_MB = 25;

export function getTicket(id: number) {
  return get<Ticket>(`${TICKET_SELECT} WHERE t.id = ?`, id);
}

function userName(id: number | null | undefined) {
  if (!id) return 'Alguien';
  return get<{ name: string }>('SELECT name FROM users WHERE id = ?', id)?.name ?? 'Alguien';
}

function short(title: string) {
  return title.length > 70 ? `${title.slice(0, 67)}…` : title;
}

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

/** Al terminar un pendiente que se repite, crea automáticamente el siguiente. */
function spawnRecurring(ticket: Ticket, actorId: number) {
  if (ticket.recurrence === 'none' || ticket.next_ticket_id) return;
  const due = nextOccurrence(ticket.due_date ?? todayStr(), ticket.recurrence);
  const res = run(
    `INSERT INTO tickets (title, description, priority, assignee_id, creator_id, category_id, client_id, due_date, recurrence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ticket.title,
    ticket.description,
    ticket.priority,
    ticket.assignee_id,
    ticket.creator_id,
    ticket.category_id,
    ticket.client_id,
    due,
    ticket.recurrence,
  );
  const newId = Number(res.lastInsertRowid);
  const items = all<ChecklistItem>('SELECT * FROM checklist_items WHERE ticket_id = ? ORDER BY position, id', ticket.id);
  items.forEach((it, i) => run('INSERT INTO checklist_items (ticket_id, text, position) VALUES (?, ?, ?)', newId, it.text, i));
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
  const clientId = c.req.query('client_id');
  if (clientId) {
    return c.json(
      all<Ticket>(
        `${TICKET_SELECT} WHERE t.client_id = ? ORDER BY (t.status = 'done' OR t.archived_at IS NOT NULL), t.created_at DESC`,
        Number(clientId),
      ),
    );
  }
  const cutoff = new Date(Date.now() - DONE_VISIBLE_DAYS * 86_400_000).toISOString();
  return c.json(
    all<Ticket>(
      `${TICKET_SELECT} WHERE t.archived_at IS NULL AND (t.status != 'done' OR t.completed_at >= ?)
       ORDER BY t.id DESC`,
      cutoff,
    ),
  );
});

// Archivo: terminados y archivados, con búsqueda.
ticketRoutes.get('/archive', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const pageSize = 30;
  const like = `%${q}%`;
  const where = `(t.status = 'done' OR t.archived_at IS NOT NULL)
    AND (? = '' OR t.title LIKE ? OR t.description LIKE ? OR cl.name LIKE ? OR CAST(t.id AS TEXT) = ?)`;
  const params = [q, like, like, like, q.replace('#', '')];
  const total = get<{ n: number }>(
    `SELECT COUNT(*) n FROM tickets t LEFT JOIN clients cl ON cl.id = t.client_id WHERE ${where}`,
    ...params,
  )!.n;
  const items = all<Ticket>(
    `${TICKET_SELECT} WHERE ${where}
     ORDER BY COALESCE(t.archived_at, t.completed_at) DESC LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );
  return c.json({ items, total, page, page_size: pageSize });
});

ticketRoutes.get('/:id', (c) => {
  const id = idParam(c);
  const ticket = getTicket(id);
  if (!ticket) fail(404, 'Ese pendiente no existe o fue eliminado');
  const checklist = all<ChecklistItem>('SELECT * FROM checklist_items WHERE ticket_id = ? ORDER BY position, id', id);
  const comments = all<Comment>('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at', id);
  const attachments = all<Attachment>(
    'SELECT id, ticket_id, user_id, filename, mime, size, created_at FROM attachments WHERE ticket_id = ? ORDER BY created_at',
    id,
  );
  const activity = all<Activity & { data: string }>(
    'SELECT * FROM activity WHERE ticket_id = ? ORDER BY created_at, id',
    id,
  ).map((a) => ({ ...a, data: JSON.parse(a.data) }));
  return c.json({ ...ticket, checklist, comments, attachments, activity });
});

// ---------- Crear ----------

const createSchema = z.object({
  title: z.string().trim().min(1, 'Escribe qué hay que hacer').max(200),
  description: z.string().max(10_000).optional().default(''),
  status: z.enum(STATUSES).optional().default('todo'),
  priority: z.enum(PRIORITIES).optional().default('normal'),
  assignee_id: z.number().int().nullable().optional(),
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
  const assignee = body.assignee_id === undefined ? me.id : body.assignee_id;
  if (assignee && !get('SELECT id FROM users WHERE id = ? AND active = 1', assignee)) fail(400, 'Esa persona no existe');

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
      `INSERT INTO tickets (title, description, status, priority, assignee_id, creator_id, category_id, client_id,
         due_date, waiting_on, follow_up_date, recurrence, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      body.title,
      body.description,
      body.status,
      body.priority,
      assignee,
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
    (body.checklist ?? []).forEach((text, i) =>
      run('INSERT INTO checklist_items (ticket_id, text, position) VALUES (?, ?, ?)', newId, text, i),
    );
    logActivity(newId, me.id, 'created', { assignee_id: assignee });
    notify({
      userId: assignee,
      actorId: me.id,
      ticketId: newId,
      type: 'assigned',
      message: `${me.name} te asignó: ${short(body.title)}`,
    });
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
  assignee_id: z.number().int().nullable().optional(),
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
  const t = getTicket(id);
  if (!t) fail(404, 'Ese pendiente no existe o fue eliminado');
  const now = nowIso();

  tx(() => {
    const set = (col: string, value: unknown) =>
      run(`UPDATE tickets SET ${col} = ?, updated_at = ?, last_activity_at = ? WHERE id = ?`, value, now, now, id);

    if (body.title !== undefined && body.title !== t.title) {
      set('title', body.title);
      logActivity(id, me.id, 'title', { from: t.title, to: body.title });
    }
    if (body.description !== undefined && body.description !== t.description) {
      set('description', body.description);
    }
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
        clientId =
          existing?.id ??
          Number(run('INSERT INTO clients (name, created_by) VALUES (?, ?)', body.new_client_name, me.id).lastInsertRowid);
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
    if (body.waiting_on !== undefined) set('waiting_on', body.waiting_on);
    if (body.follow_up_date !== undefined) set('follow_up_date', body.follow_up_date);
    if (waitingChanged) {
      logActivity(id, me.id, 'waiting', {
        waiting_on: body.waiting_on !== undefined ? body.waiting_on : t.waiting_on,
        follow_up_date: body.follow_up_date !== undefined ? body.follow_up_date : t.follow_up_date,
      });
    }
    if (body.assignee_id !== undefined && body.assignee_id !== t.assignee_id) {
      if (body.assignee_id && !get('SELECT id FROM users WHERE id = ? AND active = 1', body.assignee_id)) {
        fail(400, 'Esa persona no existe');
      }
      set('assignee_id', body.assignee_id);
      logActivity(id, me.id, 'assignee', { from_id: t.assignee_id, to_id: body.assignee_id });
      notify({
        userId: body.assignee_id,
        actorId: me.id,
        ticketId: id,
        type: 'assigned',
        message: `${me.name} te asignó: ${short(body.title ?? t.title)}`,
      });
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
      const title = short(body.title ?? t.title);
      if (body.status === 'done') {
        notify({ userId: t.creator_id, actorId: me.id, ticketId: id, type: 'done', message: `${me.name} terminó: ${title}` });
        const fresh = getTicket(id)!;
        spawnRecurring(fresh, me.id);
      }
      const assignee = body.assignee_id !== undefined ? body.assignee_id : t.assignee_id;
      if (assignee !== t.creator_id || body.status !== 'done') {
        notify({
          userId: assignee,
          actorId: me.id,
          ticketId: id,
          type: 'status',
          message: `${me.name} movió a «${STATUS_LABEL[body.status]}»: ${title}`,
        });
      }
    }
    if (body.archived !== undefined && body.archived !== !!t.archived_at) {
      set('archived_at', body.archived ? now : null);
      logActivity(id, me.id, body.archived ? 'archived' : 'unarchived');
    }
  });

  broadcastChange('tickets');
  return c.json(getTicket(id));
});

ticketRoutes.delete('/:id', requireAdmin, (c) => {
  const id = idParam(c);
  const files = all<{ stored_name: string }>('SELECT stored_name FROM attachments WHERE ticket_id = ?', id);
  run('DELETE FROM tickets WHERE id = ?', id);
  for (const f of files) fs.rm(path.join(UPLOADS_DIR, f.stored_name), { force: true }, () => {});
  broadcastChange('tickets');
  return c.json({ ok: true });
});

// ---------- Lista de pasos (checklist) ----------

ticketRoutes.post('/:id/checklist', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const body = await readJson(c, z.object({ text: z.string().trim().min(1, 'Escribe el paso').max(300) }));
  if (!getTicket(id)) fail(404, 'Ese pendiente no existe');
  const pos = get<{ p: number | null }>('SELECT MAX(position) p FROM checklist_items WHERE ticket_id = ?', id)!.p ?? -1;
  const res = run('INSERT INTO checklist_items (ticket_id, text, position) VALUES (?, ?, ?)', id, body.text, pos + 1);
  logActivity(id, me.id, 'checklist_add', { text: body.text });
  broadcastChange('tickets');
  return c.json(get<ChecklistItem>('SELECT * FROM checklist_items WHERE id = ?', res.lastInsertRowid));
});

export const checklistRoutes = new Hono<AppEnv>();

checklistRoutes.patch('/:id', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const body = await readJson(
    c,
    z.object({ text: z.string().trim().min(1).max(300).optional(), done: z.boolean().optional() }),
  );
  const item = get<ChecklistItem>('SELECT * FROM checklist_items WHERE id = ?', id);
  if (!item) fail(404, 'Ese paso ya no existe');
  tx(() => {
    if (body.text !== undefined) run('UPDATE checklist_items SET text = ? WHERE id = ?', body.text, id);
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
  run('DELETE FROM checklist_items WHERE id = ?', id);
  broadcastChange('tickets');
  return c.json({ ok: true });
});

// ---------- Comentarios / avances ----------

ticketRoutes.post('/:id/comments', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const body = await readJson(c, z.object({ body: z.string().trim().min(1, 'Escribe algo').max(5000) }));
  const t = getTicket(id);
  if (!t) fail(404, 'Ese pendiente no existe');
  const commentId = tx(() => {
    const res = run('INSERT INTO comments (ticket_id, user_id, body) VALUES (?, ?, ?)', id, me.id, body.body);
    logActivity(id, me.id, 'comment', { comment_id: Number(res.lastInsertRowid) });
    const preview = body.body.length > 80 ? `${body.body.slice(0, 77)}…` : body.body;
    const recipients = new Set<number>([t.assignee_id, t.creator_id].filter((x): x is number => !!x));
    // Menciones con @usuario
    const users = all<User>('SELECT id, username FROM users WHERE active = 1');
    for (const u of users) {
      const escaped = u.username.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
      if (new RegExp(`@${escaped}(?![\\w-])`, 'i').test(body.body)) recipients.add(u.id);
    }
    for (const uid of recipients) {
      notify({
        userId: uid,
        actorId: me.id,
        ticketId: id,
        type: 'comment',
        message: `${me.name} comentó en «${short(t.title)}»: ${preview}`,
      });
    }
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
  if (comment.user_id !== me.id && me.role !== 'admin') fail(403, 'Solo puedes borrar tus comentarios');
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
    if (!getTicket(id)) fail(404, 'Ese pendiente no existe');
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
  c.header(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
  );
  return c.body(fs.readFileSync(filePath));
});

attachmentRoutes.delete('/:id', (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const a = get<Attachment & { stored_name: string }>('SELECT * FROM attachments WHERE id = ?', id);
  if (!a) fail(404, 'Ese archivo ya no existe');
  if (a.user_id !== me.id && me.role !== 'admin') fail(403, 'Solo quien lo subió puede borrarlo');
  run('DELETE FROM attachments WHERE id = ?', id);
  fs.rm(path.join(UPLOADS_DIR, a.stored_name), { force: true }, () => {});
  broadcastChange('tickets');
  return c.json({ ok: true });
});
