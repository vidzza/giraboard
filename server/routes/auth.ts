import crypto from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { get, run, tx, getSetting, setSetting, deleteSetting, isValidTimezone, setTimezone } from '../db.ts';
import {
  type AppEnv,
  MIN_PASSWORD,
  USER_COLS,
  burnPasswordCheck,
  clearFailedLogins,
  clientIp,
  createSession,
  destroySession,
  destroyUserSessions,
  hashPassword,
  loginBlocked,
  registerFailedLogin,
  requireAuth,
  userFromRequest,
  verifyPassword,
} from '../auth.ts';
import { fail, readJson } from '../http.ts';
import { seedDefaults } from '../defaults.ts';
import { logActivity } from '../events.ts';
import { CATEGORY_TEMPLATES, type CategoryTemplate, type User } from '../../shared/types.ts';

export const authRoutes = new Hono<AppEnv>();

export function hasUsers() {
  return !!get('SELECT id FROM users LIMIT 1');
}

/**
 * En producción, crear la primera cuenta exige un código que solo aparece en la
 * consola del servidor. Así nadie de internet puede adueñarse de una instalación nueva.
 */
export function setupCodeRequired() {
  return process.env.NODE_ENV === 'production' && !hasUsers();
}

export function ensureSetupCode() {
  let code = getSetting('setup_code');
  if (!code) {
    code = `${crypto.randomInt(1000, 10000)}-${crypto.randomInt(1000, 10000)}`;
    setSetting('setup_code', code);
  }
  return code;
}

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`)
  .max(200, 'La contraseña es demasiado larga');

export const usernameSchema = z
  .string()
  .trim()
  .min(2, 'El usuario debe tener al menos 2 letras')
  .max(30, 'El usuario es demasiado largo')
  .regex(/^[a-zA-Z0-9._-]+$/, 'El usuario solo puede tener letras sin acentos, números, punto o guion');

authRoutes.get('/status', (c) => {
  return c.json({
    needs_setup: !hasUsers(),
    setup_code_required: setupCodeRequired(),
    business_name: getSetting('business_name', 'Giraboard'),
  });
});

const setupSchema = z.object({
  business_name: z.string().trim().min(1, 'Escribe el nombre del negocio').max(80),
  name: z.string().trim().min(1, 'Escribe tu nombre').max(60),
  username: usernameSchema,
  password: passwordSchema,
  setup_code: z.string().trim().optional(),
  template: z.enum(Object.keys(CATEGORY_TEMPLATES) as [CategoryTemplate, ...CategoryTemplate[]]).default('general'),
  timezone: z.string().max(64).optional(),
});

// Primera vez: crea la cuenta de admin y los tipos de pendiente iniciales.
authRoutes.post('/setup', async (c) => {
  const body = await readJson(c, setupSchema);
  const userId = tx(() => {
    if (hasUsers()) fail(409, 'El sistema ya está configurado. Recarga la página.');
    if (setupCodeRequired() && body.setup_code !== getSetting('setup_code')) {
      fail(400, 'El código de configuración no es correcto. Búscalo en la consola del servidor.');
    }
    setSetting('business_name', body.business_name);
    if (body.timezone && isValidTimezone(body.timezone)) setTimezone(body.timezone);
    deleteSetting('setup_code');
    const res = run(
      `INSERT INTO users (name, username, password_hash, role, color) VALUES (?, ?, ?, 'admin', '#1E5B4F')`,
      body.name,
      body.username.toLowerCase(),
      hashPassword(body.password),
    );
    seedDefaults(body.template);
    return Number(res.lastInsertRowid);
  });
  console.log(`Configuración inicial completada. Admin: ${body.username.toLowerCase()}`);
  createSession(c, userId);
  return c.json({ ok: true });
});

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Escribe tu usuario').max(60),
  password: z.string().min(1, 'Escribe tu contraseña').max(200),
});

authRoutes.post('/login', async (c) => {
  const body = await readJson(c, loginSchema);
  const username = body.username.toLowerCase();
  const ip = clientIp(c);
  if (loginBlocked(ip, username)) {
    fail(429, 'Demasiados intentos fallidos. Espera 15 minutos o pide a un admin que te cambie la contraseña.');
  }
  const row = get<User & { password_hash: string }>('SELECT id, password_hash FROM users WHERE username = ? AND active = 1', username);
  if (!row) burnPasswordCheck(body.password);
  if (!row || !verifyPassword(body.password, row.password_hash)) {
    registerFailedLogin(ip, username);
    console.warn(`Acceso fallido para «${username}» desde ${ip}`);
    fail(400, 'Usuario o contraseña incorrectos');
  }
  clearFailedLogins(username);
  createSession(c, row.id);
  console.log(`Inicio de sesión: ${username} desde ${ip}`);
  return c.json({ ok: true });
});

authRoutes.post('/logout', (c) => {
  destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', (c) => {
  const found = userFromRequest(c);
  return c.json({ user: found?.user ?? null });
});

// Crear contraseña propia cuando un admin dio una temporal.
authRoutes.post('/set-password', requireAuth, async (c) => {
  const me = c.get('user');
  const body = await readJson(c, z.object({ password: passwordSchema }));
  if (!me.must_change_password) fail(400, 'Para cambiar tu contraseña ve a «Mi perfil».');
  const current = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', me.id)!;
  if (verifyPassword(body.password, current.password_hash)) fail(400, 'Elige una contraseña distinta a la temporal.');
  run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', hashPassword(body.password), me.id);
  destroyUserSessions(me.id, c.get('sessionHash'));
  logActivity(null, me.id, 'password_set', { user_id: me.id });
  return c.json({ user: get<User>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, me.id) });
});

// Cerrar sesión en los demás dispositivos (por si dejó abierta otra computadora).
authRoutes.post('/logout-others', requireAuth, (c) => {
  destroyUserSessions(c.get('user').id, c.get('sessionHash'));
  return c.json({ ok: true });
});
