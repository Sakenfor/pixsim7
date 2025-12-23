/**
 * AssetGrid Component
 *
 * Reusable grid layout for gallery surfaces with preset configurations.
 */

import { type ReactNode } from 'react';

export type GridPreset = 'default' | 'compact' | 'list' | 'review' | 'cube';

export interface AssetGridProps {
  /** Child elements (MediaCards) */
  children: ReactNode;
  /** Grid preset */
  preset?: GridPreset;
  /** Custom grid columns (overrides preset) */
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  /** Gap between items (default: 4) */
  gap?: 1 | 2 | 3 | 4 | 6 | 8;
  /** Additional className */
  className?: string;
}

const presetClasses: Record<GridPreset, string> = {
  // Standard gallery: 1 -> 3 -> 4 columns
  default: 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4',
  // Compact: more items per row
  compact: 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2',
  // List: single column
  list: 'space-y-2',
  // Review: larger cards for detail
  review: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  // Cube expansion: tight grid
  cube: 'grid grid-cols-3 gap-1',
};

function buildGridClasses(columns: AssetGridProps['columns'], gap: number): string {
  const parts: string[] = ['grid'];

  if (columns?.sm) parts.push(`grid-cols-${columns.sm}`);
  else parts.push('grid-cols-1');

  if (columns?.md) parts.push(`md:grid-cols-${columns.md}`);
  if (columns?.lg) parts.push(`lg:grid-cols-${columns.lg}`);
  if (columns?.xl) parts.push(`xl:grid-cols-${columns.xl}`);

  parts.push(`gap-${gap}`);

  return parts.join(' ');
}

export function AssetGrid({
  children,
  preset = 'default',
  columns,
  gap = 4,
  className = '',
}: AssetGridProps) {
  const gridClasses = columns
    ? buildGridClasses(columns, gap)
    : presetClasses[preset];

  return <div className={`${gridClasses} ${className}`}>{children}</div>;
}

/**
 * Wrapper for individual asset cards with selection styling.
 */
export interface AssetCardWrapperProps {
  children: ReactNode;
  /** Whether this card is selected */
  isSelected?: boolean;
  /** Selection ring color */
  selectionColor?: 'blue' | 'purple' | 'green' | 'red';
  /** Click handler */
  onClick?: () => void;
  /** Additional className */
  className?: string;
}

const selectionColors = {
  blue: 'ring-blue-500',
  purple: 'ring-purple-500',
  green: 'ring-green-500',
  red: 'ring-red-500',
};

export function AssetCardWrapper({
  children,
  isSelected = false,
  selectionColor = 'blue',
  onClick,
  className = '',
}: AssetCardWrapperProps) {
  const ringClass = isSelected ? `ring-2 ${selectionColors[selectionColor]}` : '';

  return (
    <div
      className={`relative cursor-pointer group ${ringClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/**
 * Selection indicator overlay for cards.
 */
export interface SelectionIndicatorProps {
  /** Position of the indicator */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Size of the indicator */
  size?: 'sm' | 'md';
  /** Icon or content */
  children?: ReactNode;
}

export function SelectionIndicator({
  position = 'top-right',
  size = 'md',
  children = '✓',
}: SelectionIndicatorProps) {
  const positionClasses = {
    'top-right': 'top-2 right-2',
    'top-left': 'top-2 left-2',
    'bottom-right': 'bottom-2 right-2',
    'bottom-left': 'bottom-2 left-2',
  };

  const sizeClasses = {
    sm: 'w-5 h-5 text-xs',
    md: 'w-6 h-6 text-sm',
  };

  return (
    <div
      className={`absolute ${positionClasses[position]} ${sizeClasses[size]} bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg`}
    >
      {children}
    </div>
  );
}
