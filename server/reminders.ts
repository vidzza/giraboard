import { all, run, todayStr, getTimezone } from './db.ts';
import { notify, broadcastChange } from './events.ts';
import { purgeExpiredSessions, pruneLoginAttempts } from './auth.ts';
import { backupDatabase } from './backup.ts';
import type { Ticket } from '../shared/types.ts';

function localHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: getTimezone(), hour: 'numeric', hour12: false }).format(new Date()));
}

function short(title: string) {
  return title.length > 70 ? `${title.slice(0, 67)}…` : title;
}

/**
 * Recordatorios diarios: pendientes que vencen hoy, vencidos y seguimientos.
 * Cada aviso se crea una sola vez por día gracias a dedupe_key.
 */
export function runReminders() {
  const hour = localHour();
  if (hour < 7 || hour >= 21) return;
  const today = todayStr();
  const tickets = all<Ticket>(
    `SELECT * FROM tickets WHERE status != 'done' AND archived_at IS NULL AND assignee_id IS NOT NULL
       AND ((due_date IS NOT NULL AND due_date <= ?) OR (status = 'waiting' AND follow_up_date IS NOT NULL AND follow_up_date <= ?))`,
    today,
    today,
  );
  let created = 0;
  for (const t of tickets) {
    if (t.due_date === today) {
      notify({ userId: t.assignee_id, ticketId: t.id, type: 'due_today', message: `Vence hoy: ${short(t.title)}`, dedupeKey: `due:${t.id}:${today}` });
      created++;
    } else if (t.due_date && t.due_date < today) {
      notify({
        userId: t.assignee_id,
        ticketId: t.id,
        type: 'overdue',
        message: `Vencido: ${short(t.title)}`,
        dedupeKey: `overdue:${t.id}:${today}`,
      });
      created++;
    }
    if (t.status === 'waiting' && t.follow_up_date && t.follow_up_date <= today) {
      const who = t.waiting_on ? ` (esperando: ${t.waiting_on})` : '';
      notify({
        userId: t.assignee_id,
        ticketId: t.id,
        type: 'follow_up',
        message: `Toca dar seguimiento: ${short(t.title)}${who}`,
        dedupeKey: `follow:${t.id}:${today}`,
      });
      created++;
    }
  }
  if (created) broadcastChange('notifications');
}

export function startBackgroundJobs() {
  const tick = () => {
    try {
      runReminders();
      purgeExpiredSessions();
      pruneLoginAttempts();
      // Un respaldo por día (se guardan los últimos 30 en data/backups)
      const file = backupDatabase();
      if (file) console.log(`Respaldo diario creado: ${file}`);
      run("DELETE FROM notifications WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')");
    } catch (err) {
      console.error('Error en recordatorios', err);
    }
  };
  setTimeout(tick, 5_000).unref();
  setInterval(tick, 10 * 60_000).unref();
}
