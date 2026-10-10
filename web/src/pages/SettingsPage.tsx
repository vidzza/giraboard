import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  ArchiveRestore,
  Copy,
  DatabaseBackup,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  CATEGORY_COLORS,
  LEGACY_COLOR_FIX,
  ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  USER_COLORS,
  type Category,
  type Role,
  type User,
} from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { copyText } from '../lib/clipboard.ts';
import { qk, useCategories, useCurrentUser, useInvalidate, useSettings, useTickets, useUsers } from '../lib/queries.ts';
import { timeAgo } from '../lib/dates.ts';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme.ts';
import { Avatar } from '../components/Avatar.tsx';
import { Modal } from '../components/Modal.tsx';
import { EditableText } from '../components/Editable.tsx';
import { MIN_PASSWORD } from './AuthPages.tsx';

function errorToast(err: unknown) {
  toast.error((err as Error).message);
}

/** Contraseña temporal fácil de dictar, ej. "nube-4821". */
function temporaryPassword() {
  const words = ['luna', 'sol', 'mar', 'rio', 'flor', 'nube', 'roca', 'lago', 'pino', 'faro', 'brisa', 'cielo'];
  const n = crypto.getRandomValues(new Uint32Array(2));
  return `${words[n[0] % words.length]}-${1000 + (n[1] % 9000)}`;
}

export function SettingsPage() {
  const me = useCurrentUser();
  const isAdmin = me.role === 'admin';
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">{isAdmin ? 'Personas, tipos de pendiente y tu perfil' : 'Tu perfil'}</p>
        <h1 className="page-title">{isAdmin ? 'Equipo y ajustes' : 'Mi perfil'}</h1>
      </header>
      <Profile />
      <Appearance />
      {isAdmin && <Team />}
      {isAdmin && <Categories />}
      {isAdmin && <Business />}
      {isAdmin && <DataPanel />}
    </div>
  );
}

function Panel({ title, subtitle, children, aside }: { title: string; subtitle?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="font-display text-[22px] font-semibold">{title}</h2>
          {subtitle && <p className="text-[14px] text-ink-3">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ColorSwatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  const current = (LEGACY_COLOR_FIX[value.toUpperCase()] ?? value).toUpperCase();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={current === c.toUpperCase()}
          onClick={() => onChange(c)}
          className={`size-10 rounded-full transition-transform hover:scale-110 ${current === c.toUpperCase() ? 'ring-3 ring-ink ring-offset-2 ring-offset-card' : ''}`}
          style={{ backgroundColor: c }}
          aria-label={`Color ${i + 1}`}
        />
      ))}
    </div>
  );
}

const THEMES: { value: ThemePref; label: string; hint: string; icon: ReactNode }[] = [
  { value: 'auto', label: 'Automático', hint: 'Como esté el celular o la computadora', icon: <Monitor className="size-5" /> },
  { value: 'light', label: 'Claro', hint: 'Fondo color papel', icon: <Sun className="size-5" /> },
  { value: 'dark', label: 'Oscuro', hint: 'Más cómodo de noche', icon: <Moon className="size-5" /> },
];

