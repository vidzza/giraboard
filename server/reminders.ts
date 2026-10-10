import { run, todayStr, getTimezone } from './db.ts';
import { selectTickets } from './routes/tickets.ts';
import { leadIds } from './permissions.ts';
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
 * Les llegan a sus responsables; si no tiene responsable, a Admin y Coordinación.
 * Cada aviso se crea una sola vez por día gracias a dedupe_key.
 */
export function runReminders() {
  const hour = localHour();
  if (hour < 7 || hour >= 21) return;
  const today = todayStr();
  const tickets = selectTickets(
    `t.status != 'done' AND t.archived_at IS NULL
       AND ((t.due_date IS NOT NULL AND t.due_date <= ?) OR (t.status = 'waiting' AND t.follow_up_date IS NOT NULL AND t.follow_up_date <= ?))`,
    [today, today],
  );
  const leads = leadIds();
  let created = 0;
  const remind = (t: Ticket, type: string, message: string) => {
    const unassigned = t.assignee_ids.length === 0;
    const to = unassigned ? leads : t.assignee_ids;
    for (const userId of to) {
      notify({
        userId,
        ticketId: t.id,
        type,
        message: unassigned ? `${message} (sin responsable)` : message,
        dedupeKey: `${type}:${t.id}:${userId}:${today}`,
      });
      created++;
    }
  };
  for (const t of tickets) {
    if (t.due_date === today) remind(t, 'due_today', `Vence hoy: ${short(t.title)}`);
    else if (t.due_date && t.due_date < today) remind(t, 'overdue', `Vencido: ${short(t.title)}`);
    if (t.status === 'waiting' && t.follow_up_date && t.follow_up_date <= today) {
      const who = t.waiting_on ? ` (esperando: ${t.waiting_on})` : '';
      remind(t, 'follow_up', `Toca dar seguimiento: ${short(t.title)}${who}`);
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
