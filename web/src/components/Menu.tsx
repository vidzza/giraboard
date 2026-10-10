import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Menú desplegable sencillo: se cierra al hacer clic fuera o con Escape. */
export function Menu({
  trigger,
  children,
  align = 'right',
  width = 'w-60',
  direction = 'down',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
  direction?: 'down' | 'up';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={`absolute z-40 ${direction === 'down' ? 'top-full mt-1.5' : 'bottom-full mb-3'} ${width} animate-pop overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-lift ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  danger,
  icon,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium transition-colors ${
        danger ? 'text-clay hover:bg-clay-soft' : 'text-ink hover:bg-paper-2'
      }`}
    >
      {icon && <span className="text-ink-3 [&>svg]:size-[18px]">{icon}</span>}
      {children}
    </button>
  );
}