/** Tema de colores. Se guarda en este dispositivo (cada quien elige en su celular y en su computadora). */
function Appearance() {
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  return (
    <Panel title="Apariencia" subtitle="Se guarda en este dispositivo.">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tema de colores">
        {THEMES.map((t) => {
          const on = theme === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setTheme(t.value);
                setThemePref(t.value);
              }}
              className={`flex min-h-14 items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition-colors ${
                on ? 'border-pine bg-pine-soft' : 'border-line-2 bg-card hover:bg-paper-2'
              }`}
            >
              <span className={on ? 'text-pine' : 'text-ink-3'}>{t.icon}</span>
              <span>
                <span className={`block font-bold ${on ? 'text-pine' : ''}`}>{t.label}</span>
                <span className="block text-[13px] text-ink-3">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function Profile() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const patch = async (data: Partial<User>) => {
    try {
      const user = await api.patch<User>(`/users/${me.id}`, data);
      qc.setQueryData(qk.me, user);
      invalidate();
      toast.success('Guardado');
    } catch (err) {
      errorToast(err);
    }
  };

  const changePassword = async () => {
    if (next !== confirm) return toast.error('Las dos contraseñas nuevas no coinciden');
    try {
      await api.patch(`/users/${me.id}`, { password: next, current_password: current });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Contraseña cambiada. Se cerró tu sesión en los demás dispositivos.');
    } catch (err) {
      errorToast(err);
    }
  };

  const logoutOthers = async () => {
    try {
      await api.post('/auth/logout-others');
      toast.success('Listo: solo quedó abierta esta sesión');
    } catch (err) {
      errorToast(err);
    }
  };

  return (
    <Panel title="Mi perfil" subtitle={`Entras con el usuario «${me.username}»`}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar user={me} size="lg" />
            <div className="flex-1">
              <span className="label">Nombre</span>
              <EditableText value={me.name} allowEmpty={false} maxLength={60} onSave={(name) => patch({ name })} className="input py-2.5" />
            </div>
          </div>
          <div>
            <span className="label">Mi color</span>
            <ColorSwatches colors={USER_COLORS} value={me.color} onChange={(color) => patch({ color })} />
          </div>
          <button className="btn-secondary btn-sm" onClick={logoutOthers}>
            <LogOut className="size-4" /> Cerrar sesión en los demás dispositivos
          </button>
        </div>
        <form
          className="space-y-3 rounded-2xl bg-paper-2/60 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            changePassword();
          }}
        >
          <p className="flex items-center gap-2 font-bold">
            <KeyRound className="size-4" /> Cambiar mi contraseña
          </p>
          <input type="text" autoComplete="username" value={me.username} readOnly hidden />
          <input type="password" className="input" placeholder="Contraseña actual" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          <input
            type="password"
            className="input"
            placeholder={`Nueva contraseña (mínimo ${MIN_PASSWORD})`}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <input type="password" className="input" placeholder="Escribe la nueva otra vez" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          <button className="btn-secondary" disabled={!current || next.length < MIN_PASSWORD || !confirm}>
            Cambiar contraseña
          </button>
        </form>
      </div>
    </Panel>
  );
}

