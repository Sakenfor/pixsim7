import React from 'react';
import clsx from 'clsx';
import { useHoverExpand } from './useHoverExpand';

// ============================================================================
// Types
// ============================================================================

export interface ButtonGroupItem {
  id: string;
  icon: React.ReactNode;
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** Middle-click handler */
  onAuxClick?: (e: React.MouseEvent) => void;
  title?: string;
  disabled?: boolean;
  /** Small badge rendered at top-right corner of the button (e.g. mode indicator) */
  badge?: React.ReactNode;
  /** Content to show on hover (expands in opposite direction of layout) */
  expandContent?: React.ReactNode;
  /** Delay before showing expand content (ms) */
  expandDelay?: number;
  /** Delay before hiding expand content (ms) - allows time to move mouse to expanded content */
  collapseDelay?: number;
}

// ============================================================================
// ActionHintBadge — small corner badge for action buttons
// ============================================================================

export interface ActionHintBadgeProps {
  /** Icon node to render inside the badge (optional — omit for a plain dot) */
  icon?: React.ReactNode;
  /** Background color class. Default: 'bg-accent-muted' */
  colorClass?: string;
  /** Border color class. Default: 'border-accent-hover' */
  borderClass?: string;
  className?: string;
}

/**
 * Tiny badge indicator for action buttons.
 * Render inside a `relative` container — positions itself at top-right.
 *
 * @example
 * // Dot-only
 * <ActionHintBadge />
 * // With icon
 * <ActionHintBadge icon={<Icon name="refresh-cw" size={7} color="#fff" />} />
 */
export function ActionHintBadge({
  icon,
  colorClass = 'bg-accent-muted',
  borderClass = 'border-accent-hover',
  className,
}: ActionHintBadgeProps) {
  return (
    <span
      className={clsx(
        'absolute -top-0.5 -right-0.5 rounded-full border flex items-center justify-center pointer-events-none',
        icon ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5',
        colorClass,
        borderClass,
        className,
      )}
    >
      {icon}
    </span>
  );
}

export type ButtonGroupLayout = 'pill' | 'stack' | 'inline';
export type ButtonGroupSize = 'sm' | 'md' | 'lg';

export interface ButtonGroupProps {
  items: ButtonGroupItem[];
  /** Layout direction and shape */
  layout?: ButtonGroupLayout;
  /** Size variant */
  size?: ButtonGroupSize;
  /** Background color class (full class, e.g., 'bg-accent') */
  colorClass?: string;
  /** Hover color class (full class, e.g., 'hover:bg-accent-hover') */
  hoverClass?: string;
  /** Divider color class (full class, e.g., 'bg-accent-muted/50') */
  dividerClass?: string;
  /** Additional className for the container */
  className?: string;
  /** Gap between expand content and trigger (px) */
  expandOffset?: number;
  /** Show labels alongside icons */
  showLabels?: boolean;
}

// ============================================================================
// Size & Layout Config
// ============================================================================

const SIZE_CLASSES: Record<ButtonGroupSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-2.5 py-1.5 text-sm',
  lg: 'px-3 py-2 text-base',
};

const ICON_SIZES: Record<ButtonGroupSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

const LAYOUT_CONFIG: Record<ButtonGroupLayout, {
  container: string;
  divider: string;
  firstRounding: string;
  lastRounding: string;
  expandDirection: 'up' | 'down' | 'left' | 'right';
}> = {
  pill: {
    container: 'flex-row rounded-full',
    divider: 'w-px h-auto',
    firstRounding: 'rounded-l-full',
    lastRounding: 'rounded-r-full',
    expandDirection: 'up',
  },
  stack: {
    container: 'flex-col rounded-full',
    divider: 'h-px w-auto',
    firstRounding: 'rounded-t-full',
    lastRounding: 'rounded-b-full',
    expandDirection: 'left',
  },
  inline: {
    container: 'flex-row rounded-md',
    divider: 'w-px h-auto',
    firstRounding: 'rounded-l-md',
    lastRounding: 'rounded-r-md',
    expandDirection: 'up',
  },
};

// ============================================================================
// Main Component
// ============================================================================

