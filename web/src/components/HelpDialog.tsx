import { STATUSES, STATUS_HINT, STATUS_LABEL } from '../../../shared/types.ts';
import { STATUS_STYLE } from '../lib/status.ts';
import { Modal } from './Modal.tsx';

const TIPS = [
  ['Todo lo que surja, anótalo', 'Si llega una llamada, un WhatsApp o un correo que deja algo pendiente, créalo aquí en ese momento. Solo hace falta el título.'],
  ['Empieza el día en «Mi día»', 'Ahí ves lo vencido, lo de hoy y los seguimientos que tocan. Si algo no se alcanza, usa «Posponer» en vez de dejarlo vencido.'],
  ['Si dependes de alguien, usa «Esperando»', 'Anota a quién o qué esperas y cuándo volver a revisar. Ese día te aparecerá para dar seguimiento.'],
  ['Deja notas de avance', 'En la bitácora de cada pendiente escribe qué pasó («le llamé, manda papeles el lunes»). Así cualquiera puede continuar.'],
  ['Divide en pasos', 'Si un pendiente tiene varias partes, agrégale pasos y verás la barra de avance en el tablero.'],
  ['Atajos', 'Tecla N = nuevo pendiente · Tecla / = buscar · Esc = cerrar.'],
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        <ol className="space-y-3">
          {TIPS.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pine text-[13px] font-bold text-white">
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
