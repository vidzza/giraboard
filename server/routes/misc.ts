import { Hono } from 'hono';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { all, db, get, run, getSetting, setSetting, todayStr, nowIso, getTimezone, isValidTimezone, setTimezone } from '../db.ts';
import { type AppEnv, requireAdmin } from '../auth.ts';
import { fail, idParam, readJson } from '../http.ts';
import { broadcastChange } from '../events.ts';
import { TICKET_SELECT } from './tickets.ts';
import {
  STALE_DAYS,
  PRIORITY_LABEL,
  RECURRENCE_LABEL,
  STATUS_LABEL,
  type Activity,
  type Category,
  type Client,
  type Notification,
  type Stats,
  type Ticket,
} from '../../shared/types.ts';

// ---------- Categorías ----------

export const categoryRoutes = new Hono<AppEnv>();

categoryRoutes.get('/', (c) => c.json(all<Category>('SELECT * FROM categories ORDER BY position, id')));

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre').max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  position: z.number().int().optional(),
  archived: z.boolean().optional(),
});

categoryRoutes.post('/', requireAdmin, async (c) => {
  const body = await readJson(c, categorySchema);
  const pos = get<{ p: number | null }>('SELECT MAX(position) p FROM categories')!.p ?? -1;
  const res = run('INSERT INTO categories (name, color, position) VALUES (?, ?, ?)', body.name, body.color, pos + 1);
  broadcastChange('categories');
  return c.json(get<Category>('SELECT * FROM categories WHERE id = ?', res.lastInsertRowid));
});

categoryRoutes.patch('/:id', requireAdmin, async (c) => {
  const id = idParam(c);
  const body = await readJson(c, categorySchema.partial());
  if (!get('SELECT id FROM categories WHERE id = ?', id)) fail(404, 'Esa categoría no existe');
  if (body.name !== undefined) run('UPDATE categories SET name = ? WHERE id = ?', body.name, id);
  if (body.color !== undefined) run('UPDATE categories SET color = ? WHERE id = ?', body.color, id);
  if (body.position !== undefined) run('UPDATE categories SET position = ? WHERE id = ?', body.position, id);
  if (body.archived !== undefined) run('UPDATE categories SET archived = ? WHERE id = ?', body.archived ? 1 : 0, id);
  broadcastChange('categories');
  return c.json(get<Category>('SELECT * FROM categories WHERE id = ?', id));
});

// ---------- Ajustes generales ----------

export const settingsRoutes = new Hono<AppEnv>();

const currentSettings = () => ({ business_name: getSetting('business_name', 'Giraboard'), timezone: getTimezone() });

settingsRoutes.get('/', (c) => c.json(currentSettings()));

settingsRoutes.patch('/', requireAdmin, async (c) => {
  const body = await readJson(
    c,
    z.object({
      business_name: z.string().trim().min(1, 'Escribe el nombre del negocio').max(80).optional(),
      timezone: z.string().max(64).refine(isValidTimezone, 'Zona horaria inválida').optional(),
    }),
  );
  if (body.business_name !== undefined) setSetting('business_name', body.business_name);
  if (body.timezone !== undefined) setTimezone(body.timezone);
  broadcastChange('settings');
  return c.json(currentSettings());
});

// ---------- Avisos ----------

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get('/', (c) => {
  const me = c.get('user');
  const items = all<Notification>(
    'SELECT id, user_id, ticket_id, actor_id, type, message, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 60',
    me.id,
  );
  const unread = get<{ n: number }>('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', me.id)!.n;
  return c.json({ items, unread });
});

notificationRoutes.post('/read', async (c) => {
  const me = c.get('user');
  const body = await readJson(
    c,
    z.object({ ids: z.array(z.number().int()).max(200).optional(), ticket_id: z.number().int().optional() }),
  );
  const now = nowIso();
  if (body.ticket_id) {
    // Al abrir un pendiente, sus avisos se dan por leídos.
    run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND ticket_id = ? AND read_at IS NULL', now, me.id, body.ticket_id);
  } else if (body.ids?.length) {
    for (const id of body.ids) {
      run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now, id, me.id);
    }
  } else {
    run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now, me.id);
  }
  return c.json({ ok: true });
});

