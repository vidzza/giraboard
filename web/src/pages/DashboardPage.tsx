import { useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Hourglass, Inbox, Moon, Table2, BarChart3, UserRoundPlus } from 'lucide-react';
import { STALE_DAYS } from '../../../shared/types.ts';
import { sortTickets, useActivity, useCategoryMap, useStats, useTickets, useUserMap } from '../lib/queries.ts';
import { describeActivity } from '../lib/activity.ts';
import { parseDay, timeAgo } from '../lib/dates.ts';
import { useUI } from '../lib/ui.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { TicketRow } from '../components/TicketRow.tsx';
import { AssignMenuButton } from '../components/TicketActions.tsx';

// Colores de la gráfica: verde = terminados (como «Listo»), morado = nuevos. Con contraste ≥ 3:1 en modo claro y oscuro.
const SERIES = {
  done: { color: 'var(--color-chart-done)', label: 'Terminados' },
  created: { color: 'var(--color-chart-new)', label: 'Nuevos' },
};

export function DashboardPage() {
  const ui = useUI();
  const { data: stats, isLoading, error } = useStats();
  const { data: tickets = [] } = useTickets();
  const unassigned = sortTickets(tickets.filter((t) => t.status !== 'done' && !t.archived_at && t.assignee_ids.length === 0));
  const users = useUserMap();
  const categories = useCategoryMap();

  if (error) return <p className="text-ink-2">{error.message}</p>;
  if (isLoading || !stats) return <p className="text-ink-3">Cargando resumen…</p>;

  const maxOpen = Math.max(1, ...stats.per_user.map((u) => u.open));
  const catRows = stats.per_category
    .map((c) => ({ ...c, cat: c.category_id ? categories.get(c.category_id) : null }))
    .sort((a, b) => b.open - a.open);
  const maxCat = Math.max(1, ...catRows.map((c) => c.open));

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="eyebrow">Cómo va el negocio</p>
        <h1 className="page-title">Resumen</h1>
        <p className="mt-1 text-ink-2">
          Semana del {format(parseDay(stats.weekly[stats.weekly.length - 1].week_start), "d 'de' MMMM", { locale: es })}
        </p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Abiertos" value={stats.open} icon={<Inbox />} tone="text-ink" bg="bg-paper-2" />
        <Kpi label="Por asignar" value={stats.unassigned} icon={<UserRoundPlus />} tone={stats.unassigned ? 'text-clay' : 'text-ink-2'} bg="bg-paper-2" href="#por-asignar" />
        <Kpi label="Vencidos" value={stats.overdue} icon={<AlertTriangle />} tone="text-clay" bg="bg-clay-soft" />
        <Kpi label="En espera" value={stats.waiting} sub={stats.follow_ups ? `${stats.follow_ups} por revisar hoy` : undefined} icon={<Hourglass />} tone="text-amber" bg="bg-amber-soft" />
        <Kpi label={`Quietos ${STALE_DAYS}+ días`} value={stats.stale} icon={<Moon />} tone="text-ink-2" bg="bg-paper-2" />
        <Kpi label="Terminados esta semana" value={stats.done_week} icon={<CheckCircle2 />} tone="text-moss" bg="bg-moss-soft" />
      </div>

      {unassigned.length > 0 && (
        <section id="por-asignar" className="mt-5 scroll-mt-24">
          <Card title="Por asignar" subtitle="Nadie se ha hecho cargo de estos. Elige quién los hace.">
            <div className="space-y-2">
              {unassigned.map((t) => (
                <TicketRow key={t.id} ticket={t} onOpen={ui.openTicket} extra={<AssignMenuButton ticket={t} />} />
              ))}
            </div>
          </Card>
        </section>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Card title="Carga de cada persona" subtitle="Pendientes abiertos ahorita">
          <div className="space-y-3.5">
            {stats.per_user.map((row) => {
              const u = users.get(row.user_id);
              if (!u) return null;
              return (
                <div key={row.user_id} className="flex items-center gap-3">
                  <Avatar user={u} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold">{u.name}</span>
                      <span className="text-[13px] text-ink-3">
                        {row.done_week} terminado{row.done_week === 1 ? '' : 's'} esta semana
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex h-2.5 flex-1 gap-[2px] overflow-hidden rounded-full bg-paper-3">
                        {row.overdue > 0 && (
                          <div className="h-full rounded-l-full bg-clay-solid" style={{ width: `${(row.overdue / maxOpen) * 100}%` }} title={`${row.overdue} vencidos`} />
                        )}
                        <div
                          className="h-full rounded-r-full bg-pine-solid"
                          style={{ width: `${((row.open - row.overdue) / maxOpen) * 100}%` }}
                          title={`${row.open - row.overdue} al corriente`}
                        />
                      </div>
                      <span className="w-24 text-right text-[13px] font-bold text-ink-2 tabular-nums">
                        {row.open} abiertos
                      </span>
                    </div>
                    {(row.overdue > 0 || row.waiting > 0) && (
                      <p className="mt-1 text-[12px] font-semibold">
                        {row.overdue > 0 && <span className="text-clay">{row.overdue} vencidos</span>}
                        {row.overdue > 0 && row.waiting > 0 && <span className="text-ink-3"> · </span>}
                        {row.waiting > 0 && <span className="text-amber">{row.waiting} en espera</span>}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 border-t border-line pt-3 text-[12px] font-semibold text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-clay-solid" /> Vencidos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-pine-solid" /> Al corriente
            </span>
          </div>
        </Card>

        <WeeklyChart weekly={stats.weekly} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Esperando respuesta" subtitle="Los que llevan más tiempo esperando, primero">
          {stats.waiting_tickets.length === 0 ? (
            <Empty>Nada en espera.</Empty>
          ) : (
            <div className="space-y-2">
              {stats.waiting_tickets.map((t) => (
                <TicketRow key={t.id} ticket={t} onOpen={ui.openTicket} showAssignee showStatus={false} />
              ))}
            </div>
          )}
        </Card>
        <Card title="Se están quedando quietos" subtitle={`Sin ningún movimiento en ${STALE_DAYS} días o más`}>
          {stats.stale_tickets.length === 0 ? (
            <Empty>Todo se está moviendo. 👏</Empty>
          ) : (
            <div className="space-y-2">
              {stats.stale_tickets.map((t) => (
                <TicketRow key={t.id} ticket={t} onOpen={ui.openTicket} showAssignee />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Abiertos por tipo">
          <div className="space-y-2.5">
            {catRows.length === 0 && <Empty>No hay pendientes abiertos.</Empty>}
            {catRows.map((c) => (
              <div key={c.category_id ?? 'none'} className="flex items-center gap-3">
                <span className="w-36 truncate text-[14px] font-semibold">{c.cat?.name ?? 'Sin tipo'}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-3">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(c.open / maxCat) * 100}%`, backgroundColor: c.cat?.color ?? 'var(--color-ink-3)' }}
                  />
                </div>
                <span className="w-8 text-right text-[14px] font-bold text-ink-2 tabular-nums">{c.open}</span>
              </div>
            ))}
          </div>
        </Card>
        <ActivityFeed />
      </div>
    </div>
  );
}

function Card({ title, subtitle, children, aside }: { title: string; subtitle?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-start gap-3">
        <div>
          <h2 className="font-display text-[20px] font-semibold">{title}</h2>
          {subtitle && <p className="text-[13px] text-ink-3">{subtitle}</p>}
        </div>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-2 px-4 py-6 text-center text-[14px] text-ink-3">{children}</p>;
}

function Kpi({ label, value, icon, tone, bg, sub, href }: { label: string; value: number; icon: ReactNode; tone: string; bg: string; sub?: string; href?: string }) {
  const Tag = href && value ? 'a' : 'div';
  return (
    <Tag href={href && value ? href : undefined} className={`panel block p-4 ${href && value ? 'transition-shadow hover:shadow-lift' : ''}`}>
      <span className={`flex size-9 items-center justify-center rounded-xl ${bg} ${tone} [&>svg]:size-[18px]`}>{icon}</span>
      <p className={`mt-3 font-display text-[32px] leading-none font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[13px] font-semibold text-ink-2">{label}</p>
      {sub && <p className="text-[12px] font-bold text-amber">{sub}</p>}
    </Tag>
  );
}

/** Barras agrupadas por semana: terminados vs. nuevos. Con tooltip y vista de tabla. */
function WeeklyChart({ weekly }: { weekly: { week_start: string; done: number; created: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(4, ...weekly.flatMap((w) => [w.done, w.created]));
  const niceMax = Math.ceil(max / 4) * 4;
  const ticks = [0, niceMax / 2, niceMax];
  const H = 180;
  const label = (ws: string) => format(parseDay(ws), 'd MMM', { locale: es }).replace('.', '');

  return (
    <Card
      title="Ritmo de trabajo"
      subtitle="Pendientes nuevos y terminados por semana (últimas 8)"
      aside={
        <button className="btn-ghost btn-sm whitespace-nowrap" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
          {asTable ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      }
    >
      <div className="mb-3 flex gap-4 text-[13px] font-semibold text-ink-2">
        {(['done', 'created'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES[k].color }} />
            {SERIES[k].label}
          </span>
        ))}
      </div>
      {asTable ? (
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left text-[12px] tracking-wider text-ink-3 uppercase">
              <th className="py-1.5 font-bold">Semana del</th>
              <th className="py-1.5 text-right font-bold">Nuevos</th>
              <th className="py-1.5 text-right font-bold">Terminados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {weekly.map((w) => (
              <tr key={w.week_start}>
                <td className="py-1.5">{label(w.week_start)}</td>
                <td className="py-1.5 text-right tabular-nums">{w.created}</td>
                <td className="py-1.5 text-right font-bold tabular-nums">{w.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative flex gap-2">
          <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-ink-3 tabular-nums" style={{ height: H + 24 }}>
            {[...ticks].reverse().map((t) => (
              <span key={t} className="-translate-y-1.5">
                {t}
              </span>
            ))}
          </div>
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: H }}>
              {ticks.map((t) => (
                <div key={t} className="absolute inset-x-0 border-t border-line/80" style={{ bottom: `${(t / niceMax) * 100}%` }} />
              ))}
            </div>
            <div className="relative grid grid-cols-8 gap-1" style={{ height: H }}>
              {weekly.map((w, i) => (
                <div
                  key={w.week_start}
                  className={`relative flex items-end justify-center gap-[2px] rounded-md ${hover === i ? 'bg-paper-2/80' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {(['done', 'created'] as const).map((k) => (
                    <div
                      key={k}
                      className="w-[38%] max-w-4 rounded-t-[4px] transition-[height] duration-500"
                      style={{ height: `${(w[k] / niceMax) * 100}%`, minHeight: w[k] ? 3 : 0, backgroundColor: SERIES[k].color }}
                    />
                  ))}
                  {hover === i && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-2 w-36 rounded-xl border border-line bg-card p-2.5 text-[13px] shadow-lift">
                      <p className="font-bold">Semana del {label(w.week_start)}</p>
                      {(['created', 'done'] as const).map((k) => (
                        <p key={k} className="mt-0.5 flex items-center gap-1.5 text-ink-2">
                          <span className="size-2 rounded-sm" style={{ backgroundColor: SERIES[k].color }} />
                          {SERIES[k].label}
                          <b className="ml-auto text-ink tabular-nums">{w[k]}</b>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-8 gap-1 text-center text-[11px] font-semibold text-ink-3">
              {weekly.map((w, i) => (
                <span key={w.week_start} className={i === weekly.length - 1 ? 'text-ink' : ''}>
                  {i === weekly.length - 1 ? 'Esta' : label(w.week_start)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ActivityFeed() {
  const ui = useUI();
  const { data = [] } = useActivity();
  const users = useUserMap();
  const categories = useCategoryMap();
  return (
    <Card title="Lo último que pasó" subtitle="Todo lo que hace el equipo queda registrado">
      <ol className="scroll-thin max-h-[440px] space-y-3 overflow-y-auto pr-1">
        {data.length === 0 && <Empty>Aún no hay movimientos.</Empty>}
        {data.map((a) => (
          <li key={a.id} className="flex gap-3">
            <Avatar user={a.user_id ? users.get(a.user_id) : null} size="sm" />
            <div className="min-w-0 text-[14px] leading-snug">
              <p className="text-ink-2">
                <b className="font-semibold text-ink">{a.user_id ? (users.get(a.user_id)?.name ?? 'Alguien') : 'Sistema'}</b>{' '}
                {describeActivity(a, users, categories)}
              </p>
              {a.ticket_id && (
                <button className="block max-w-full truncate text-left font-semibold text-pine hover:underline" onClick={() => ui.openTicket(a.ticket_id!)}>
                  #{a.ticket_id} {a.ticket_title}
                </button>
              )}
              <span className="text-[12px] text-ink-3">{timeAgo(a.created_at)}</span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
