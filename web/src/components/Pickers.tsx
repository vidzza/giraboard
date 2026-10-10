import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, CalendarDays, Check, Flame, Plus, Search, UserRoundPlus, X } from 'lucide-react';
import { STATUSES, STATUS_LABEL, PRIORITIES, PRIORITY_LABEL, type Priority, type Status } from '../../../shared/types.ts';
import { useCategories, useClients, useUsers } from '../lib/queries.ts';
import { quickDates, formatDue } from '../lib/dates.ts';
import { STATUS_STYLE } from '../lib/status.ts';
import { Avatar } from './Avatar.tsx';

/** Botones grandes para cambiar el estado: lo más visible de un pendiente. */
export function StatusPicker({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Estado">
      {STATUSES.map((s) => {
        const st = STATUS_STYLE[s];
        const active = value === s;
        const Icon = st.icon;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(s)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] px-2 text-[15px] font-bold transition-all active:scale-[0.97] ${
              active ? `${st.solid} border-transparent shadow-card` : `border-line-2 bg-card ${st.text} ${st.hover}`
            }`}
          >
            <Icon className="size-[18px]" strokeWidth={2.4} />
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Prioridad">
      {PRIORITIES.map((p) => {
        const active = value === p;
        // Prioridad = escala de urgencia: misma familia de color (rojo) con más o menos intensidad.
        const tone =
          p === 'urgent'
            ? active
              ? 'bg-clay-solid border-clay-solid text-white'
              : 'border-line-2 bg-card text-clay hover:bg-clay-soft'
            : p === 'high'
              ? active
                ? 'bg-clay-soft border-clay text-clay'
                : 'border-line-2 bg-card text-clay hover:bg-clay-soft'
              : active
                ? 'bg-ink border-ink text-paper'
                : 'border-line-2 bg-card text-ink-2 hover:bg-paper-2';
        return (
          <button key={p} type="button" role="radio" aria-checked={active} onClick={() => onChange(p)} className={`chip ${tone}`}>
            {p === 'urgent' && <Flame className="size-4" />}
            {p === 'high' && <ArrowUp className="size-4" strokeWidth={2.6} />}
            {PRIORITY_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}

export function DueDatePicker({
  value,
  onChange,
  allowNone = true,
  noneLabel = 'Sin fecha',
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const options = useMemo(() => quickDates(), []);
  const isCustom = !!value && !options.some((o) => o.value === value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(value === o.value && allowNone ? null : o.value)}
          className={value === o.value ? 'chip-on' : 'chip-off'}
        >
          {o.label}
        </button>
      ))}
      <label className={`relative ${isCustom ? 'chip-on' : 'chip-off'} cursor-pointer`}>
        <CalendarDays className="size-4" />
        {isCustom ? formatDue(value!) : 'Otra fecha'}
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Elegir fecha"
        />
      </label>
      {allowNone && value && (
        <button type="button" onClick={() => onChange(null)} className="chip border-transparent text-ink-3 hover:text-clay">
          <X className="size-4" /> {noneLabel === 'Sin fecha' ? 'Quitar fecha' : noneLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Elegir una o varias personas. Para «responsables», no elegir a nadie = «Por asignar».
 * Si `onlySelf`, la persona solo puede ponerse o quitarse a sí misma (ajuste del negocio).
 */
export function PeoplePicker({
  value,
  onChange,
  mode = 'assignees',
  exclude = [],
  onlySelf = false,
  meId,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  mode?: 'assignees' | 'followers';
  exclude?: number[];
  onlySelf?: boolean;
  meId: number;
}) {
  const { data: users = [] } = useUsers();
  const people = users
    .filter((u) => (u.active || value.includes(u.id)) && !exclude.includes(u.id))
    .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const none = value.length === 0;
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={mode === 'assignees' ? 'Responsables' : 'En copia'}>
        {people.map((u) => {
          const on = value.includes(u.id);
          const locked = onlySelf && u.id !== meId;
          if (locked && !on) return null;
          return (
            <button
              key={u.id}
              type="button"
              aria-pressed={on}
              disabled={locked}
              title={locked ? 'Solo coordinación puede quitar a otras personas' : undefined}
              onClick={() => toggle(u.id)}
              className={`chip pl-1 ${on ? 'border-pine-solid bg-pine-solid text-white' : 'border-line-2 bg-card text-ink-2 hover:border-field hover:text-ink'} disabled:opacity-80`}
            >
              <Avatar user={u} size="xs" className={on ? 'ring-2 ring-white/70' : ''} />
              {u.id === meId ? `Yo (${u.name.split(' ')[0]})` : u.name}
              {on && <Check className="size-4" strokeWidth={3} />}
            </button>
          );
        })}
        {mode === 'assignees' && (
          <button
            type="button"
            aria-pressed={none}
            onClick={() => onChange([])}
            className={`chip ${none ? 'border-ink bg-ink text-paper' : 'border-dashed border-field bg-card text-ink-2 hover:text-ink'}`}
          >
            <UserRoundPlus className="size-4" /> Por asignar
          </button>
        )}
      </div>
      {mode === 'assignees' && (
        <p className="mt-1.5 text-[13px] text-ink-3">
          {none
            ? 'Quedará en la bandeja «Por asignar»: admin y coordinación lo verán para repartirlo.'
            : onlySelf
              ? 'Para dárselo a alguien más, déjalo «Por asignar» y coordinación lo reparte.'
              : value.length > 1
                ? 'Les aparecerá a todos en «Mi día». Cualquiera lo puede marcar como listo.'
                : 'Puedes elegir a varias personas.'}
        </p>
      )}
    </div>
  );
}

export function CategoryPicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { data: categories = [] } = useCategories();
  return (
    <div className="flex flex-wrap gap-2">
      {categories
        .filter((c) => !c.archived || c.id === value)
        .map((c) => {
          const active = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(active ? null : c.id)}
              className="chip"
              style={
                active
                  ? { backgroundColor: c.color, borderColor: c.color, color: 'white' }
                  : { borderColor: 'var(--color-line-2)', backgroundColor: 'var(--color-card)', color: 'var(--color-ink-2)' }
              }
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: active ? 'white' : c.color }} />
              {c.name}
            </button>
          );
        })}
    </div>
  );
}

export type ClientValue = { id: number | null; name: string | null; isNew?: boolean };

/** Buscar un cliente existente o escribir uno nuevo. */
export function ClientPicker({
  value,
  onChange,
  autoFocus,
}: {
  value: ClientValue;
  onChange: (v: ClientValue) => void;
  autoFocus?: boolean;
}) {
  const { data: clients = [] } = useClients();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [changing, setChanging] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = clients
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
    .slice(0, 6);
  const exact = clients.some((c) => c.name.toLowerCase() === q);
  const options: ClientValue[] = [
    ...matches.map((c) => ({ id: c.id, name: c.name })),
    ...(q && !exact ? [{ id: null, name: query.trim(), isNew: true }] : []),
  ];

  const choose = (o: ClientValue) => {
    onChange(o);
    setQuery('');
    setOpen(false);
    setChanging(false);
  };

  if (value.name && !changing) {
    return (
      <div className="flex min-h-12 items-center gap-1 rounded-xl border border-field bg-card pr-1 pl-3.5">
        <span className="flex-1 truncate text-[15px] font-semibold">
          {value.name}
          {value.isNew && <span className="ml-2 text-xs font-bold text-pine">(cliente nuevo)</span>}
        </span>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setChanging(true)}>
          Cambiar
        </button>
        <button type="button" className="btn-ghost btn-sm px-2 text-ink-3" onClick={() => onChange({ id: null, name: null })} aria-label="Quitar cliente">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
      <input
        className="input pl-10"
        placeholder="Busca o escribe el nombre del cliente"
        value={query}
        autoFocus={autoFocus || changing}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && options[highlight]) {
            e.preventDefault();
            choose(options[highlight]);
          } else if (e.key === 'Escape' && changing) {
            e.stopPropagation();
            setChanging(false);
          }
        }}
      />
      {open && options.length > 0 && (
        <div className="mt-1.5 animate-fade overflow-hidden rounded-xl border border-line bg-card shadow-lift" role="listbox">
          {options.map((o, i) => (
            <button
              key={o.id ?? `new-${o.name}`}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(o)}
              role="option"
              aria-selected={i === highlight}
              className={`flex min-h-11 w-full items-center gap-2 px-3.5 py-2.5 text-left text-[15px] ${i === highlight ? 'bg-paper-2' : ''}`}
            >
              {o.isNew ? (
                <>
                  <Plus className="size-4 text-pine" />
                  <span>
                    Agregar cliente nuevo: <b>{o.name}</b>
                  </span>
                </>
              ) : (
                <span className="font-semibold">{o.name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
