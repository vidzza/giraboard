import { UserRoundPlus } from 'lucide-react';
import type { User } from '../../../shared/types.ts';
import { useUserMap } from '../lib/queries.ts';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ''))).toUpperCase();
}

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-[13px]',
  lg: 'size-12 text-base',
};

export function Avatar({
  user,
  size = 'sm',
  className = '',
  ring = false,
  title,
}: {
  user: Pick<User, 'name' | 'color'> | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: boolean;
  title?: string;
}) {
  if (!user) {
    return (
      <span
        title={title ?? 'Por asignar'}
        className={`inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-field bg-card text-ink-3 ${SIZES[size]} ${className}`}
      >
        <UserRoundPlus className="size-[55%]" strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <span
      title={title ?? user.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-white ${SIZES[size]} ${ring ? 'ring-2 ring-card' : ''} ${className}`}
      style={{ backgroundColor: user.color }}
    >
      {initials(user.name)}
    </span>
  );
}

/**
 * Responsables de un pendiente: hasta `max` caras encimadas y «+N» si hay más.
 * Sin nadie muestra el círculo punteado de «Por asignar».
 */
export function AvatarStack({
  ids,
  max = 3,
  size = 'sm',
  className = '',
}: {
  ids: number[];
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const users = useUserMap();
  if (ids.length === 0) return <Avatar user={null} size={size} className={className} />;
  const people = ids.map((id) => users.get(id)).filter((u): u is User => !!u);
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const extra = people.length - shown.length;
  const names = people.map((u) => u.name).join(', ');
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} title={names} aria-label={`Responsables: ${names}`}>
      {shown.map((u, i) => (
        <Avatar key={u.id} user={u} size={size} ring title={names} className={i > 0 ? '-ml-2' : ''} />
      ))}
      {extra > 0 && (
        <span
          className={`-ml-2 inline-flex shrink-0 items-center justify-center rounded-full bg-paper-3 font-bold text-ink-2 ring-2 ring-card ${SIZES[size]}`}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