// ---------- Actividad del equipo ----------

export const activityRoutes = new Hono<AppEnv>();

activityRoutes.get('/', (c) => {
  const limit = Math.min(200, Number(c.req.query('limit') ?? 50) || 50);
  const before = Number(c.req.query('before') ?? 0);
  const rows = all<Activity & { data: string }>(
    `SELECT a.*, t.title AS ticket_title FROM activity a LEFT JOIN tickets t ON t.id = a.ticket_id
     WHERE (? = 0 OR a.id < ?) ORDER BY a.id DESC LIMIT ?`,
    before,
    before,
    limit,
  );
  return c.json(rows.map((r) => ({ ...r, data: JSON.parse(r.data) })));
});

// ---------- Búsqueda ----------

export const searchRoutes = new Hono<AppEnv>();

searchRoutes.get('/', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ tickets: [], clients: [] });
  const like = `%${q}%`;
  const num = q.replace(/^#/, '');
  const tickets = all<Ticket>(
    `${TICKET_SELECT} WHERE CAST(t.id AS TEXT) = ? OR t.title LIKE ? OR t.description LIKE ? OR cl.name LIKE ? OR t.waiting_on LIKE ?
     ORDER BY CAST(t.id AS TEXT) = ? DESC, (t.status = 'done' OR t.archived_at IS NOT NULL), t.last_activity_at DESC LIMIT 25`,
    num,
    like,
    like,
    like,
    like,
    num,
  );
  const clients = all<Client>('SELECT * FROM clients WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 8', like, like);
  return c.json({ tickets, clients });
});

// ---------- Resumen / estadísticas ----------

export const statsRoutes = new Hono<AppEnv>();

function localDate(iso: string) {
  return todayStr(new Date(iso));
}

function mondayOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

statsRoutes.get('/', (c) => {
  const today = todayStr();
  const weekStart = mondayOf(today);
  const firstWeek = shiftDays(weekStart, -7 * 7);
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();

  const open = all<Ticket>(`${TICKET_SELECT} WHERE t.status != 'done' AND t.archived_at IS NULL`);
  const recent = all<{ assignee_id: number | null; created_at: string; completed_at: string | null; status: string }>(
    `SELECT assignee_id, created_at, completed_at, status FROM tickets
     WHERE created_at >= ? OR completed_at >= ?`,
    `${shiftDays(firstWeek, -1)}T00:00:00Z`,
    `${shiftDays(firstWeek, -1)}T00:00:00Z`,
  );

  const perUser = new Map<number, Stats['per_user'][number]>();
  const userRow = (id: number) => {
    if (!perUser.has(id)) perUser.set(id, { user_id: id, open: 0, overdue: 0, waiting: 0, done_week: 0 });
    return perUser.get(id)!;
  };
  for (const u of all<{ id: number }>('SELECT id FROM users WHERE active = 1 ORDER BY name')) userRow(u.id);

  const perCategory = new Map<number | null, number>();
  let overdue = 0;
  let dueToday = 0;
  let waiting = 0;
  let followUps = 0;
  for (const t of open) {
    const isOverdue = !!t.due_date && t.due_date < today;
    if (isOverdue) overdue++;
    if (t.due_date === today) dueToday++;
    if (t.status === 'waiting') {
      waiting++;
      if (t.follow_up_date && t.follow_up_date <= today) followUps++;
    }
    perCategory.set(t.category_id, (perCategory.get(t.category_id) ?? 0) + 1);
    if (t.assignee_id) {
      const row = userRow(t.assignee_id);
      row.open++;
      if (isOverdue) row.overdue++;
      if (t.status === 'waiting') row.waiting++;
    }
  }

  const weeks = new Map<string, { week_start: string; done: number; created: number }>();
  for (let i = 0; i < 8; i++) {
    const ws = shiftDays(firstWeek, i * 7);
    weeks.set(ws, { week_start: ws, done: 0, created: 0 });
  }
  let doneWeek = 0;
  let createdWeek = 0;
  for (const r of recent) {
    const cw = mondayOf(localDate(r.created_at));
    if (weeks.has(cw)) weeks.get(cw)!.created++;
    if (cw === weekStart) createdWeek++;
    if (r.status === 'done' && r.completed_at) {
      const dw = mondayOf(localDate(r.completed_at));
      if (weeks.has(dw)) weeks.get(dw)!.done++;
      if (dw === weekStart) {
        doneWeek++;
        if (r.assignee_id) userRow(r.assignee_id).done_week++;
      }
    }
  }

  const staleTickets = open
    .filter((t) => t.last_activity_at < staleCutoff)
    .sort((a, b) => a.last_activity_at.localeCompare(b.last_activity_at));
  const waitingTickets = open
    .filter((t) => t.status === 'waiting')
    .sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at));

  const stats: Stats = {
    today,
    open: open.length,
    overdue,
    due_today: dueToday,
    waiting,
    follow_ups: followUps,
    done_week: doneWeek,
    created_week: createdWeek,
    stale: staleTickets.length,
    per_user: [...perUser.values()],
    per_category: [...perCategory.entries()].map(([category_id, n]) => ({ category_id, open: n })),
    weekly: [...weeks.values()],
    stale_tickets: staleTickets.slice(0, 12),
    waiting_tickets: waitingTickets.slice(0, 12),
  };
  return c.json(stats);
});

