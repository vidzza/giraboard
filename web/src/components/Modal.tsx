import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function useEscape(onEscape: () => void, enabled = true) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEscape(onClose, open);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:p-6 sm:pt-[8vh]">
      <div className="absolute inset-0 animate-fade bg-ink/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[92dvh] w-full ${width} animate-pop flex-col overflow-hidden rounded-t-3xl border border-line bg-card shadow-lift sm:rounded-3xl`}
      >
        {(title || subtitle) && (
          <div className="flex items-start gap-3 px-6 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              {title && <h2 className="font-display text-[22px] font-semibold leading-tight text-ink">{title}</h2>}
              {subtitle && <p className="mt-1 text-[15px] text-ink-2">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="btn-ghost -mr-2 size-10 px-0" aria-label="Cerrar">
              <X className="size-5" />
            </button>
          </div>
        )}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
