import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, LogIn, LogOut } from 'lucide-react';
import { CATEGORY_TEMPLATES, type CategoryTemplate, type User } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { qk } from '../lib/queries.ts';

export const MIN_PASSWORD = 8;

function AuthShell({ children, businessName }: { children: ReactNode; businessName?: string }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-pine p-12 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start">
        <div className="relative z-10 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-11 rounded-xl ring-1 ring-white/20" />
          <span>
            <span className="block font-display text-2xl font-semibold">Giraboard</span>
            {businessName && <span className="text-[14px] text-white/75">{businessName}</span>}
          </span>
        </div>
        <div className="relative z-10 mt-auto max-w-lg">
          <h1 className="font-display text-[54px] leading-[1.02] font-semibold tracking-tight">Que ningún pendiente se quede en el aire.</h1>
          <p className="mt-5 text-lg text-white/80">Todo lo que hay que hacer en la oficina, quién lo tiene y cómo va. En un solo lugar.</p>
        </div>
        {/* Mini tablero decorativo */}
        <div className="pointer-events-none absolute -top-10 -right-24 flex rotate-[-8deg] gap-4 opacity-[0.16]" aria-hidden>
          {[5, 3, 4].map((n, col) => (
            <div key={col} className="w-48 space-y-3 rounded-3xl bg-white/30 p-3">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-white" />
              ))}
            </div>
          ))}
        </div>
        <p className="relative z-10 mt-10 text-[13px] text-white/60">Herramienta interna</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/favicon.svg" alt="" className="size-11" />
            <span>
              <span className="block font-display text-2xl font-semibold">Giraboard</span>
              {businessName && <span className="text-[14px] text-ink-3">{businessName}</span>}
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="input min-h-12 pr-12 text-[16px]"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-clay-soft px-3.5 py-2.5 text-[14px] font-semibold text-clay">
      {children}
    </p>
  );
}

function PasswordHint({ value }: { value: string }) {
  const ok = value.length >= MIN_PASSWORD;
  return (
    <p className={`mt-1.5 text-[13px] ${ok ? 'text-moss' : 'text-ink-3'}`}>
      {ok ? '✓ Largo suficiente' : `Mínimo ${MIN_PASSWORD} caracteres. Una frase corta es fácil de recordar, ej. «gato azul 2024».`}
    </p>
  );
}

export function LoginPage({ businessName }: { businessName: string }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/login', { username: username.trim(), password });
      await qc.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell businessName={businessName}>
      <h2 className="font-display text-[32px] font-semibold tracking-tight">Hola de nuevo</h2>
      <p className="mt-1 text-ink-2">Entra con tu usuario para ver tus pendientes.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="username">
            Usuario
          </label>
          <input
            id="username"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="input min-h-12 text-[16px]"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Contraseña
          </label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn-primary min-h-12 w-full text-base" disabled={loading || !username || !password}>
          <LogIn className="size-5" /> {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="text-center text-[13px] text-ink-3">¿Olvidaste tu contraseña? Pídele a un admin que te dé una nueva.</p>
      </form>
    </AuthShell>
  );
}

