import { Hono } from 'hono';
import { z } from 'zod';
import { all, get, run, tx, nowIso } from '../db.ts';
import { type AppEnv, USER_COLS, destroyUserSessions, hashPassword, requireAdmin, verifyPassword } from '../auth.ts';
import { fail, idParam, readJson } from '../http.ts';
import { broadcastChange, logActivity, notify } from '../events.ts';
import { passwordSchema, usernameSchema } from './auth.ts';
import type { User } from '../../shared/types.ts';

export const userRoutes = new Hono<AppEnv>();

const getUser = (id: number | bigint) => get<User>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id);

userRoutes.get('/', (c) => {
  return c.json(all<User>(`SELECT ${USER_COLS} FROM users ORDER BY active DESC, name`));
});

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido');

const createSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre').max(60),
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(['admin', 'member']).default('member'),
  color,
});

// Un admin da de alta a alguien con una contraseña temporal; al entrar, esa persona crea la suya.
userRoutes.post('/', requireAdmin, async (c) => {
  const me = c.get('user');
  const body = await readJson(c, createSchema);
  if (get('SELECT id FROM users WHERE username = ?', body.username.toLowerCase())) {
    fail(409, 'Ese usuario ya existe, elige otro');
  }
  const res = run(
    'INSERT INTO users (name, username, password_hash, role, color, must_change_password) VALUES (?, ?, ?, ?, ?, 1)',
    body.name,
    body.username.toLowerCase(),
    hashPassword(body.password),
    body.role,
    body.color,
  );
  const id = Number(res.lastInsertRowid);
  logActivity(null, me.id, 'user_created', { user_id: id, role: body.role });
  broadcastChange('users');
  return c.json(getUser(id));
});

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre').max(60).optional(),
  username: usernameSchema.optional(),
  color: color.optional(),
  role: z.enum(['admin', 'member']).optional(),
  active: z.boolean().optional(),
  password: passwordSchema.optional(),
  current_password: z.string().max(200).optional(),
  /** Al quitarle el acceso a alguien: a quién pasarle sus pendientes abiertos. */
  reassign_to: z.number().int().nullable().optional(),
});

userRoutes.patch('/:id', async (c) => {
  const id = idParam(c);
  const me = c.get('user');
  const isAdmin = me.role === 'admin';
  const isSelf = me.id === id;
  if (!isAdmin && !isSelf) fail(403, 'Solo puedes cambiar tu propio perfil');
  const body = await readJson(c, updateSchema);
  const target = get<User & { password_hash: string }>('SELECT * FROM users WHERE id = ?', id);
  if (!target) fail(404, 'Usuario no encontrado');

  if (!isAdmin && (body.role !== undefined || body.active !== undefined || body.username !== undefined)) {
    fail(403, 'Solo un admin puede cambiar eso');
  }
  // Cambiar la propia contraseña requiere la actual (un admin puede restablecer la de otros).
  if (body.password && isSelf && !verifyPassword(body.current_password ?? '', target.password_hash)) {
    fail(400, 'La contraseña actual no es correcta');
  }
  if (body.active === false && isSelf) fail(400, 'No puedes quitarte tu propio acceso');
  const losingAdmin = (body.role === 'member' && target.role === 'admin') || (body.active === false && target.role === 'admin');
  if (losingAdmin) {
    const admins = get<{ n: number }>("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1")!.n;
    if (admins <= 1) fail(400, 'Debe quedar al menos un admin con acceso');
  }
  if (body.username && get('SELECT id FROM users WHERE username = ? AND id != ?', body.username.toLowerCase(), id)) {
    fail(409, 'Ese usuario ya existe, elige otro');
  }
  if (body.reassign_to && !get('SELECT id FROM users WHERE id = ? AND active = 1 AND id != ?', body.reassign_to, id)) {
    fail(400, 'Elige a alguien con acceso para recibir los pendientes');
  }

  let reassigned = 0;
  tx(() => {
    if (body.name !== undefined) run('UPDATE users SET name = ? WHERE id = ?', body.name, id);
    if (body.username !== undefined) run('UPDATE users SET username = ? WHERE id = ?', body.username.toLowerCase(), id);
    if (body.color !== undefined) run('UPDATE users SET color = ? WHERE id = ?', body.color, id);
    if (body.role !== undefined && body.role !== target.role) {
      run('UPDATE users SET role = ? WHERE id = ?', body.role, id);
      logActivity(null, me.id, 'role_changed', { user_id: id, role: body.role });
    }
    if (body.password) {
      // Si un admin la restablece, es temporal: la persona deberá crear la suya al entrar.
      run(
        'UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?',
        hashPassword(body.password),
        isSelf ? 0 : 1,
        id,
      );
      destroyUserSessions(id, isSelf ? c.get('sessionHash') : undefined);
      if (!isSelf) logActivity(null, me.id, 'password_reset', { user_id: id });
    }
    if (body.active !== undefined && body.active !== !!target.active) {
      run('UPDATE users SET active = ? WHERE id = ?', body.active ? 1 : 0, id);
      if (!body.active) {
        destroyUserSessions(id);
        if (body.reassign_to !== undefined) {
          const open = all<{ id: number; title: string }>(
            "SELECT id, title FROM tickets WHERE assignee_id = ? AND status != 'done' AND archived_at IS NULL",
            id,
          );
          const now = nowIso();
          for (const t of open) {
            run('UPDATE tickets SET assignee_id = ?, updated_at = ? WHERE id = ?', body.reassign_to, now, t.id);
            logActivity(t.id, me.id, 'assignee', { from_id: id, to_id: body.reassign_to });
          }
          reassigned = open.length;
          if (body.reassign_to && open.length) {
            notify({
              userId: body.reassign_to,
              actorId: me.id,
              type: 'assigned',
              message: `${me.name} te pasó ${open.length} pendiente${open.length === 1 ? '' : 's'} de ${target.name}`,
            });
          }
        }
      }
      logActivity(null, me.id, body.active ? 'user_reactivated' : 'user_deactivated', { user_id: id, reassigned });
    }
  });
  broadcastChange('users');
  if (reassigned) broadcastChange('tickets');
  return c.json(getUser(id));
});
