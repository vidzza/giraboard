// Tipos y constantes compartidos entre el servidor y la interfaz.

export const STATUSES = ['todo', 'doing', 'waiting', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'Por hacer',
  doing: 'En proceso',
  waiting: 'Esperando',
  done: 'Listo',
};

export const STATUS_HINT: Record<Status, string> = {
  todo: 'Pendientes que todavía nadie empieza',
  doing: 'Alguien ya está trabajando en ellos',
  waiting: 'Depende de alguien más: cliente, aseguradora, banco…',
  done: 'Terminados',
};

export const PRIORITIES = ['normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  normal: 'Normal',
  high: 'Importante',
  urgent: 'Urgente',
};

export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'No se repite',
  daily: 'Cada día',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  yearly: 'Cada año',
};

export type Role = 'admin' | 'member';

/** Días sin movimiento para considerar un pendiente "estancado". */
export const STALE_DAYS = 7;

export const USER_COLORS = [
  '#1E5B4F', '#B5523B', '#3A6EA5', '#8A5A9E', '#C28A1E', '#2F7D5B', '#A23E6A', '#4E5D6C',
];

export const CATEGORY_COLORS = [
  '#1E5B4F', '#3A6EA5', '#B5523B', '#C28A1E', '#8A5A9E', '#2F7D5B', '#A23E6A', '#4E5D6C', '#0E7490', '#9A6B3F',
];

export interface User {
  id: number;
  name: string;
  username: string;
  role: Role;
  color: string;
  active: number;
  /** 1 si tiene una contraseña temporal y debe crear la suya al entrar. */
  must_change_password: number;
  last_login_at: string | null;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  position: number;
  archived: number;
}

export interface Client {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  open_count?: number;
  total_count?: number;
  last_activity_at?: string | null;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assignee_id: number | null;
  creator_id: number;
  category_id: number | null;
  client_id: number | null;
  due_date: string | null; // YYYY-MM-DD
  waiting_on: string | null;
  follow_up_date: string | null; // YYYY-MM-DD
  recurrence: Recurrence;
  next_ticket_id: number | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  status_changed_at: string;
  completed_at: string | null;
  archived_at: string | null;
  // calculados
  client_name: string | null;
  client_phone: string | null;
  checklist_total: number;
  checklist_done: number;
  comment_count: number;
  attachment_count: number;
}

export interface ChecklistItem {
  id: number;
  ticket_id: number;
  text: string;
  done: number;
  position: number;
  done_by: number | null;
  done_at: string | null;
}

export interface Comment {
  id: number;
  ticket_id: number;
  user_id: number;
  body: string;
  created_at: string;
}

export interface Attachment {
  id: number;
  ticket_id: number;
  user_id: number;
  filename: string;
  mime: string;
  size: number;
  created_at: string;
}

export type ActivityType =
  | 'created'
  | 'status'
  | 'assignee'
  | 'due'
  | 'priority'
  | 'title'
  | 'category'
  | 'client'
  | 'waiting'
  | 'recurrence'
  | 'checklist_add'
  | 'checklist_done'
  | 'checklist_undone'
  | 'comment'
  | 'attachment'
  | 'archived'
  | 'unarchived'
  | 'recurring_next'
  // Cuentas del equipo (sin pendiente asociado)
  | 'user_created'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'password_reset'
  | 'password_set'
  | 'role_changed';

export interface Activity {
  id: number;
  ticket_id: number | null;
  user_id: number | null;
  type: ActivityType;
  data: Record<string, unknown>;
  created_at: string;
  ticket_title?: string | null;
}

export interface TicketDetail extends Ticket {
  checklist: ChecklistItem[];
  comments: Comment[];
  attachments: Attachment[];
  activity: Activity[];
}

export interface Notification {
  id: number;
  user_id: number;
  ticket_id: number | null;
  actor_id: number | null;
  type: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface Stats {
  today: string;
  open: number;
  overdue: number;
  due_today: number;
  waiting: number;
  follow_ups: number;
  done_week: number;
  created_week: number;
  stale: number;
  per_user: { user_id: number; open: number; overdue: number; waiting: number; done_week: number }[];
  per_category: { category_id: number | null; open: number }[];
  weekly: { week_start: string; done: number; created: number }[];
  stale_tickets: Ticket[];
  waiting_tickets: Ticket[];
}

export interface Settings {
  business_name: string;
  /** Zona horaria IANA del negocio, ej. "America/Mexico_City". */
  timezone: string;
}

/** Tipos de pendiente iniciales que se pueden elegir al configurar (luego se editan libremente). */
export const CATEGORY_TEMPLATES = {
  general: {
    label: 'General',
    hint: 'Sirve para casi cualquier oficina',
    categories: ['Atención a cliente', 'Ventas', 'Cobranza', 'Pagos', 'Trámites', 'Administrativo', 'Interno'],
  },
  seguros: {
    label: 'Agencia de seguros',
    hint: 'Renovaciones, siniestros, cobranza…',
    categories: ['Renovación', 'Póliza nueva', 'Cotización', 'Cobranza', 'Siniestro', 'Endoso / cambio', 'Atención a cliente', 'Administrativo'],
  },
  contable: {
    label: 'Despacho contable',
    hint: 'Impuestos, nómina, facturación…',
    categories: ['Impuestos', 'Facturación', 'Nómina', 'Contabilidad', 'Trámites', 'Atención a cliente', 'Administrativo'],
  },
  inmobiliaria: {
    label: 'Inmobiliaria',
    hint: 'Captación, visitas, contratos…',
    categories: ['Captación', 'Visitas', 'Contratos', 'Cobranza de rentas', 'Mantenimiento', 'Atención a cliente', 'Administrativo'],
  },
  vacio: {
    label: 'Empezar sin tipos',
    hint: 'Los creas tú después en Ajustes',
    categories: [],
  },
} as const;

export type CategoryTemplate = keyof typeof CATEGORY_TEMPLATES;
