import type React from 'react';

import { getBaseIcon } from '@lib/icons';

type Position = 'inline' | 'tr' | 'tl' | 'br' | 'bl';
type Size = 'xs' | 'sm' | 'md';
type Shape = 'circle' | 'square';
type Tone = 'neutral' | 'success';

const positionClasses: Record<Exclude<Position, 'inline'>, string> = {
  tr: 'absolute -top-0.5 -right-0.5',
  tl: 'absolute -top-0.5 -left-0.5',
  br: 'absolute bottom-0.5 right-0.5',
  bl: 'absolute bottom-0.5 left-0.5',
};

const sizeClasses: Record<Size, string> = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
};

const shapeClasses: Record<Shape, string> = {
  circle: 'rounded-full',
  square: 'rounded-sm',
};

const toneClasses: Record<Tone, { idle: string; hover: string }> = {
  neutral: {
    idle: 'bg-neutral-700/80 text-neutral-400',
    hover: 'hover:text-neutral-100 hover:bg-neutral-600',
  },
  success: {
    idle: 'bg-emerald-500 text-emerald-950',
    hover: 'hover:bg-emerald-400',
  },
};

const defaultIconSize: Record<Size, number> = { xs: 7, sm: 9, md: 10 };

export interface NavBadgeProps {
  /** 'inline' = caller controls positioning; corner values absolutely-position relative to a `relative` parent. */
  position?: Position;
  size?: Size;
  shape?: Shape;
  tone?: Tone;
  icon?: string;
  iconSize?: number;
  title?: string;
  /** Border for separation against busy parents (e.g. on top of a colored icon). */
  ring?: boolean;
  /** Fades in only when an ancestor with class `group/navbtn` is hovered. Pair with `onClick`. */
  hoverGated?: boolean;
  /** When provided, the badge renders as <button>. Otherwise it's a <span>. */
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  ariaLabel?: string;
}

export function NavBadge({
  position = 'inline',
  size = 'md',
  shape = 'square',
  tone = 'neutral',
  icon,
  iconSize,
  title,
  ring = false,
  hoverGated = false,
  onClick,
  className = '',
  ariaLabel,
}: NavBadgeProps) {
  const Icon = icon ? getBaseIcon(icon) : null;
  const interactive = !!onClick;
  const tones = toneClasses[tone];

  const layoutCls =
    position === 'inline' ? 'inline-flex' : `${positionClasses[position]} flex`;

  const classes = [
    layoutCls,
    'items-center justify-center',
    sizeClasses[size],
    shapeClasses[shape],
    tones.idle,
    interactive ? `transition-colors ${tones.hover}` : '',
    ring ? 'border border-neutral-900/80' : '',
    hoverGated ? 'opacity-0 group-hover/navbtn:opacity-100 transition-opacity' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = Icon ? <Icon size={iconSize ?? defaultIconSize[size]} strokeWidth={2} /> : null;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={classes}
        title={title}
        aria-label={ariaLabel ?? title}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={classes} title={title} aria-label={ariaLabel ?? title}>
      {content}
    </span>
  );
}
