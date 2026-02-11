import React from 'react';
import clsx from 'clsx';

export interface ThumbnailGridItem {
  id: string | number;
  thumbnailUrl: string;
  label?: string;
}

export interface ThumbnailGridProps {
  /** Items to display in grid */
  items: ThumbnailGridItem[];
  /** Currently active/selected index */
  activeIndex?: number;
  /** Callback when item is clicked */
  onSelect?: (index: number, item: ThumbnailGridItem) => void;
  /** Number of columns (default: 3) */
  columns?: 2 | 3 | 4 | 5;
  /** Thumbnail size preset (default: 'sm') */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Custom thumbnail size in pixels (overrides size preset) */
  thumbSize?: number;
  /** Show index numbers on thumbnails */
  showNumbers?: boolean;
  /** Use 1-based numbering (default: true) */
  oneIndexed?: boolean;
  /** Additional class name */
  className?: string;
  /** Render as popup (adds positioning styles) */
  popup?: boolean;
  /** Gap between items (default: 1 = gap-1) */
  gap?: 0 | 1 | 2;
}

const columnClasses: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

const gapClasses: Record<number, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
};

const sizeClasses: Record<string, string> = {
  xs: 'w-7 h-7',
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

const numberSizeClasses: Record<string, string> = {
  xs: 'text-[7px]',
  sm: 'text-[8px]',
  md: 'text-[9px]',
  lg: 'text-[10px]',
};

export function ThumbnailGrid({
  items,
  activeIndex,
  onSelect,
  columns = 3,
  size = 'sm',
  thumbSize,
  showNumbers = true,
  oneIndexed = true,
  className,
  popup = false,
  gap = 1,
}: ThumbnailGridProps) {
  if (items.length === 0) return null;

  // Determine font size for numbers based on thumbSize or size preset
  const getNumberFontSize = () => {
    if (thumbSize) {
      if (thumbSize <= 28) return 'text-[7px]';
      if (thumbSize <= 36) return 'text-[8px]';
      if (thumbSize <= 48) return 'text-[9px]';
      return 'text-[10px]';
    }
    return numberSizeClasses[size];
  };

  return (
    <div
      className={clsx(
        'grid',
        gapClasses[gap],
        columnClasses[columns],
        popup && 'p-1.5 bg-neutral-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-neutral-700',
        className
      )}
    >
      {items.map((item, idx) => {
        const displayNumber = oneIndexed ? idx + 1 : idx;
        const isActive = activeIndex !== undefined && idx === activeIndex;

        return (
          <button
            key={item.id}
            onClick={() => onSelect?.(idx, item)}
            className={clsx(
              'relative rounded overflow-hidden',
              !thumbSize && sizeClasses[size],
              isActive
                ? 'ring-2 ring-accent'
                : 'hover:ring-2 hover:ring-white/50'
            )}
            style={thumbSize ? { width: thumbSize, height: thumbSize } : undefined}
            title={item.label}
          >
            <img
              src={item.thumbnailUrl}
              alt={item.label || `Item ${displayNumber}`}
              className="w-full h-full object-cover"
            />
            {showNumbers && (
              <span
                className={clsx(
                  'absolute bottom-0 right-0 bg-black/70 text-white px-1',
                  getNumberFontSize()
                )}
              >
                {displayNumber}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