export function SetupPage({ codeRequired }: { codeRequired: boolean }) {
  const qc = useQueryClient();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [form, setForm] = useState({ business_name: '', name: '', username: '', password: '', setup_code: '' });
  const [template, setTemplate] = useState<CategoryTemplate>('general');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/setup', { ...form, template, timezone });
      await qc.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="font-display text-[32px] font-semibold tracking-tight">¡Hola! Vamos a empezar</h2>
      <p className="mt-1 text-ink-2">Configura Giraboard para tu negocio. Quien llene esto será admin: podrá agregar al equipo y cambiar los ajustes.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {codeRequired && (
          <div className="rounded-2xl border border-amber/30 bg-amber-soft/60 p-4">
            <Field id="setup_code" label="Código de configuración" value={form.setup_code} onChange={set('setup_code')} placeholder="0000-0000" inputMode="numeric" />
            <p className="mt-2 text-[13px] text-ink-2">
              Aparece en la consola del servidor (o con el comando <code className="font-semibold">sudo giraboard codigo</code>). Así nadie
              más puede crear esta cuenta.
            </p>
          </div>
        )}
        <Field id="business" label="Nombre del negocio" value={form.business_name} onChange={set('business_name')} placeholder="Ej. Seguros Hernández" />
        <div>
          <span className="label">¿A qué se dedica?</span>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Plantilla de tipos de pendiente">
            {(Object.keys(CATEGORY_TEMPLATES) as CategoryTemplate[]).map((key) => {
              const t = CATEGORY_TEMPLATES[key];
              const on = template === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${t.label}: ${t.hint}`}
                  onClick={() => setTemplate(key)}
                  className={`rounded-xl border-[1.5px] px-3 py-2 text-left transition-colors ${on ? 'border-pine bg-pine-soft' : 'border-line-2 bg-card hover:bg-paper-2'}`}
                >
                  <span className={`block text-[14px] font-bold ${on ? 'text-pine' : 'text-ink'}`}>{t.label}</span>
                  <span className="block text-[12px] text-ink-3">{t.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[13px] text-ink-3">Solo define los tipos de pendiente iniciales; después los cambias como quieras.</p>
        </div>
        <Field id="name" label="Tu nombre" value={form.name} onChange={set('name')} placeholder="Ej. Ana López" />
        <Field
          id="username"
          label="Usuario para entrar"
          value={form.username}
          onChange={(v) => set('username')(v.replace(/\s/g, '').toLowerCase())}
          placeholder="Ej. ana"
        />
        <div>
          <label className="label" htmlFor="password">
            Contraseña
          </label>
          <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
          <PasswordHint value={form.password} />
        </div>
        <p className="text-[13px] text-ink-3">
          Zona horaria: <b className="font-semibold text-ink-2">{timezone}</b> (la de esta computadora; se puede cambiar en Ajustes).
        </p>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn-primary min-h-12 w-full text-base" disabled={loading}>
          {loading ? 'Preparando…' : 'Empezar'}
        </button>
      </form>
    </AuthShell>
  );
}

/** Quien entra con una contraseña temporal debe crear la suya antes de continuar. */
export function ChoosePasswordPage({ user }: { user: User }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    if (password !== confirm) return setError('Las dos contraseñas no coinciden.');
    setLoading(true);
    try {
      const res = await api.post<{ user: User }>('/auth/set-password', { password });
      qc.setQueryData(qk.me, res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await api.post('/auth/logout');
    qc.setQueryData(qk.me, null);
  };

  return (
    <AuthShell>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-pine-soft text-pine">
        <KeyRound className="size-6" />
      </span>
      <h2 className="mt-4 font-display text-[30px] leading-tight font-semibold tracking-tight">Hola, {user.name.split(' ')[0]}. Crea tu contraseña</h2>
      <p className="mt-2 text-ink-2">Entraste con una contraseña temporal. Elige una propia que solo tú conozcas.</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <div>
          <label className="label" htmlFor="new-password">
            Nueva contraseña
          </label>
          <PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
          <PasswordHint value={password} />
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">
            Escríbela otra vez
          </label>
          <PasswordInput id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn-primary min-h-12 w-full text-base" disabled={loading || !password || !confirm}>
          {loading ? 'Guardando…' : 'Guardar y entrar'}
        </button>
        <button type="button" className="btn-ghost w-full" onClick={logout}>
          <LogOut className="size-4" /> Salir
        </button>
      </form>
    </AuthShell>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input min-h-12 text-[16px]"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize={id === 'username' || id === 'setup_code' ? 'none' : undefined}
        spellCheck={id === 'username' ? false : undefined}
      />
    </div>
  );
}
