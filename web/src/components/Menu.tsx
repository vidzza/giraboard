import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../lib/ui.tsx';
import { useEscape, useFocusTrap } from './Modal.tsx';

/**
 * Menú desplegable. En computadora se abre junto al botón; en celular sube como hoja desde abajo,
 * con opciones grandes para el pulgar. Se cierra al tocar fuera o con Escape.
 */
export function Menu({
  trigger,
  children,
  align = 'right',
  width = 'w-60',
  direction = 'down',
  title,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
  direction?: 'down' | 'up';
  /** Título de la hoja en celular (opcional). */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile('(max-width: 639px)');
  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open &&
        (mobile ? (
          <MenuSheet title={title} onClose={close}>
            {children(close)}
          </MenuSheet>
        ) : (
          <MenuPopover anchor={ref} width={width} align={align} direction={direction} onClose={close}>
            {children(close)}
          </MenuPopover>
        ))}
    </div>
  );
}

/**
 * Menú flotante en computadora. Vive fuera de los paneles (portal) para que nunca quede recortado
 * por una columna o un panel con desplazamiento, y se voltea hacia arriba si abajo no cabe.
 */
function MenuPopover({
  anchor,
  width,
  align,
  direction,
  onClose,
  children,
}: {
  anchor: RefObject<HTMLDivElement | null>;
  width: string;
  align: 'left' | 'right';
  direction: 'down' | 'up';
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number; visible: boolean }>({ top: 0, left: 0, maxHeight: 400, visible: false });
  useEscape(onClose);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const m = ref.current;
      if (!a || !m) return;
      const gap = 6;
      const w = m.offsetWidth;
      const h = m.scrollHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const below = vh - a.bottom - gap - 8;
      const above = a.top - gap - 8;
      const up = direction === 'up' ? above > Math.min(h, 200) || above > below : below < Math.min(h, 240) && above > below;
      const left = Math.min(Math.max(8, align === 'right' ? a.right - w : a.left), vw - w - 8);
      const maxHeight = Math.max(160, Math.min(520, up ? above : below));
      const top = up ? Math.max(8, a.top - gap - Math.min(h, maxHeight)) : a.bottom + gap;
      setPos({ top, left, maxHeight, visible: true });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, align, direction]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight, visibility: pos.visible ? 'visible' : 'hidden' }}
      className={`scroll-thin fixed z-[60] animate-pop overflow-y-auto overscroll-contain rounded-2xl border border-line bg-card p-1.5 shadow-lift ${width}`}
    >
      {children}
    </div>,
    document.body,
  );
}

function MenuSheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useFocusTrap(ref);
  return createPortal(
    <div className="fixed inset-x-0 top-0 bottom-[var(--kb,0px)] z-[60] flex items-end" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 animate-fade bg-scrim/45" onClick={onClose} />
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        aria-label={title}
        className="relative max-h-[80dvh] w-full animate-sheet overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-card px-2 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] shadow-lift outline-none"
      >
        <span className="mx-auto mb-1 block h-1.5 w-10 rounded-full bg-line-2" aria-hidden />
        {title && <p className="px-3 pt-2 pb-2 font-display text-[19px] leading-snug font-semibold">{title}</p>}
        {children}
        <button type="button" onClick={onClose} className="btn-secondary mt-2 w-full">
          Cerrar
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function MenuItem({
  onClick,
  children,
  danger,
  icon,
  active,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium transition-colors disabled:opacity-50 touch:min-h-12 ${
        danger ? 'text-clay hover:bg-clay-soft' : active ? 'bg-pine-soft text-pine' : 'text-ink hover:bg-paper-2'
      }`}
    >
      {icon && <span className={`[&>svg]:size-[18px] ${danger ? '' : active ? 'text-pine' : 'text-ink-3'}`}>{icon}</span>}
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  // En celular el menú es una hoja con su propio título; ahí no hace falta repetirlo.
  return <p className="eyebrow px-3 pt-1.5 pb-1 max-sm:hidden">{children}</p>;
}
