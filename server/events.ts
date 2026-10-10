import type { SSEStreamingApi } from 'hono/streaming';
import { run, get } from './db.ts';
import type { ActivityType } from '../shared/types.ts';

// Conexiones abiertas en tiempo real (una por pestaña del navegador).
const streams = new Map<SSEStreamingApi, number>();

export function addStream(stream: SSEStreamingApi, userId: number) {
  streams.set(stream, userId);
}

export function removeStream(stream: SSEStreamingApi) {
  streams.delete(stream);
}

export function closeAllStreams() {
  for (const stream of streams.keys()) stream.abort();
  streams.clear();
}

function send(stream: SSEStreamingApi, event: string, data: unknown) {
  stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => streams.delete(stream));
}

/** Avisa a todos los navegadores que algo cambió para que recarguen. */
export function broadcastChange(kind: string) {
  for (const stream of streams.keys()) send(stream, 'changed', { kind });
}

export function sendToUser(userId: number, event: string, data: unknown) {
  for (const [stream, uid] of streams) if (uid === userId) send(stream, event, data);
}

export function logActivity(
  ticketId: number | null,
  userId: number | null,
  type: ActivityType,
  data: Record<string, unknown> = {},
) {
  run(
    'INSERT INTO activity (ticket_id, user_id, type, data) VALUES (?, ?, ?, ?)',
    ticketId,
    userId,
    type,
    JSON.stringify(data),
  );
  if (ticketId) {
    run('UPDATE tickets SET last_activity_at = ? WHERE id = ?', new Date().toISOString(), ticketId);
  }
}

/**
 * Crea un aviso para una persona. Si se da dedupeKey, el aviso solo se crea una vez
 * (sirve para recordatorios diarios).
 */
export function notify(opts: {
  userId: number | null | undefined;
  actorId?: number | null;
  ticketId?: number | null;
  type: string;
  message: string;
  dedupeKey?: string;
}) {
  if (!opts.userId) return;
  if (opts.actorId && opts.actorId === opts.userId) return;
  const active = get<{ active: number }>('SELECT active FROM users WHERE id = ?', opts.userId);
  if (!active?.active) return;
  const res = run(
    `INSERT INTO notifications (user_id, ticket_id, actor_id, type, message, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING`,
    opts.userId,
    opts.ticketId ?? null,
    opts.actorId ?? null,
    opts.type,
    opts.message,
    opts.dedupeKey ?? null,
  );
  if (res.changes > 0) {
    sendToUser(opts.userId, 'notification', {
      message: opts.message,
      ticket_id: opts.ticketId ?? null,
    });
  }
}
