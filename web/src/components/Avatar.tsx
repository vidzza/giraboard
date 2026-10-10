import type { User } from '../../../shared/types.ts';

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
}: {
  user: Pick<User, 'name' | 'color'> | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: boolean;
}) {
  if (!user) {
    return (
      <span
        title="Sin asignar"
        className={`inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-ink-3/60 text-ink-3 ${SIZES[size]} ${className}`}
      >
        ?
      </span>
    );
  }
  return (
    <span
      title={user.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-white ${SIZES[size]} ${ring ? 'ring-2 ring-card' : ''} ${className}`}
      style={{ backgroundColor: user.color }}
    >
      {initials(user.name)}
    </span>
  );
}