// ---------- Exportar y respaldar (solo admin) ----------

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAdmin);

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value);
  // Evita que Excel interprete fórmulas en celdas que empiezan con = + - @
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function localDateTime(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { timeZone: getTimezone(), dateStyle: 'short', timeStyle: 'short' });
}

// Todos los pendientes en un archivo que abre Excel.
adminRoutes.get('/export.csv', (c) => {
  const rows = all<Ticket & { assignee_name: string | null; creator_name: string | null; category_name: string | null }>(
    `SELECT t.*, cl.name AS client_name, cl.phone AS client_phone, a.name AS assignee_name, cr.name AS creator_name, cat.name AS category_name,
       0 AS checklist_total, 0 AS checklist_done, 0 AS comment_count, 0 AS attachment_count
     FROM tickets t
     LEFT JOIN clients cl ON cl.id = t.client_id
     LEFT JOIN users a ON a.id = t.assignee_id
     LEFT JOIN users cr ON cr.id = t.creator_id
     LEFT JOIN categories cat ON cat.id = t.category_id
     ORDER BY t.id`,
  );
  const header = [
    'Número', 'Pendiente', 'Estado', 'Prioridad', 'Responsable', 'Tipo', 'Cliente', 'Teléfono', 'Fecha límite',
    'Esperando a', 'Revisar el', 'Se repite', 'Creado por', 'Creado', 'Terminado', 'Archivado', 'Notas',
  ];
  const lines = rows.map((t) =>
    [
      t.id, t.title, t.archived_at ? 'Archivado' : STATUS_LABEL[t.status], PRIORITY_LABEL[t.priority], t.assignee_name,
      t.category_name, t.client_name, t.client_phone, t.due_date, t.waiting_on, t.follow_up_date, RECURRENCE_LABEL[t.recurrence],
      t.creator_name, localDateTime(t.created_at), localDateTime(t.completed_at), localDateTime(t.archived_at), t.description,
    ]
      .map(csvCell)
      .join(','),
  );
  const csv = '\uFEFF' + [header.map(csvCell).join(','), ...lines].join('\r\n');
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="pendientes-${todayStr()}.csv"`);
  return c.body(csv);
});

// Copia completa de la base de datos para guardarla en otro lado.
adminRoutes.get('/backup', (c) => {
  const tmp = path.join(os.tmpdir(), `giraboard-${process.pid}-${Date.now()}.db`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const data = fs.readFileSync(tmp);
    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="giraboard-respaldo-${todayStr()}.db"`);
    return c.body(data);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});
