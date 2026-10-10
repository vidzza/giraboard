import { Hono } from 'hono';
import { z } from 'zod';
import { all, get, run } from '../db.ts';
import { type AppEnv, requireAdmin } from '../auth.ts';
import { fail, idParam, optionalText, readJson } from '../http.ts';
import { broadcastChange } from '../events.ts';
import type { Client, User } from '../../shared/types.ts';
import { visibleClause } from '../permissions.ts';

export const clientRoutes = new Hono<AppEnv>();

/** Clientes con conteos de sus pendientes (solo los que esta persona puede ver). */
function clientSelect(user: User) {
  const vis = visibleClause(user);
  return {
    sql: `
  SELECT c.*,
    (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id AND t.status != 'done' AND t.archived_at IS NULL AND ${vis.sql}) AS open_count,
    (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id AND ${vis.sql}) AS total_count,
    (SELECT MAX(t.last_activity_at) FROM tickets t WHERE t.client_id = c.id AND ${vis.sql}) AS last_activity_at
  FROM clients c`,
    params: [...vis.params, ...vis.params, ...vis.params],
  };
}

clientRoutes.get('/', (c) => {
  const sel = clientSelect(c.get('user'));
  const q = (c.req.query('q') ?? '').trim();
  if (q) {
    const like = `%${q}%`;
    return c.json(
      all<Client>(`${sel.sql} WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? ORDER BY c.name LIMIT 50`, ...sel.params, like, like, like),
    );
  }
  return c.json(all<Client>(`${sel.sql} ORDER BY c.name`, ...sel.params));
});

clientRoutes.get('/:id', (c) => {
  const sel = clientSelect(c.get('user'));
  const client = get<Client>(`${sel.sql} WHERE c.id = ?`, ...sel.params, idParam(c));
  if (!client) fail(404, 'Ese cliente no existe');
  return c.json(client);
});

const schema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre del cliente').max(120),
  phone: optionalText(40),
  email: optionalText(120),
  notes: optionalText(5000),
});

clientRoutes.post('/', async (c) => {
  const body = await readJson(c, schema);
  if (get('SELECT id FROM clients WHERE name = ? COLLATE NOCASE', body.name)) {
    fail(409, `Ya existe un cliente llamado «${body.name}». Búscalo en la lista.`);
  }
  const res = run(
    'INSERT INTO clients (name, phone, email, notes, created_by) VALUES (?, ?, ?, ?, ?)',
    body.name,
    body.phone ?? null,
    body.email ?? null,
    body.notes ?? null,
    c.get('user').id,
  );
  broadcastChange('clients');
  const sel = clientSelect(c.get('user'));
  return c.json(get<Client>(`${sel.sql} WHERE c.id = ?`, ...sel.params, res.lastInsertRowid));
});

clientRoutes.patch('/:id', async (c) => {
  const id = idParam(c);
  const body = await readJson(c, schema.partial());
  if (!get('SELECT id FROM clients WHERE id = ?', id)) fail(404, 'Ese cliente no existe');
  if (body.name && get('SELECT id FROM clients WHERE name = ? COLLATE NOCASE AND id != ?', body.name, id)) {
    fail(409, `Ya existe otro cliente llamado «${body.name}»`);
  }
  for (const key of ['name', 'phone', 'email', 'notes'] as const) {
    if (body[key] !== undefined) run(`UPDATE clients SET ${key} = ? WHERE id = ?`, body[key], id);
  }
  broadcastChange('clients');
  const sel = clientSelect(c.get('user'));
  return c.json(get<Client>(`${sel.sql} WHERE c.id = ?`, ...sel.params, id));
});

clientRoutes.delete('/:id', requireAdmin, (c) => {
  run('DELETE FROM clients WHERE id = ?', idParam(c));
  broadcastChange('clients');
  return c.json({ ok: true });
});
