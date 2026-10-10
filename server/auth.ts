import crypto from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getConnInfo } from '@hono/node-server/conninfo';
import { get, run } from './db.ts';
import type { User } from '../shared/types.ts';

export const SESSION_COOKIE = 'gb_session';
const SESSION_DAYS = 30;
/** Si a la sesión le quedan menos días que esto, se renueva sola (así no se cierra mientras se use). */
const RENEW_BELOW_DAYS = 20;
export const MIN_PASSWORD = 8;

/** Columnas públicas de un usuario (nunca incluir password_hash). */
export const USER_COLS = 'id, name, username, role, color, active, must_change_password, last_login_at, created_at';
const USER_COLS_U = USER_COLS.split(', ')
  .map((c) => `u.${c}`)
  .join(', ');

export type AppEnv = { Variables: { user: User; sessionHash: string } };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// Se usa cuando el usuario no existe, para que la respuesta tarde lo mismo y no delate qué usuarios existen.
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));
export function burnPasswordCheck(password: string) {
  verifyPassword(password, DUMMY_HASH);
}

/** Contraseña temporal fácil de dictar por teléfono, ej. "luna-4821". */
export function temporaryPassword() {
  const words = ['luna', 'sol', 'mar', 'rio', 'flor', 'nube', 'roca', 'lago', 'pino', 'faro', 'brisa', 'cielo'];
  return `${words[crypto.randomInt(words.length)]}-${crypto.randomInt(1000, 10000)}`;
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isHttps(c: Context) {
  const proto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  return proto === 'https';
}

function writeCookie(c: Context, token: string, expires: Date) {
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: isHttps(c), path: '/', expires });
}

export function createSession(c: Context, userId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  run(
    'INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)',
    sha256(token),
    userId,
    expires.toISOString(),
    now.toISOString(),
  );
  run('UPDATE users SET last_login_at = ? WHERE id = ?', now.toISOString(), userId);
  writeCookie(c, token, expires);
}

export function destroySession(c: Context) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Cierra todas las sesiones de una persona, salvo (opcionalmente) la actual. */
export function destroyUserSessions(userId: number, exceptHash?: string) {
  run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, exceptHash ?? '');
}

/** Busca al usuario de la cookie. Renueva la sesión si está por vencer. */
export function userFromRequest(c: Context): { user: User; sessionHash: string } | undefined {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return undefined;
  const hash = sha256(token);
  const now = new Date();
  const row = get<User & { expires_at: string; last_seen_at: string | null }>(
    `SELECT ${USER_COLS_U}, s.expires_at, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    hash,
    now.toISOString(),
  );
  if (!row) return undefined;
  const { expires_at, last_seen_at, ...user } = row;
  const msLeft = new Date(expires_at).getTime() - now.getTime();
  if (msLeft < RENEW_BELOW_DAYS * 86_400_000) {
    const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
    run('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?', expires.toISOString(), now.toISOString(), hash);
    writeCookie(c, token, expires);
  } else if (!last_seen_at || now.getTime() - new Date(last_seen_at).getTime() > 10 * 60_000) {
    run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', now.toISOString(), hash);
  }
  return { user, sessionHash: hash };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const found = userFromRequest(c);
  if (!found) return c.json({ error: 'Tu sesión terminó. Vuelve a entrar.' }, 401);
  c.set('user', found.user);
  c.set('sessionHash', found.sessionHash);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('user')?.role !== 'admin') {
    return c.json({ error: 'Solo un admin puede hacer esto.' }, 403);
  }
  await next();
};

/** Bloquea peticiones que cambian datos si vienen de otro sitio (CSRF). */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin) {
      const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        /* origen inválido */
      }
      if (originHost !== host) return c.json({ error: 'Origen no permitido' }, 403);
    }
  }
  await next();
};

/** IP del cliente. Solo se confía en X-Forwarded-For si la app está detrás de Caddy (TRUST_PROXY=1). */
export function clientIp(c: Context) {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address ?? 'desconocida';
  } catch {
    return 'desconocida';
  }
}

// ---------- Límite de intentos de acceso ----------
// Por usuario: 8 intentos fallidos cada 15 min. Por IP: 30 cada 15 min.
const WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, { count: number; until: number }>();

function hit(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) attempts.set(key, { count: 1, until: now + WINDOW_MS });
  else a.count++;
}

function blocked(key: string, max: number) {
  const a = attempts.get(key);
  return !!a && a.until > Date.now() && a.count >= max;
}

export function loginBlocked(ip: string, username: string) {
  return blocked(`u:${username}`, 8) || blocked(`ip:${ip}`, 30);
}

export function registerFailedLogin(ip: string, username: string) {
  hit(`u:${username}`);
  hit(`ip:${ip}`);
}

export function clearFailedLogins(username: string) {
  attempts.delete(`u:${username}`);
}

export function pruneLoginAttempts() {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
}

export function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString());
}