/**
 * ButtonGroup - Unified button group component with multiple layouts
 *
 * Supports:
 * - Pill (horizontal, fully rounded ends)
 * - Stack (vertical, fully rounded ends)
 * - Inline (horizontal, slightly rounded)
 *
 * Features:
 * - Auto-rounding on first/last items
 * - Dividers between items
 * - Hover-expand content for any item
 * - Size variants (sm, md, lg)
 * - Color customization
 *
 * @example
 * ```tsx
 * // Horizontal pill
 * <ButtonGroup
 *   layout="pill"
 *   items={[
 *     { id: 'menu', icon: <ChevronDown />, onClick: openMenu },
 *     { id: 'action', icon: <Zap />, onClick: doAction, expandContent: <Picker /> },
 *     { id: 'quick', icon: <Sparkles />, onClick: quickGen },
 *   ]}
 * />
 *
 * // Vertical stack
 * <ButtonGroup
 *   layout="stack"
 *   items={slots.map((s, i) => ({ id: `slot-${i}`, icon: <SlotIcon /> }))}
 * />
 * ```
 */
export function ButtonGroup({
  items,
  layout = 'pill',
  size = 'md',
  colorClass = 'bg-accent',
  hoverClass = 'hover:bg-accent-hover',
  dividerClass = 'bg-accent-muted/50',
  className,
  expandOffset = 6,
  showLabels = false,
}: ButtonGroupProps) {
  if (items.length === 0) return null;

  const config = LAYOUT_CONFIG[layout];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      className={clsx(
        'flex shadow-lg',
        colorClass,
        config.container,
        className
      )}
    >
      {items.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === items.length - 1;

        return (
          <React.Fragment key={item.id}>
            {/* Divider (not before first item) */}
            {!isFirst && (
              <div className={clsx(config.divider, dividerClass)} />
            )}

            {/* Button with optional expand */}
            {item.expandContent ? (
              <ExpandableItem
                item={item}
                isFirst={isFirst}
                isLast={isLast}
                config={config}
                sizeClass={sizeClass}
                hoverClass={hoverClass}
                expandOffset={expandOffset}
                showLabels={showLabels}
              />
            ) : (
              <div className="relative">
                <button
                  onClick={item.onClick}
                  onAuxClick={item.onAuxClick}
                  disabled={item.disabled}
                  className={clsx(
                    sizeClass,
                    'text-white transition-colors flex items-center gap-1.5',
                    hoverClass,
                    isFirst && config.firstRounding,
                    isLast && config.lastRounding,
                    item.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                  title={item.title}
                  type="button"
                >
                  {item.icon}
                  {showLabels && item.label && <span>{item.label}</span>}
                </button>
                {item.badge}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// Expandable Item
// ============================================================================

interface ExpandableItemProps {
  item: ButtonGroupItem;
  isFirst: boolean;
  isLast: boolean;
  config: typeof LAYOUT_CONFIG['pill'];
  sizeClass: string;
  hoverClass: string;
  expandOffset: number;
  showLabels: boolean;
}

function ExpandableItem({
  item,
  isFirst,
  isLast,
  config,
  sizeClass,
  hoverClass,
  expandOffset,
  showLabels,
}: ExpandableItemProps) {
  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: item.expandDelay,
    collapseDelay: item.collapseDelay,
  });

  // Position expand content based on direction
  const getExpandPositionStyle = (): React.CSSProperties => {
    switch (config.expandDirection) {
      case 'up':
        return { bottom: `calc(100% + ${expandOffset}px)`, left: '50%', transform: 'translateX(-50%)' };
      case 'down':
        return { top: `calc(100% + ${expandOffset}px)`, left: '50%', transform: 'translateX(-50%)' };
      case 'left':
        return { right: `calc(100% + ${expandOffset}px)`, top: '50%', transform: 'translateY(-50%)' };
      case 'right':
        return { left: `calc(100% + ${expandOffset}px)`, top: '50%', transform: 'translateY(-50%)' };
    }
  };

  return (
    <div
      className="relative"
      {...handlers}
    >
      <button
        onClick={item.onClick}
        onAuxClick={item.onAuxClick}
        disabled={item.disabled}
        className={clsx(
          sizeClass,
          'text-white transition-colors flex items-center gap-1.5',
          hoverClass,
          isFirst && config.firstRounding,
          isLast && config.lastRounding,
          item.disabled && 'opacity-50 cursor-not-allowed'
        )}
        title={item.title}
        type="button"
      >
        {item.icon}
        {showLabels && item.label && <span>{item.label}</span>}
      </button>
      {item.badge}

      {/* Expand content */}
      {isExpanded && item.expandContent && (
        <div
          className="absolute z-50"
          style={getExpandPositionStyle()}
        >
          {item.expandContent}
        </div>
      )}
    </div>
  );
}

export default ButtonGroup;
