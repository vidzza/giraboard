import { ROLES, ROLE_HINT, ROLE_LABEL, STATUSES, STATUS_HINT, STATUS_LABEL } from '../../../shared/types.ts';
import { useCurrentUser } from '../lib/queries.ts';
import { STATUS_STYLE } from '../lib/status.ts';
import { Modal } from './Modal.tsx';

const TIPS = [
  ['Todo lo que surja, anótalo', 'Si llega una llamada, un WhatsApp o un correo que deja algo pendiente, créalo aquí en ese momento. Solo hace falta el título.'],
  ['Empieza el día en «Mi día»', 'Ahí ves lo vencido, lo de hoy, los seguimientos y los pasos que te encargaron. Si algo no se alcanza, usa «Posponer» (el reloj) en vez de dejarlo vencido.'],
  ['Si dependes de alguien, usa «Esperando»', 'Anota a quién o qué esperas y cuándo volver a revisar. Ese día te aparecerá para dar seguimiento.'],
  ['Varias personas en un pendiente', 'Puedes poner a dos o más responsables: a todos les aparece y cualquiera lo marca como listo. Para repartir las partes, encarga cada paso a quien lo hará.'],
  ['«En copia» para enterarse', 'Quien está en copia ve el pendiente y recibe los avisos, pero no es su responsabilidad. Con «Avisarle a» en la bitácora también puedes llamar a alguien.'],
  ['Si no sabes quién lo hará, déjalo «Por asignar»', 'Admin y coordinación lo ven en su bandeja y lo reparten. Así nada se queda sin dueño.'],
  ['Deja notas de avance', 'En la bitácora de cada pendiente escribe qué pasó («le llamé, manda papeles el lunes»). Así cualquiera puede continuar.'],
  ['Atajos en computadora', 'Tecla N = nuevo pendiente · Tecla / = buscar · ? = esta guía · Esc = cerrar.'],
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useCurrentUser();
  return (
    <Modal open={open} onClose={onClose} title="Guía rápida" subtitle="Cómo usar Giraboard en 1 minuto" width="max-w-2xl">
      <div className="space-y-6 pb-2">
        <div>
          <p className="eyebrow mb-2">Los 4 estados de un pendiente</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {STATUSES.map((s) => {
              const st = STATUS_STYLE[s];
              const Icon = st.icon;
              return (
                <div key={s} className={`flex items-start gap-3 rounded-xl border p-3 ${st.border} ${st.bg}`}>
                  <Icon className={`mt-0.5 size-5 shrink-0 ${st.text}`} strokeWidth={2.4} />
                  <div>
                    <p className={`font-bold ${st.text}`}>{STATUS_LABEL[s]}</p>
                    <p className="text-[14px] text-ink-2">{STATUS_HINT[s]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-2">Quién ve qué</p>
          <ul className="space-y-1.5">
            {ROLES.map((r) => (
              <li key={r} className={`rounded-xl border px-3 py-2 text-[14px] ${me.role === r ? 'border-pine bg-pine-soft' : 'border-line'}`}>
                <b className={me.role === r ? 'text-pine' : ''}>{ROLE_LABEL[r]}{me.role === r ? ' (tú)' : ''}:</b>{' '}
                <span className="text-ink-2">{ROLE_HINT[r]}</span>
              </li>
            ))}
          </ul>
        </div>
        <ol className="space-y-3">
          {TIPS.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pine-solid text-[13px] font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-bold">{title}</p>
                <p className="text-[15px] text-ink-2">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
