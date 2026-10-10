import { Circle, CircleDashed, Hourglass, CircleCheckBig, type LucideIcon } from 'lucide-react';
import type { Priority, Status } from '../../../shared/types.ts';

// Cada estado tiene su color, su ícono y su nombre: nunca se distingue solo por color.
export const STATUS_STYLE: Record<
  Status,
  { icon: LucideIcon; text: string; bg: string; dot: string; border: string; solid: string; hover: string }
> = {
  todo: {
    icon: CircleDashed,
    text: 'text-slate',
    bg: 'bg-slate-soft',
    dot: 'bg-slate-solid',
    border: 'border-slate/30',
    solid: 'bg-slate-solid text-white',
    hover: 'hover:bg-slate-soft',
  },
  doing: {
    icon: Circle,
    text: 'text-sky',
    bg: 'bg-sky-soft',
    dot: 'bg-sky-solid',
    border: 'border-sky/30',
    solid: 'bg-sky-solid text-white',
    hover: 'hover:bg-sky-soft',
  },
  waiting: {
    icon: Hourglass,
    text: 'text-amber',
    bg: 'bg-amber-soft',
    dot: 'bg-amber-solid',
    border: 'border-amber/30',
    solid: 'bg-amber-solid text-white',
    hover: 'hover:bg-amber-soft',
  },
  done: {
    icon: CircleCheckBig,
    text: 'text-moss',
    bg: 'bg-moss-soft',
    dot: 'bg-moss-solid',
    border: 'border-moss/30',
    solid: 'bg-moss-solid text-white',
    hover: 'hover:bg-moss-soft',
  },
};

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };
