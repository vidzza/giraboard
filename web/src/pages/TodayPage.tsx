import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { addDays } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  ChevronDown,
  Eye,
  Hourglass,
  ListChecks,
  Moon,
  PartyPopper,
  Plus,
  Send,
  Sparkles,
  Sun,
  Telescope,
  UserRoundPlus,
} from 'lucide-react';
import { STALE_DAYS, type MyStep, type Ticket } from '../../../shared/types.ts';
import { sortTickets, useCreateTicket, useCurrentUser, useMySteps, useTickets, useToggleChecklist, useUsers } from '../lib/queries.ts';
import { daysSince, formatLongDate, greeting, toDateStr, todayStr } from '../lib/dates.ts';
import { isAdmin, isLead } from '../lib/permissions.ts';
import { useStoredState, useUI } from '../lib/ui.tsx';
import { TicketRow } from '../components/TicketRow.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { AssignMenuButton } from '../components/TicketActions.tsx';
import { DueChip } from '../components/TicketBits.tsx';

type Scope = 'mine' | 'all' | `user-${number}`;

export function TodayPage() {
  const me = useCurrentUser();
  const lead = isLead(me);
  const { data: tickets = [], isLoading } = useTickets();
  const { data: steps = [] } = useMySteps();
  const { data: users = [] } = useUsers();
  const [storedScope, setScope] = useStoredState<Scope>('gb.today.scope', 'mine');
  // Versiones anteriores guardaban otro formato (p. ej. el número de la persona): si no es válido, «Lo mío».
  const scope: Scope = lead && typeof storedScope === 'string' && /^(mine|all|user-\d+)$/.test(storedScope) ? storedScope : 'mine';

  const today = todayStr();
  const weekAhead = toDateStr(addDays(new Date(), 7));

  const groups = useMemo(() => {
    const personId = scope.startsWith('user-') ? Number(scope.slice(5)) : null;
    const inScope = (t: Ticket) =>
      scope === 'all' ? t.assignee_ids.length > 0 : t.assignee_ids.includes(personId ?? me.id);
    const live = tickets.filter((t) => t.status !== 'done' && !t.archived_at);
    const open = live.filter(inScope);
    const used = new Set<number>();
    const take = (list: Ticket[]) => {
      list.forEach((t) => used.add(t.id));
      return sortTickets(list);
    };
    const overdue = take(open.filter((t) => t.due_date && t.due_date < today));
    const dueToday = take(open.filter((t) => t.due_date === today));
    const followUps = take(open.filter((t) => !used.has(t.id) && t.status === 'waiting' && t.follow_up_date && t.follow_up_date <= today));
    const upcoming = take(open.filter((t) => !used.has(t.id) && t.due_date && t.due_date > today && t.due_date <= weekAhead));
    const stale = take(open.filter((t) => !used.has(t.id) && daysSince(t.last_activity_at) >= STALE_DAYS));
    const noDate = take(open.filter((t) => !used.has(t.id) && !t.due_date && t.status !== 'waiting'));
    const later = open.filter((t) => !used.has(t.id)).length;
    const unassigned = lead ? sortTickets(live.filter((t) => t.assignee_ids.length === 0)) : [];
    // Lo que yo pedí a otras personas y sigue abierto (para darle seguimiento sin preguntar).
    const delegated = scope === 'mine' ? sortTickets(live.filter((t) => t.creator_id === me.id && !t.assignee_ids.includes(me.id) && t.assignee_ids.length > 0)) : [];
    const following = scope === 'mine' ? sortTickets(live.filter((t) => t.follower_ids.includes(me.id) && !t.assignee_ids.includes(me.id))) : [];
    const doneToday = tickets.filter((t) => t.status === 'done' && inScope(t) && t.completed_at && today === toDateStr(new Date(t.completed_at)));
    return { overdue, dueToday, followUps, upcoming, stale, noDate, later, unassigned, delegated, following, doneToday, openCount: open.length };
  }, [tickets, scope, me.id, lead, today, weekAhead]);

  const mySteps = scope === 'mine' ? steps : [];
  const showAssignee = scope === 'all';
  const attention = groups.overdue.length + groups.dueToday.length + groups.followUps.length;
  const person = scope.startsWith('user-') ? users.find((u) => u.id === Number(scope.slice(5))) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="animate-rise">
        <p className="eyebrow flex items-center gap-1.5">
          <Sun className="size-3.5" /> {formatLongDate(today)}
        </p>
        <h1 className="mt-1 font-display text-[32px] leading-[1.05] font-semibold tracking-tight sm:text-[42px]">
          {greeting()}, {me.name.split(' ')[0]}.
        </h1>
        <p className="mt-2 max-w-2xl text-[17px] text-ink-2">
          {isLoading
            ? 'Revisando pendientes…'
            : summarySentence({
                overdue: groups.overdue.length,
                today: groups.dueToday.length,
                follow: groups.followUps.length,
                steps: mySteps.length,
                unassigned: groups.unassigned.length,
                open: groups.openCount,
                who: scope === 'mine' ? 'me' : person ? person.name.split(' ')[0] : 'team',
              })}
        </p>
      </header>

      {lead && (
        <div className="scroll-row -mx-4 mt-5 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <div className="inline-flex shrink-0 rounded-xl border border-line-2 bg-card p-1" role="tablist" aria-label="De quién ver los pendientes">
            <ScopeTab active={scope === 'mine'} onClick={() => setScope('mine')}>
              Lo mío
            </ScopeTab>
            <ScopeTab active={scope === 'all'} onClick={() => setScope('all')}>
              Todo el equipo
            </ScopeTab>
          </div>
          <div className="flex shrink-0 gap-1">
            {users
              .filter((u) => u.active && u.id !== me.id)
              .map((u) => {
                const on = scope === `user-${u.id}`;
                return (
                  <button
                    key={u.id}
                    onClick={() => setScope(on ? 'mine' : `user-${u.id}`)}
                    aria-pressed={on}
                    className={`flex size-11 items-center justify-center rounded-full transition-all ${on ? 'bg-pine-soft ring-2 ring-pine' : 'opacity-75 hover:opacity-100'}`}
                    title={`Ver lo de ${u.name}`}
                    aria-label={`Ver lo de ${u.name}`}
                  >
                    <Avatar user={u} size="md" />
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {scope === 'mine' && <QuickAdd />}

      <div className="mt-5 grid grid-cols-4 gap-2 sm:gap-2.5">
        <StatTile label="Vencidos" value={groups.overdue.length} tone="clay" icon={<AlertTriangle />} target="vencidos" />
        <StatTile label="Para hoy" value={groups.dueToday.length} tone="pine" icon={<CalendarCheck />} target="hoy" />
        <StatTile label="Seguimientos" value={groups.followUps.length} tone="amber" icon={<Hourglass />} target="seguimientos" />
        <StatTile label="Próximos 7 días" value={groups.upcoming.length} tone="plum" icon={<Telescope />} target="proximos" />
      </div>

      <div className="mt-8 space-y-9">
        {!isLoading && tickets.length === 0 && <Welcome />}

        {groups.unassigned.length > 0 && (
          <Group
            id="por-asignar"
            title="Por asignar"
            hint="Nadie se ha hecho cargo de estos. Elige quién los hace para que no se queden en el aire."
            tone="ink"
            icon={<UserRoundPlus className="size-5" />}
            tickets={groups.unassigned}
            showAssignee={false}
            extra={(t) => <AssignMenuButton ticket={t} />}
          />
        )}

        {!isLoading && tickets.length > 0 && attention === 0 && groups.unassigned.length === 0 && mySteps.length === 0 && (
          <AllClear done={groups.doneToday.length} />
        )}

        <Group
          id="vencidos"
          title="Vencidos"
          hint="Ya pasó su fecha. Termínalos o ponles fecha nueva con «Posponer» (el reloj)."
          tone="clay"
          tickets={groups.overdue}
          showAssignee={showAssignee}
        />
        <Group id="hoy" title="Para hoy" tone="pine" tickets={groups.dueToday} showAssignee={showAssignee} />
        <Group
          id="seguimientos"
          title="Toca dar seguimiento"
          hint="Están en espera y ya llegó el día de revisar: llama, escribe o pregunta cómo va."
          tone="amber"
          tickets={groups.followUps}
          showAssignee={showAssignee}
        />
        {mySteps.length > 0 && <StepsGroup steps={mySteps} />}
        <Group id="proximos" title="Próximos 7 días" tone="plum" tickets={groups.upcoming} showAssignee={showAssignee} />
        <Group
          id="quietos"
          title="Se están quedando quietos"
          hint={`Nadie los ha movido en ${STALE_DAYS} días o más. ¿Siguen vigentes? Deja una nota, cámbialos de estado o archívalos.`}
          tone="ink"
          icon={<Moon className="size-5" />}
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
        <Group
          id="encargados"
          title="Lo que encargaste"
          hint="Pendientes que tú pediste y tiene otra persona. Aquí ves cómo van sin tener que preguntar."
          tone="ink"
          icon={<Send className="size-5" />}
          tickets={groups.delegated}
          showAssignee
          collapsible
          defaultOpen={false}
        />
        <Group
          id="en-copia"
          title="En copia"
          hint="No son tu responsabilidad, pero te avisan de cada cambio."
          tone="ink"
          icon={<Eye className="size-5" />}
          tickets={groups.following}
          showAssignee
          collapsible
          defaultOpen={false}
        />
        {groups.doneToday.length > 0 && (
          <Group
            id="terminados"
            title="Terminados hoy"
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

function summarySentence(c: {
  overdue: number;
  today: number;
  follow: number;
  steps: number;
  unassigned: number;
  open: number;
  who: 'me' | 'team' | string;
}) {
  const parts: string[] = [];
  if (c.overdue) parts.push(`${c.overdue} vencido${c.overdue === 1 ? '' : 's'}`);
  if (c.today) parts.push(`${c.today} para hoy`);
  if (c.follow) parts.push(`${c.follow} seguimiento${c.follow === 1 ? '' : 's'}`);
  if (c.steps) parts.push(`${c.steps} paso${c.steps === 1 ? '' : 's'} encargado${c.steps === 1 ? '' : 's'}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
  const inbox = c.unassigned ? ` Hay ${c.unassigned} por asignar.` : '';
  if (!list) {
    if (c.open === 0) return `${c.who === 'me' ? 'No tienes' : 'No hay'} pendientes abiertos. ¡Todo al día!${inbox}`;
    return `Nada vencido ni urgente para hoy. Buen momento para adelantar lo de la semana.${inbox}`;
  }
  const subject = c.who === 'me' ? 'Tienes' : c.who === 'team' ? 'El equipo tiene' : `${c.who} tiene`;
  return `${subject} ${list}.${inbox} Vamos uno por uno.`;
}

function ScopeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-10 rounded-lg px-3.5 text-[14px] font-bold whitespace-nowrap transition-all ${active ? 'bg-ink text-paper shadow-card' : 'text-ink-2 hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

const TONES = {
  clay: { text: 'text-clay', bg: 'bg-clay-soft', bar: 'bg-clay-solid' },
  pine: { text: 'text-pine', bg: 'bg-pine-soft', bar: 'bg-pine-solid' },
  amber: { text: 'text-amber', bg: 'bg-amber-soft', bar: 'bg-amber-solid' },
  plum: { text: 'text-plum', bg: 'bg-plum-soft', bar: 'bg-plum-solid' },
  moss: { text: 'text-moss', bg: 'bg-moss-soft', bar: 'bg-moss-solid' },
  ink: { text: 'text-ink-2', bg: 'bg-paper-2', bar: 'bg-ink-3' },
};

function StatTile({ label, value, tone, icon, target }: { label: string; value: number; tone: keyof typeof TONES; icon: ReactNode; target: string }) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      disabled={value === 0}
      onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className={`group panel flex min-h-[76px] flex-col items-center justify-center gap-1 px-1 py-2.5 text-center transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-lift disabled:cursor-default sm:flex-row sm:justify-start sm:gap-3 sm:p-3.5 sm:text-left ${
        value ? '' : 'opacity-80'
      }`}
    >
      <span className={`hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex [&>svg]:size-5 ${value ? `${t.bg} ${t.text}` : 'bg-paper-2 text-ink-3'}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block font-display text-[26px] leading-none font-semibold tabular-nums sm:text-[28px] ${value ? t.text : 'text-ink-3'}`}>{value}</span>
        <span className="block text-[12px] leading-tight font-semibold text-ink-2 sm:text-[13px]">{label}</span>
      </span>
    </button>
  );
}

function GroupHeader({
  title,
  count,
  tone,
  icon,
  collapsible,
  open,
  onToggle,
  controls,
}: {
  title: string;
  count: number;
  tone: keyof typeof TONES;
  icon?: ReactNode;
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  controls: string;
}) {
  const t = TONES[tone];
  const inner = (
    <>
      <span className={`h-6 w-1.5 shrink-0 rounded-full ${t.bar}`} />
      <h2 className={`flex items-center gap-2 font-display text-[21px] font-semibold sm:text-[22px] ${tone === 'ink' ? 'text-ink' : t.text}`}>
        {icon}
        {title}
      </h2>
      <span className={`rounded-full px-2 py-0.5 text-[13px] font-bold tabular-nums ${t.bg} ${t.text}`}>{count}</span>
      {collapsible && <ChevronDown className={`ml-auto size-5 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />}
    </>
  );
  return collapsible ? (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} className="mb-3 flex min-h-11 w-full items-center gap-3 text-left">
      {inner}
    </button>
  ) : (
    <div className="mb-3 flex min-h-11 items-center gap-3">{inner}</div>
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
  extra,
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
  extra?: (t: Ticket) => ReactNode;
}) {
  const ui = useUI();
  const [open, setOpen] = useState(defaultOpen);
  if (tickets.length === 0) return null;
  return (
    <section id={id} className="scroll-mt-24" aria-label={title}>
      <GroupHeader
        title={title}
        count={tickets.length}
        tone={tone}
        icon={icon}
        collapsible={collapsible}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        controls={`${id}-lista`}
      />
      {open && (
        <div id={`${id}-lista`}>
          {hint && <p className="-mt-1 mb-3 pl-[18px] text-[14px] text-ink-3">{hint}</p>}
          <div className="space-y-2">
            {tickets.map((tk, i) => (
              <TicketRow
                key={tk.id}
                ticket={tk}
                onOpen={ui.openTicket}
                showAssignee={showAssignee}
                delay={Math.min(i, 8) * 35}
                extra={extra?.(tk)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Pasos que alguien me encargó dentro de pendientes (aunque el pendiente sea de otra persona). */
function StepsGroup({ steps }: { steps: MyStep[] }) {
  const ui = useUI();
  const toggle = useToggleChecklist();
  const done = (s: MyStep) => {
    toggle.mutate({ item: { id: s.id, ticket_id: s.ticket_id }, done: true });
    toast.success(`Paso hecho: «${s.text.length > 40 ? `${s.text.slice(0, 38)}…` : s.text}»`, {
      action: { label: 'Deshacer', onClick: () => toggle.mutate({ item: { id: s.id, ticket_id: s.ticket_id }, done: false }) },
    });
  };
  return (
    <section id="pasos" className="scroll-mt-24" aria-label="Pasos que te tocan">
      <div className="mb-3 flex min-h-11 items-center gap-3">
        <span className="h-6 w-1.5 shrink-0 rounded-full bg-sky-solid" />
        <h2 className="flex items-center gap-2 font-display text-[21px] font-semibold text-sky sm:text-[22px]">
          <ListChecks className="size-5" /> Pasos que te tocan
        </h2>
        <span className="rounded-full bg-sky-soft px-2 py-0.5 text-[13px] font-bold text-sky tabular-nums">{steps.length}</span>
      </div>
      <p className="-mt-1 mb-3 pl-[18px] text-[14px] text-ink-3">Partes de un pendiente que te encargaron. Márcalas al terminar.</p>
      <ul className="panel divide-y divide-line overflow-hidden">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 sm:px-3">
            <button type="button" onClick={() => done(s)} className="flex size-11 shrink-0 items-center justify-center" aria-label={`Marcar «${s.text}» como hecho`}>
              <span className="flex size-6 items-center justify-center rounded-md border-2 border-field text-transparent hover:border-moss-solid hover:text-moss">
                <Check className="size-4" strokeWidth={3} />
              </span>
            </button>
            <button type="button" onClick={() => ui.openTicket(s.ticket_id)} className="min-w-0 flex-1 py-1 text-left">
              <span className="block text-[15px] font-semibold break-words">{s.text}</span>
              <span className="block truncate text-[13px] text-ink-3">
                #{s.ticket_id} · {s.ticket_title}
              </span>
            </button>
            {s.due_date && <DueChip date={s.due_date} />}
          </li>
        ))}
      </ul>
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
      { title: t, assignee_ids: [me.id], due_date: todayStr() },
      {
        onSuccess: (ticket) => {
          setTitle('');
          toast.success('Anotado para hoy', {
            description: 'Ábrelo si quieres agregar cliente, pasos, notas o a otra persona.',
            action: { label: 'Abrir', onClick: () => ui.openTicket(ticket.id) },
          });
        },
      },
    );
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-5 flex items-center gap-2 rounded-2xl border border-dashed border-field bg-card/70 p-1.5 pl-4 transition-colors focus-within:border-pine focus-within:bg-card"
    >
      <Sparkles className="size-5 shrink-0 text-pine" />
      <input
        className="min-h-11 min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-3 focus:outline-none"
        placeholder="Anota algo rápido para hoy…"
        aria-label="Anotar un pendiente rápido para hoy"
        enterKeyHint="done"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />
      <button className="btn-primary px-3 sm:px-4" disabled={!title.trim() || create.isPending} aria-label="Anotar">
        <Plus className="size-5" /> <span className="hidden sm:inline">Anotar</span>
      </button>
    </form>
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

/** Primera vez que se usa: pasos para arrancar. */
function Welcome() {
  const me = useCurrentUser();
  const ui = useUI();
  const steps = [
    ...(isAdmin(me)
      ? [
          {
            title: 'Agrega a tu equipo',
            body: 'Crea un usuario para cada persona y elige su rol: Coordinación reparte el trabajo; Equipo ve solo lo suyo.',
            action: (
              <Link to="/ajustes" className="btn-secondary btn-sm">
                Ir a Equipo
              </Link>
            ),
          },
        ]
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
      body: 'Los 4 estados, cómo usar «Esperando» y cómo repartir el trabajo.',
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
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pine-solid font-bold text-white">{i + 1}</span>
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

