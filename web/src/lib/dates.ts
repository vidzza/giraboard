import {
  addDays,
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  nextFriday,
  nextMonday,
  parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';

export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export function parseDay(date: string) {
  return parseISO(`${date}T12:00:00`);
}

export function daysFromToday(date: string) {
  return differenceInCalendarDays(parseDay(date), new Date());
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export function dueTone(date: string | null | undefined): DueTone {
  if (!date) return 'none';
  const d = daysFromToday(date);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 2) return 'soon';
  return 'later';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Hoy", "Mañana", "Ayer", "Vie 12 oct", "Hace 3 días"… */
export function formatDue(date: string) {
  const d = daysFromToday(date);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  if (d < -1 && d >= -6) return `Hace ${-d} días`;
  if (d > 1 && d <= 6) return cap(format(parseDay(date), 'EEEE', { locale: es }));
  const sameYear = parseDay(date).getFullYear() === new Date().getFullYear();
  return cap(format(parseDay(date), sameYear ? 'EEE d MMM' : 'd MMM yyyy', { locale: es })).replace('.', '');
}

export function formatLongDate(date: string) {
  return cap(format(parseDay(date), "EEEE d 'de' MMMM", { locale: es }));
}

export function formatDateTime(iso: string) {
  return format(parseISO(iso), "d MMM yyyy, h:mm aaaa", { locale: es }).replace('.', '');
}

export function timeAgo(iso: string) {
  const diff = Date.now() - parseISO(iso).getTime();
  if (diff < 60_000) return 'hace un momento';
  return `hace ${formatDistanceToNowStrict(parseISO(iso), { locale: es })}`;
}

export function daysSince(iso: string) {
  return Math.floor((Date.now() - parseISO(iso).getTime()) / 86_400_000);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Opciones rápidas de fecha, para no tener que abrir el calendario. */
export function quickDates() {
  const now = new Date();
  const day = now.getDay();
  const friday = day === 5 ? now : nextFriday(now);
  return [
    { label: 'Hoy', value: toDateStr(now) },
    { label: 'Mañana', value: toDateStr(addDays(now, 1)) },
    // Entre semana es "este viernes"; en sábado o domingo es el de la semana que viene
    { label: day === 0 || day === 6 ? 'Viernes' : 'Este viernes', value: toDateStr(friday) },
    { label: 'Próx. lunes', value: toDateStr(nextMonday(now)) },
    { label: 'En 2 semanas', value: toDateStr(addDays(now, 14)) },
  ].filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i);
}
