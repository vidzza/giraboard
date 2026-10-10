import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import fs from 'node:fs';
import path from 'node:path';
import { db, ROOT_DIR, DATA_DIR } from './db.ts';
import { type AppEnv, requireAuth, sameOrigin } from './auth.ts';
import { addStream, closeAllStreams, removeStream } from './events.ts';
import { authRoutes, ensureSetupCode, hasUsers } from './routes/auth.ts';
import { userRoutes } from './routes/users.ts';
import { attachmentRoutes, checklistRoutes, commentRoutes, ticketRoutes } from './routes/tickets.ts';
import { clientRoutes } from './routes/clients.ts';
import {
  activityRoutes,
  adminRoutes,
  categoryRoutes,
  notificationRoutes,
  searchRoutes,
  settingsRoutes,
  statsRoutes,
} from './routes/misc.ts';
import { startBackgroundJobs } from './reminders.ts';

const isProd = process.env.NODE_ENV === 'production';
// En desarrollo la API corre aparte (Vite la usa vía proxy); en producción un solo puerto sirve todo.
const PORT = Number(isProd ? (process.env.PORT ?? 3000) : (process.env.API_PORT ?? 3001));
// Por seguridad solo escucha en la propia máquina; Caddy recibe las visitas de internet.
// Para usarlo directo en la red de la oficina: HOST=0.0.0.0
const HOST = process.env.HOST ?? '127.0.0.1';
const DIST_DIR = path.join(ROOT_DIR, 'dist');

if (isProd && !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error('Falta compilar la interfaz. Ejecuta primero: npm run build');
  process.exit(1);
}

const app = new Hono<AppEnv>();

app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin', referrerPolicy: 'same-origin' }));

// Política de contenido para la página de la app (los archivos adjuntos llevan la suya).
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');
// Herramienta interna: que no aparezca en Google.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Robots-Tag', 'noindex, nofollow');
});
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));

app.use('/api/*', sameOrigin);
// Límite de tamaño para todo salvo la subida de archivos (que tiene el suyo).
app.use('/api/*', async (c, next) => {
  if (c.req.path.endsWith('/attachments')) return next();
  return bodyLimit({
    maxSize: 1024 * 1024,
    onError: (ctx) => ctx.json({ error: 'Los datos enviados son demasiado grandes' }, 413),
  })(c, next);
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Algo salió mal. Intenta de nuevo.' }, 500);
});

const api = new Hono<AppEnv>();
api.get('/health', (c) => c.json({ ok: true }));
api.route('/auth', authRoutes);

api.use('*', requireAuth);
api.route('/users', userRoutes);
api.route('/tickets', ticketRoutes);
api.route('/checklist', checklistRoutes);
api.route('/comments', commentRoutes);
api.route('/attachments', attachmentRoutes);
api.route('/clients', clientRoutes);
api.route('/categories', categoryRoutes);
api.route('/settings', settingsRoutes);
api.route('/notifications', notificationRoutes);
api.route('/activity', activityRoutes);
api.route('/search', searchRoutes);
api.route('/stats', statsRoutes);
api.route('/admin', adminRoutes);

// Tiempo real: el navegador escucha aquí y recarga cuando alguien cambia algo.
api.get('/events', (c) => {
  const user = c.get('user');
  c.header('X-Accel-Buffering', 'no');
  return streamSSE(c, async (stream) => {
    addStream(stream, user.id);
    await stream.writeSSE({ event: 'ready', data: '{}' });
    let open = true;
    stream.onAbort(() => {
      open = false;
      removeStream(stream);
    });
    while (open) {
      await stream.sleep(25_000);
      if (open) await stream.writeSSE({ event: 'ping', data: '{}' });
    }
  });
});

api.all('*', (c) => c.json({ error: 'No encontrado' }, 404));
app.route('/api', api);

// En producción el mismo servidor entrega la interfaz ya compilada.
if (isProd) {
  app.use('/assets/*', compress());
  app.use(
    '/assets/*',
    serveStatic({
      root: DIST_DIR,
      onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable'),
    }),
  );
  app.get('/assets/*', (c) => c.text('No encontrado', 404));
  const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
  const sendIndex = (c: Context) => {
    c.header('Cache-Control', 'no-cache');
    c.header('Content-Security-Policy', APP_CSP);
    return c.html(indexHtml);
  };
  app.get('/', sendIndex);
  app.get('/index.html', sendIndex);
  // Íconos, manifiesto, etc.
  app.use('*', serveStatic({ root: DIST_DIR, onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=86400') }));
  // Cualquier otra ruta es una página de la app (React decide qué mostrar).
  app.get('*', sendIndex);
}

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  const where = HOST === '127.0.0.1' ? 'localhost' : HOST;
  console.log(`Giraboard escuchando en http://${where}:${info.port}${isProd ? '' : ' (API de desarrollo)'}`);
  console.log(`Datos en ${DATA_DIR}`);
  if (!hasUsers()) {
    if (isProd) {
      console.log('');
      console.log('  Primera vez: abre la página y crea la cuenta de admin.');
      console.log(`  Código de configuración: ${ensureSetupCode()}`);
      console.log('');
    } else {
      console.log('Base vacía: abre la app para crear la cuenta de admin (o usa npm run seed).');
    }
  }
});

startBackgroundJobs();

// Apagado ordenado (systemd manda SIGTERM al reiniciar o detener el servicio).
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`Recibí ${signal}, cerrando…`);
  closeAllStreams();
  server.close();
  try {
    db.close();
  } catch {
    /* ya cerrada */
  }
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
