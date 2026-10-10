import { Circle, CircleDashed, Hourglass, CircleCheckBig, type LucideIcon } from 'lucide-react';
import type { Priority, Status } from '../../../shared/types.ts';

export const STATUS_STYLE: Record<
  Status,
  { icon: LucideIcon; text: string; bg: string; dot: string; border: string; solid: string; hover: string }
> = {
  todo: {
    icon: CircleDashed,
    text: 'text-slate',
    bg: 'bg-slate-soft',
    dot: 'bg-slate',
    border: 'border-slate/30',
    solid: 'bg-slate text-white',
    hover: 'hover:bg-slate-soft',
  },
  doing: {
    icon: Circle,
    text: 'text-sky',
    bg: 'bg-sky-soft',
    dot: 'bg-sky',
    border: 'border-sky/30',
    solid: 'bg-sky text-white',
    hover: 'hover:bg-sky-soft',
  },
  waiting: {
    icon: Hourglass,
    text: 'text-amber',
    bg: 'bg-amber-soft',
    dot: 'bg-amber',
    border: 'border-amber/30',
    solid: 'bg-amber text-white',
    hover: 'hover:bg-amber-soft',
  },
  done: {
    icon: CircleCheckBig,
    text: 'text-moss',
    bg: 'bg-moss-soft',
    dot: 'bg-moss',
    border: 'border-moss/30',
    solid: 'bg-moss text-white',
    hover: 'hover:bg-moss-soft',
  },
};

export const PRIORITY_STYLE: Record<Priority, { text: string; bg: string } | null> = {
  normal: null,
  high: { text: 'text-amber', bg: 'bg-amber-soft' },
  urgent: { text: 'text-clay', bg: 'bg-clay-soft' },
};

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };
