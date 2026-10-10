import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { addDays } from 'date-fns';
import { toast } from 'sonner';
import { AlertTriangle, CalendarCheck, ChevronDown, Hourglass, Moon, PartyPopper, Plus, Sparkles, Sun, Telescope } from 'lucide-react';
import { STALE_DAYS, type Ticket } from '../../../shared/types.ts';
import { sortTickets, useCreateTicket, useCurrentUser, useTickets, useUsers } from '../lib/queries.ts';
import { daysSince, formatLongDate, greeting, toDateStr, todayStr } from '../lib/dates.ts';
import { useUI } from '../lib/ui.tsx';
import { TicketRow } from '../components/TicketRow.tsx';
import { Avatar } from '../components/Avatar.tsx';

function readScope(): string {
  try {
    return localStorage.getItem('gb.today.scope') ?? 'mine';
  } catch {
    return 'mine';
  }
}

export function TodayPage() {
  const me = useCurrentUser();
  const { data: tickets = [], isLoading } = useTickets();
  const { data: users = [] } = useUsers();
  const [scope, setScopeState] = useState<string>(readScope);
  const setScope = (s: string) => {
    setScopeState(s);
    try {
      localStorage.setItem('gb.today.scope', s);
    } catch {
      /* sin almacenamiento local */
    }
  };

  const today = todayStr();
  const weekAhead = toDateStr(addDays(new Date(), 7));

  const groups = useMemo(() => {
    const mine = (t: Ticket) => (scope === 'all' ? true : scope === 'mine' ? t.assignee_id === me.id : t.assignee_id === Number(scope));
    const open = tickets.filter((t) => t.status !== 'done' && mine(t));
    const used = new Set<number>();
    const take = (list: Ticket[]) => {
      list.forEach((t) => used.add(t.id));
      return sortTickets(list);
    };
    const overdue = take(open.filter((t) => t.due_date && t.due_date < today));
    const dueToday = take(open.filter((t) => t.due_date === today));
    const followUps = take(
      open.filter((t) => !used.has(t.id) && t.status === 'waiting' && t.follow_up_date && t.follow_up_date <= today),
    );
    const upcoming = take(open.filter((t) => !used.has(t.id) && t.due_date && t.due_date > today && t.due_date <= weekAhead));
    const stale = sortTickets(
      open.filter((t) => !used.has(t.id) && daysSince(t.last_activity_at) >= STALE_DAYS),
    );
    stale.forEach((t) => used.add(t.id));
    const noDate = sortTickets(open.filter((t) => !used.has(t.id) && !t.due_date && t.status !== 'waiting'));
    const later = open.filter((t) => !used.has(t.id) && !noDate.includes(t)).length;
    const doneToday = tickets.filter((t) => t.status === 'done' && mine(t) && t.completed_at && todayStr() === toDateStr(new Date(t.completed_at)));
    return { overdue, dueToday, followUps, upcoming, stale, noDate, later, doneToday, openCount: open.length };
  }, [tickets, scope, me.id, today, weekAhead]);

  const showAssignee = scope === 'all';
  const attention = groups.overdue.length + groups.dueToday.length + groups.followUps.length;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="animate-rise">
        <p className="eyebrow flex items-center gap-1.5">
          <Sun className="size-3.5" /> {formatLongDate(today)}
        </p>
        <h1 className="mt-1 font-display text-[34px] leading-[1.05] font-semibold tracking-tight sm:text-[42px]">
          {greeting()}, {me.name.split(' ')[0]}.
        </h1>
        <p className="mt-2 max-w-2xl text-[17px] text-ink-2">
          {isLoading
            ? 'Revisando pendientes…'
            : attention === 0
              ? groups.openCount === 0
                ? 'No hay pendientes abiertos. ¡Todo al día!'
                : 'Nada vencido ni urgente para hoy. Buen momento para adelantar lo de la semana.'
              : summarySentence(groups.overdue.length, groups.dueToday.length, groups.followUps.length, scope === 'mine')}
        </p>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-line-2 bg-card p-1" role="tablist">
          <ScopeTab active={scope === 'mine'} onClick={() => setScope('mine')}>
            Mis pendientes
          </ScopeTab>
          <ScopeTab active={scope === 'all'} onClick={() => setScope('all')}>
            Todo el equipo
          </ScopeTab>
        </div>
        <div className="flex gap-1">
          {users
            .filter((u) => u.active && u.id !== me.id)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => setScope(scope === String(u.id) ? 'mine' : String(u.id))}
                className={`rounded-full p-0.5 transition-all ${scope === String(u.id) ? 'ring-2 ring-pine' : 'opacity-70 hover:opacity-100'}`}
                title={`Ver lo de ${u.name}`}
              >
                <Avatar user={u} size="md" />
              </button>
            ))}
        </div>
      </div>

      <QuickAdd />

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Vencidos" value={groups.overdue.length} tone="clay" icon={<AlertTriangle />} href="#vencidos" />
        <StatTile label="Para hoy" value={groups.dueToday.length} tone="pine" icon={<CalendarCheck />} href="#hoy" />
        <StatTile label="Seguimientos" value={groups.followUps.length} tone="amber" icon={<Hourglass />} href="#seguimientos" />
        <StatTile label="Próximos 7 días" value={groups.upcoming.length} tone="sky" icon={<Telescope />} href="#proximos" />
      </div>

      <div className="mt-8 space-y-9">
        {!isLoading && tickets.length === 0 && <Welcome />}
        {!isLoading && tickets.length > 0 && attention === 0 && <AllClear done={groups.doneToday.length} />}

        <Group
          id="vencidos"
          title="Vencidos"
          hint="Ya pasó su fecha. Termínalos o ponles una fecha nueva con «Posponer»."
          tone="clay"
          tickets={groups.overdue}
          showAssignee={showAssignee}
        />
        <Group id="hoy" title="Para hoy" tone="pine" tickets={groups.dueToday} showAssignee={showAssignee} />
        <Group
          id="seguimientos"
          title="Toca dar seguimiento"
          hint="Pendientes en espera cuya fecha de revisión ya llegó: llama, escribe o pregunta cómo va."
          tone="amber"
          tickets={groups.followUps}
          showAssignee={showAssignee}
        />
        <Group id="proximos" title="Próximos 7 días" tone="sky" tickets={groups.upcoming} showAssignee={showAssignee} />
        <Group
          id="quietos"
          title="Se están quedando quietos"
          hint={`Nadie los ha movido en ${STALE_DAYS} días o más. ¿Siguen vigentes?`}
          tone="ink"
          icon={<Moon className="size-4" />}
          tickets={groups.stale}
          showAssignee={showAssignee}
          collapsible
        />
        <Group
          id="sin-fecha"
          title="Sin fecha"
          hint="Lo que no tiene fecha es lo que más se olvida. Ábrelos y ponles una."
          tone="ink"
          tickets={groups.noDate}
          showAssignee={showAssignee}
          collapsible
          defaultOpen={false}
        />
        {groups.doneToday.length > 0 && (
          <Group
            id="terminados"
            title={`Terminados hoy (${groups.doneToday.length})`}
            tone="moss"
            tickets={groups.doneToday}
            showAssignee={showAssignee}
            collapsible
            defaultOpen={false}
          />
        )}
        {groups.later > 0 && (
          <p className="text-center text-[14px] text-ink-3">
            Y {groups.later} pendiente{groups.later === 1 ? '' : 's'} más para después. Míralos en el{' '}
            <Link to="/tablero" className="font-semibold text-pine underline">
              tablero
            </Link>{' '}
            o el{' '}
            <Link to="/calendario" className="font-semibold text-pine underline">
              calendario
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function summarySentence(overdue: number, today: number, follow: number, mine: boolean) {
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} vencido${overdue === 1 ? '' : 's'}`);
  if (today) parts.push(`${today} para hoy`);
  if (follow) parts.push(`${follow} seguimiento${follow === 1 ? '' : 's'}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
  return `${mine ? 'Tienes' : 'Hay'} ${list}. Vamos uno por uno.`;
}

function ScopeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-[14px] font-bold transition-all ${active ? 'bg-ink text-white shadow-card' : 'text-ink-2 hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

const TONES = {
  clay: { text: 'text-clay', bg: 'bg-clay-soft', bar: 'bg-clay' },
  pine: { text: 'text-pine', bg: 'bg-pine-soft', bar: 'bg-pine' },
  amber: { text: 'text-amber', bg: 'bg-amber-soft', bar: 'bg-amber' },
  sky: { text: 'text-sky', bg: 'bg-sky-soft', bar: 'bg-sky' },
  moss: { text: 'text-moss', bg: 'bg-moss-soft', bar: 'bg-moss' },
  ink: { text: 'text-ink-2', bg: 'bg-paper-2', bar: 'bg-ink-3' },
};

function StatTile({ label, value, tone, icon, href }: { label: string; value: number; tone: keyof typeof TONES; icon: ReactNode; href: string }) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      onClick={() => document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className={`group panel flex items-center gap-3 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift ${value === 0 ? 'opacity-60' : ''}`}
    >
      <span className={`flex size-10 items-center justify-center rounded-xl ${t.bg} ${t.text} [&>svg]:size-5`}>{icon}</span>
      <span>
        <span className={`block font-display text-[28px] leading-none font-semibold tabular-nums ${value ? t.text : 'text-ink-3'}`}>{value}</span>
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      </span>
    </button>
  );
}

function Group({
  id,
  title,
  hint,
  tone,
  tickets,
  showAssignee,
  collapsible = false,
  defaultOpen = true,
  icon,
}: {
  id: string;
  title: string;
  hint?: string;
  tone: keyof typeof TONES;
  tickets: Ticket[];
  showAssignee: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  icon?: ReactNode;
}) {
  const ui = useUI();
  const [open, setOpen] = useState(defaultOpen);
  if (tickets.length === 0) return null;
  const t = TONES[tone];
  return (
    <section id={id} className="scroll-mt-24">
      <button
        type="button"
        disabled={!collapsible}
        onClick={() => setOpen((o) => !o)}
        className="mb-3 flex w-full items-center gap-3 text-left disabled:cursor-default"
      >
        <span className={`h-6 w-1.5 rounded-full ${t.bar}`} />
        <h2 className={`flex items-center gap-2 font-display text-[22px] font-semibold ${tone === 'ink' ? 'text-ink' : t.text}`}>
          {icon}
          {title}
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-[13px] font-bold ${t.bg} ${t.text}`}>{tickets.length}</span>
        {collapsible && <ChevronDown className={`ml-auto size-5 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && (
        <>
          {hint && <p className="-mt-1 mb-3 pl-[18px] text-[14px] text-ink-3">{hint}</p>}
          <div className="space-y-2">
            {tickets.map((tk, i) => (
              <TicketRow key={tk.id} ticket={tk} onOpen={ui.openTicket} showAssignee={showAssignee} delay={Math.min(i, 8) * 35} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function QuickAdd() {
  const me = useCurrentUser();
  const ui = useUI();
  const create = useCreateTicket();
  const [title, setTitle] = useState('');
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    create.mutate(
      { title: t, assignee_id: me.id, due_date: todayStr() },
      {
        onSuccess: (ticket) => {
          setTitle('');
          toast.success('Anotado para hoy', {
            description: 'Ábrelo si quieres agregar cliente, pasos o notas.',
            action: { label: 'Abrir', onClick: () => ui.openTicket(ticket.id) },
          });
        },
      },
    );
  };
  return (
    <div className="mt-5 flex items-center gap-2 rounded-2xl border border-dashed border-line-2 bg-card/70 p-1.5 pl-4 transition-colors focus-within:border-pine focus-within:bg-card">
      <Sparkles className="size-5 shrink-0 text-pine" />
      <input
        className="min-h-11 flex-1 bg-transparent text-[16px] placeholder:text-ink-3 focus:outline-none"
        placeholder="Anota algo rápido para hoy…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        maxLength={200}
      />
      <button className="btn-primary" onClick={submit} disabled={!title.trim() || create.isPending}>
        <Plus className="size-4" /> <span className="hidden sm:inline">Anotar</span>
      </button>
    </div>
  );
}

function AllClear({ done }: { done: number }) {
  return (
    <div className="panel flex animate-rise flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-moss-soft text-moss">
        <PartyPopper className="size-8" />
      </span>
      <h2 className="mt-2 font-display text-2xl font-semibold">¡Todo al día!</h2>
      <p className="max-w-md text-ink-2">
        {done > 0
          ? `Hoy ya se terminaron ${done} pendiente${done === 1 ? '' : 's'}. Nada vencido ni seguimientos por hacer.`
          : 'No hay nada vencido, nada para hoy y ningún seguimiento pendiente.'}
      </p>
    </div>
  );
}

/** Primera vez que se usa: tres pasos para arrancar. */
function Welcome() {
  const me = useCurrentUser();
  const ui = useUI();
  const steps = [
    ...(me.role === 'admin'
      ? [{ title: 'Agrega a tu equipo', body: 'Crea un usuario para cada persona de la oficina.', action: <Link to="/ajustes" className="btn-secondary btn-sm">Ir a Equipo</Link> }]
      : []),
    {
      title: 'Anota el primer pendiente',
      body: 'Algo que esté pendiente hoy: una renovación, un cobro, una llamada…',
      action: (
        <button className="btn-primary btn-sm" onClick={() => ui.openNewTicket()}>
          <Plus className="size-4" /> Nuevo pendiente
        </button>
      ),
    },
    {
      title: 'Lee la guía de 1 minuto',
      body: 'Los 4 estados y cómo usar «Esperando» para que nada se olvide.',
      action: (
        <button className="btn-secondary btn-sm" onClick={() => ui.openHelp()}>
          Ver guía
        </button>
      ),
    },
  ];
  return (
    <div className="panel animate-rise p-6 sm:p-8">
      <h2 className="font-display text-[26px] font-semibold">Te damos la bienvenida a Giraboard 👋</h2>
      <p className="mt-1 text-ink-2">Aquí vivirán todos los pendientes de la oficina. Para empezar:</p>
      <ol className="mt-5 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper/50 p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pine font-bold text-white">{i + 1}</span>
            <span className="min-w-48 flex-1">
              <b className="block">{s.title}</b>
              <span className="text-[14px] text-ink-2">{s.body}</span>
            </span>
            {s.action}
          </li>
        ))}
      </ol>
    </div>
  );
}