function Team() {
  const me = useCurrentUser();
  const { data: users = [] } = useUsers();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  return (
    <Panel
      title="Equipo"
      subtitle="Cada persona entra con su propio usuario; así queda registrado quién hizo qué."
      aside={
        <button className="btn-primary" onClick={() => setEditing('new')}>
          <UserPlus className="size-4" /> Agregar persona
        </button>
      }
    >
      <RolesExplainer />
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
        {users.map((u) => (
          <li key={u.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${u.active ? '' : 'bg-paper/60'}`}>
            <Avatar user={u} size="md" className={u.active ? '' : 'opacity-50'} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-bold">
                {u.name}
                {u.id === me.id && <span className="text-[13px] font-semibold text-ink-3">(tú)</span>}
                <RoleBadge role={u.role} />
                {!u.active && <span className="rounded-full bg-paper-3 px-2 py-0.5 text-[12px] font-bold text-ink-2">Sin acceso</span>}
                {u.active && u.must_change_password ? (
                  <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[12px] font-bold text-amber">Contraseña temporal</span>
                ) : null}
              </p>
              <p className="text-[13px] text-ink-3">
                Usuario: <b className="font-semibold text-ink-2">{u.username}</b> ·{' '}
                {u.last_login_at ? `último acceso ${timeAgo(u.last_login_at)}` : 'todavía no ha entrado'}
              </p>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => setEditing(u)} aria-label={`Editar a ${u.name}`}>
              <Pencil className="size-4" /> Editar
            </button>
          </li>
        ))}
      </ul>
      <UserModal user={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}

const ROLE_ICON: Record<Role, ReactNode> = {
  admin: <ShieldCheck className="size-3.5" />,
  manager: <UserCog className="size-3.5" />,
  member: <Users className="size-3.5" />,
};

function RoleBadge({ role }: { role: Role }) {
  const tone = role === 'admin' ? 'bg-pine-soft text-pine' : role === 'manager' ? 'bg-plum-soft text-plum' : 'bg-paper-2 text-ink-2';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${tone}`}>
      {ROLE_ICON[role]} {ROLE_LABEL[role]}
    </span>
  );
}

/** Qué puede hacer cada rol, en una tabla corta. */
function RolesExplainer() {
  return (
    <details className="group rounded-2xl border border-line bg-paper/50">
      <summary className="flex min-h-12 items-center gap-2 px-4 font-semibold text-ink-2 marker:content-none">
        <ShieldCheck className="size-4 text-ink-3" /> ¿Qué puede hacer cada quién?
        <span className="ml-auto text-[13px] text-pine group-open:hidden">Ver</span>
      </summary>
      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full min-w-[520px] text-[14px]">
          <thead>
            <tr className="text-left text-[12px] tracking-wider text-ink-3 uppercase">
              <th className="py-2 font-bold"> </th>
              {ROLES.map((r) => (
                <th key={r} className="py-2 text-center font-bold">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(
              [
                ['Ver sus pendientes, los que pidió y donde está en copia', [1, 1, 1]],
                ['Ver los pendientes de todo el equipo', [1, 1, 0]],
                ['Bandeja «Por asignar» y repartir el trabajo', [1, 1, 0]],
                ['Asignar pendientes a otras personas', [1, 1, 2]],
                ['Ver el Resumen y la actividad del equipo', [1, 1, 0]],
                ['Archivar pendientes', [1, 1, 3]],
                ['Borrar pendientes', [1, 0, 0]],
                ['Agregar personas, permisos y ajustes', [1, 0, 0]],
                ['Descargar respaldos y Excel', [1, 0, 0]],
              ] as const
            ).map(([label, cells]) => (
              <tr key={label}>
                <td className="py-2 pr-3 text-ink-2">{label}</td>
                {cells.map((c, i) => (
                  <td key={i} className="py-2 text-center">
                    {c === 1 ? '✅' : c === 0 ? <span className="text-ink-3">—</span> : c === 2 ? <span className="text-[12px] font-semibold text-ink-2">si lo permites</span> : <span className="text-[12px] font-semibold text-ink-2">los que creó</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[13px] text-ink-3">
          Cualquiera puede borrar su propia nota o archivo durante 15 minutos (para corregir un error). Después, solo un admin.
        </p>
      </div>
    </details>
  );
}

type UserForm = { name: string; username: string; password: string; role: Role; color: string; active: boolean };

function UserModal({ user, onClose }: { user: User | 'new' | null; onClose: () => void }) {
  const me = useCurrentUser();
  const invalidate = useInvalidate();
  const { data: users = [] } = useUsers();
  const { data: tickets = [] } = useTickets();
  const isNew = user === 'new';
  const [form, setForm] = useState<UserForm>({ name: '', username: '', password: '', role: 'member', color: USER_COLORS[1], active: true });
  const [resetPassword, setResetPassword] = useState(false);
  const [reassignTo, setReassignTo] = useState<number | null>(me.id);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // Al abrir la ventana se cargan los datos de la persona (o una forma vacía con contraseña temporal).
  const key = user === null ? null : isNew ? 'new' : String(user.id);
  if (key !== lastKey) {
    setLastKey(key);
    setResetPassword(false);
    setCreated(null);
    setReassignTo(me.id);
    if (user && user !== 'new') {
      setForm({ name: user.name, username: user.username, password: '', role: user.role, color: user.color, active: !!user.active });
    } else if (user === 'new') {
      setForm({
        name: '',
        username: '',
        password: temporaryPassword(),
        role: 'member',
        color: USER_COLORS[(users.length + 1) % USER_COLORS.length],
        active: true,
      });
    }
  }

  const target = user && user !== 'new' ? user : null;
  // Sus pendientes abiertos: los que solo tiene esa persona necesitan a alguien más; los compartidos se quedan con los demás.
  const { openTickets, soloTickets } = useMemo(() => {
    if (!target) return { openTickets: 0, soloTickets: 0 };
    const open = tickets.filter((t) => t.assignee_ids.includes(target.id) && t.status !== 'done' && !t.archived_at);
    return { openTickets: open.length, soloTickets: open.filter((t) => t.assignee_ids.length === 1).length };
  }, [tickets, target]);
  const deactivating = !!target && !!target.active && !form.active;

  const submit = async () => {
    setSaving(true);
    try {
      if (isNew) {
        await api.post('/users', { name: form.name, username: form.username, password: form.password, role: form.role, color: form.color });
        setCreated({ name: form.name, username: form.username.toLowerCase(), password: form.password });
      } else if (target) {
        await api.patch(`/users/${target.id}`, {
          name: form.name,
          username: form.username,
          role: form.role,
          color: form.color,
          active: form.active,
          ...(resetPassword && form.password ? { password: form.password } : {}),
          ...(deactivating && openTickets > 0 ? { reassign_to: reassignTo } : {}),
        });
        if (resetPassword && form.password) {
          setCreated({ name: form.name, username: form.username.toLowerCase(), password: form.password });
        } else {
          toast.success(deactivating ? `${form.name} ya no tiene acceso` : 'Cambios guardados');
          onClose();
        }
      }
      invalidate();
    } catch (err) {
      errorToast(err);
    } finally {
      setSaving(false);
    }
  };

  const copyAccess = async () => {
    if (!created) return;
    const text = `Hola ${created.name.split(' ')[0]}, ya tienes acceso a Giraboard.\nEntra a ${window.location.origin}\nUsuario: ${created.username}\nContraseña temporal: ${created.password}\nAl entrar te pedirá crear tu propia contraseña.`;
    if (await copyText(text)) toast.success('Copiado. Pégalo en WhatsApp para mandárselo.');
    else toast(text, { description: 'Copia este mensaje', duration: 20_000 });
  };

  // Pantalla final: datos de acceso para entregar a la persona.
  if (created) {
    return (
      <Modal
        open={user !== null}
        onClose={onClose}
        title="Listo, ya puede entrar"
        footer={
          <>
            <button className="btn-secondary" onClick={copyAccess}>
              <Copy className="size-4" /> Copiar mensaje para WhatsApp
            </button>
            <button className="btn-primary" onClick={onClose}>
              Terminar
            </button>
          </>
        }
      >
        <p className="text-ink-2">Dale estos datos a {created.name}. Al entrar, el sistema le pedirá crear su propia contraseña.</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl bg-paper-2/70 p-4 text-[16px]">
          <dt className="text-ink-3">Dirección</dt>
          <dd className="font-semibold break-all">{window.location.origin}</dd>
          <dt className="text-ink-3">Usuario</dt>
          <dd className="font-bold">{created.username}</dd>
          <dt className="text-ink-3">Contraseña temporal</dt>
          <dd className="font-mono text-lg font-bold">{created.password}</dd>
        </dl>
      </Modal>
    );
  }

  return (
    <Modal
      open={user !== null}
      onClose={onClose}
      title={isNew ? 'Agregar persona' : `Editar a ${target?.name ?? ''}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className={deactivating ? 'btn-danger-solid' : 'btn-primary'} onClick={submit} disabled={saving}>
            {isNew ? 'Crear acceso' : deactivating ? 'Quitar acceso' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="u-name">
              Nombre
            </label>
            <input id="u-name" className="input" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Luis Pérez" />
          </div>
          <div>
            <label className="label" htmlFor="u-username">
              Usuario para entrar
            </label>
            <input
              id="u-username"
              className="input"
              maxLength={30}
              value={form.username}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '').toLowerCase() })}
              placeholder="Ej. luis"
            />
          </div>
        </div>

        {isNew || resetPassword ? (
          <div className="rounded-2xl bg-paper-2/60 p-4">
            <label className="label" htmlFor="u-pass">
              Contraseña temporal
            </label>
            <div className="flex gap-2">
              <input
                id="u-pass"
                className="input font-mono"
                type="text"
                autoComplete="off"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={() => setForm({ ...form, password: temporaryPassword() })} title="Generar otra">
                <RefreshCw className="size-4" />
              </button>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-2">
              Mínimo {MIN_PASSWORD} caracteres. Es temporal: al entrar, la persona creará la suya.
              {!isNew && ' Se cerrará su sesión en todos sus dispositivos.'}
            </p>
          </div>
        ) : (
          <button type="button" className="btn-secondary btn-sm" onClick={() => (setResetPassword(true), setForm({ ...form, password: temporaryPassword() }))}>
            <KeyRound className="size-4" /> Darle una contraseña nueva (si la olvidó)
          </button>
        )}

        <div>
          <span className="label">Rol</span>
          <div className="grid gap-2" role="radiogroup" aria-label="Rol">
            {(['member', 'manager', 'admin'] as Role[]).map((r) => {
              const on = form.role === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setForm({ ...form, role: r })}
                  className={`flex items-start gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition-colors ${
                    on ? 'border-pine bg-pine-soft' : 'border-line-2 bg-card hover:bg-paper-2'
                  }`}
                >
                  <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-pine' : 'border-field'}`}>
                    {on && <span className="size-2.5 rounded-full bg-pine-solid" />}
                  </span>
                  <span>
                    <span className={`flex items-center gap-1.5 font-bold ${on ? 'text-pine' : ''}`}>
                      {ROLE_ICON[r]} {ROLE_LABEL[r]}
                    </span>
                    <span className="block text-[13px] text-ink-2">{ROLE_HINT[r]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="label">Color</span>
          <ColorSwatches colors={USER_COLORS} value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>

        {target && target.id !== me.id && (
          <div className={`rounded-2xl border p-4 ${form.active ? 'border-line' : 'border-clay/30 bg-clay-soft/40'}`}>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 accent-[var(--color-pine-solid)]" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span>
                <b>Tiene acceso</b>
                <span className="block text-[13px] text-ink-3">Si ya no trabaja aquí, quítale el acceso. Su historial se conserva.</span>
              </span>
            </label>
            {deactivating && openTickets > 0 && (
              <div className="mt-3 border-t border-clay/20 pt-3">
                <label className="label" htmlFor="u-reassign">
                  {soloTickets > 0
                    ? `Tiene ${soloTickets} pendiente${soloTickets === 1 ? '' : 's'} que solo lleva esa persona. ¿Quién se queda con ellos?`
                    : 'Sus pendientes son compartidos'}
                </label>
                {openTickets > soloTickets && (
                  <p className="mb-2 text-[13px] text-ink-2">
                    {openTickets - soloTickets} pendiente{openTickets - soloTickets === 1 ? '' : 's'} compartido{openTickets - soloTickets === 1 ? '' : 's'} se
                    queda{openTickets - soloTickets === 1 ? '' : 'n'} con las demás personas.
                  </p>
                )}
{soloTickets > 0 && (
                <select
                  id="u-reassign"
                  className="input"
                  value={reassignTo ?? ''}
                  onChange={(e) => setReassignTo(e.target.value ? Number(e.target.value) : null)}
                >
                  {users
                    .filter((u) => u.active && u.id !== target.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  <option value="">Dejarlos en la bandeja «Por asignar»</option>
                </select>
)}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Categories() {
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidate();
  const [name, setName] = useState('');

  const patch = async (c: Category, data: { name?: string; color?: string; archived?: boolean }) => {
    try {
      await api.patch(`/categories/${c.id}`, data);
      invalidate();
    } catch (err) {
      errorToast(err);
    }
  };
  const add = async () => {
    if (!name.trim()) return;
    try {
      await api.post('/categories', { name: name.trim(), color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] });
      setName('');
      invalidate();
    } catch (err) {
      errorToast(err);
    }
  };

  return (
    <Panel title="Tipos de pendiente" subtitle="Ayudan a ver de un vistazo de qué se trata cada tarjeta. Cámbialos a como trabajen ustedes.">
      <ul className="space-y-2">
        {categories.map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2 ${c.archived ? 'opacity-50' : ''}`}>
            <span className="size-4 rounded-full" style={{ backgroundColor: c.color }} />
            <EditableText
              value={c.name}
              allowEmpty={false}
              maxLength={40}
              onSave={(v) => patch(c, { name: v })}
              className="min-w-40 flex-1 rounded-lg px-2 py-1 font-semibold hover:bg-paper-2 focus:bg-card focus:ring-3 focus:ring-pine/15 focus:outline-none"
            />
            <div className="flex gap-1">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => patch(c, { color })}
                  className={`size-5 rounded-full ${c.color === color ? 'ring-2 ring-ink ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Color ${color}`}
                />
              ))}
            </div>
            <button className="btn-ghost btn-sm" onClick={() => patch(c, { archived: !c.archived })}>
              {c.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              {c.archived ? 'Volver a usar' : 'Ya no usar'}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          className="input"
          maxLength={40}
          placeholder="Nuevo tipo, ej. «Trámite bancario»"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn-secondary shrink-0" onClick={add} disabled={!name.trim()}>
          <Plus className="size-4" /> Agregar
        </button>
      </div>
    </Panel>
  );
}

function Business() {
  const { data } = useSettings();
  const invalidate = useInvalidate();
  const zones = useMemo(() => {
    const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return data?.timezone && !list.includes(data.timezone) ? [data.timezone, ...list] : list;
  }, [data?.timezone]);

  const save = async (patch: { business_name?: string; timezone?: string; members_can_assign?: boolean }) => {
    try {
      await api.patch('/settings', patch);
      invalidate();
      toast.success('Guardado');
    } catch (err) {
      errorToast(err);
    }
  };

  return (
    <Panel title="Negocio">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <span className="label">Nombre del negocio</span>
          <EditableText
            value={data?.business_name ?? ''}
            allowEmpty={false}
            maxLength={80}
            onSave={(business_name) => save({ business_name })}
            className="input py-2.5"
          />
        </div>
        <div>
          <label className="label" htmlFor="timezone">
            Zona horaria
          </label>
          <select id="timezone" className="input" value={data?.timezone ?? ''} onChange={(e) => save({ timezone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[13px] text-ink-3">Define qué es «hoy», qué está vencido y a qué hora salen los recordatorios.</p>
        </div>
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-[var(--color-pine-solid)]"
          checked={data?.members_can_assign ?? true}
          onChange={(e) => save({ members_can_assign: e.target.checked })}
        />
        <span>
          <b>El equipo puede asignar pendientes a otras personas</b>
          <span className="block text-[14px] text-ink-2">
            Si lo apagas, quienes tienen rol «Equipo» solo pueden tomar pendientes para sí o dejarlos «Por asignar», y coordinación los reparte.
          </span>
        </span>
      </label>
    </Panel>
  );
}

function DataPanel() {
  return (
    <Panel title="Tus datos" subtitle="Todo queda guardado en el servidor y se respalda solo cada día. Aquí puedes llevarte una copia.">
      <div className="grid gap-3 sm:grid-cols-2">
        <a href="/api/admin/export.csv" className="flex items-start gap-3 rounded-2xl border border-line p-4 transition-colors hover:bg-paper-2/60">
          <FileSpreadsheet className="mt-0.5 size-6 shrink-0 text-moss" />
          <span>
            <b className="block">Descargar pendientes para Excel</b>
            <span className="text-[13px] text-ink-3">Todos los pendientes, con responsable, cliente, fechas y estado.</span>
          </span>
        </a>
        <a href="/api/admin/backup" className="flex items-start gap-3 rounded-2xl border border-line p-4 transition-colors hover:bg-paper-2/60">
          <DatabaseBackup className="mt-0.5 size-6 shrink-0 text-sky" />
          <span>
            <b className="block">Descargar respaldo completo</b>
            <span className="text-[13px] text-ink-3">Copia de toda la información (sin archivos adjuntos). Guárdala en un lugar seguro.</span>
          </span>
        </a>
      </div>
    </Panel>
  );
}
