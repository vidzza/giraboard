import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';

/** Área de texto que crece con el contenido. */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const { minRows = 1, className = '', ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} {...rest} className={`resize-none overflow-hidden ${className}`} />;
}

/**
 * Texto que se guarda solo al salir del campo. Mientras se escribe no lo pisan
 * los cambios que llegan del servidor.
 */
export function EditableText({
  value,
  onSave,
  className = '',
  placeholder,
  multiline = false,
  minRows = 1,
  allowEmpty = true,
  autoFocus,
  maxLength,
  label,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  minRows?: number;
  allowEmpty?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  /** Nombre del campo para lectores de pantalla. */
  label?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = () => {
    focused.current = false;
    const next = multiline ? draft : draft.trim();
    if (!allowEmpty && !next.trim()) {
      setDraft(value);
      return;
    }
    if (next !== value) onSave(next);
  };

  return (
    <AutoTextarea
      value={draft}
      minRows={minRows}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={maxLength}
      aria-label={label}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(multiline ? e.target.value : e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(value);
          focused.current = false;
          setTimeout(() => (e.target as HTMLTextAreaElement).blur());
        }
      }}
      className={className}
    />
  );
}
