import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Ventanas abiertas, de la más vieja a la más nueva: Escape solo cierra la de hasta arriba. */
const layers: symbol[] = [];

export function useEscape(onEscape: () => void, enabled = true) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!enabled) return;
    const me = Symbol('capa');
    layers.push(me);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && layers[layers.length - 1] === me && !e.defaultPrevented) {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      layers.splice(layers.indexOf(me), 1);
    };
  }, [enabled]);
}

/** Evita que la página de atrás se desplace mientras hay una ventana abierta. */
export function useLockScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [enabled]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mantiene el teclado (Tab) dentro de la ventana y, al cerrarla, regresa el foco a donde estaba.
 * Si nada adentro pide el foco (autoFocus), lo pone en la ventana misma.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref, enabled]);
}

/**
 * Ventana. En computadora aparece al centro; en celular es una «hoja» que sube desde abajo,
 * queda encima del teclado y respeta la barra del sistema.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
  label,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  /** Nombre para lectores de pantalla cuando no hay título visible. */
  label?: string;
}) {
  if (!open) return null;
  return (
    <ModalInner onClose={onClose} title={title} subtitle={subtitle} footer={footer} width={width} label={label}>
      {children}
    </ModalInner>
  );
}

function ModalInner({
  onClose,
  title,
  subtitle,
  children,
  footer,
  width,
  label,
}: {
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEscape(onClose);
  useLockScroll();
  useFocusTrap(ref);
  return createPortal(
    <div className="fixed inset-x-0 top-0 bottom-[var(--kb,0px)] z-50 flex items-end justify-center sm:inset-0 sm:items-start sm:p-6 sm:pt-[8vh]">
      <div className="absolute inset-0 animate-fade bg-scrim/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
        className={`relative flex max-h-[calc(100dvh-var(--kb,0px)-12px)] w-full ${width} animate-sheet flex-col overflow-hidden rounded-t-3xl border border-line bg-card shadow-lift outline-none sm:max-h-[86dvh] sm:animate-pop sm:rounded-3xl`}
      >
        <span className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-2 sm:hidden" aria-hidden />
        {(title || subtitle) && (
          <div className="flex items-start gap-3 px-5 pt-3 pb-3 sm:px-6 sm:pt-5">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="font-display text-[22px] leading-tight font-semibold text-ink">
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-1 text-[15px] text-ink-2">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="btn-ghost btn-icon -mt-1 -mr-2" aria-label="Cerrar">
              <X className="size-5" />
            </button>
          </div>
        )}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/60 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-6 sm:pb-3.5">
            {footer}
          </div>
        )}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)] sm:hidden" />}
      </div>
    </div>,
    document.body,
  );
}
