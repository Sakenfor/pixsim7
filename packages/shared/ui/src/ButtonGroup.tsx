import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useHoverExpand } from './useHoverExpand';
import { PortalFloat, type AnchorPlacement } from './PortalFloat';

// ============================================================================
// Types
// ============================================================================

export interface ButtonGroupItem {
  id: string;
  icon: React.ReactNode;
  label?: string;
  /** Additional className applied to this item's button element */
  buttonClassName?: string;
  /** Inline style applied to this item's button element */
  buttonStyle?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  /** Middle-click handler */
  onAuxClick?: (e: React.MouseEvent) => void;
  title?: string;
  disabled?: boolean;
  /** Right-click handler */
  onContextMenu?: (e: React.MouseEvent) => void;
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
  /** Render expand content in a portal to escape overflow/stacking-context constraints */
  portal?: boolean;
  /**
   * Enable mouse-wheel cycling through items (useful when the group is wider
   * than compact cards). Cycles one item per wheel step.
   */
  wheelCycle?: boolean;
  /**
   * Enable responsive windowing of visible items based on nearest `.cq-scale`
   * container width. Intended for compact media-card overlays.
   */
  responsiveVisible?: boolean;
  /** Optional fixed visible-item count (overrides responsiveVisible). */
  visibleCount?: number;
  /**
   * When windowing is active, start with a window that includes this item id
   * (centered when possible). Useful for keeping a primary action visible.
   */
  preferredVisibleId?: string;
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
  expandDirection: AnchorPlacement;
}> = {
  pill: {
    container: 'flex-row rounded-full',
    divider: 'w-px h-auto',
    firstRounding: 'rounded-l-full',
    lastRounding: 'rounded-r-full',
    expandDirection: 'top',
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
    expandDirection: 'top',
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
  portal = false,
  wheelCycle = false,
  responsiveVisible = false,
  visibleCount,
  preferredVisibleId,
}: ButtonGroupProps) {
  if (items.length === 0) return null;

  const config = LAYOUT_CONFIG[layout];
  const sizeClass = SIZE_CLASSES[size];
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [hasResponsiveHost, setHasResponsiveHost] = useState(false);
  const [windowOffset, setWindowOffset] = useState(0);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const itemIdsSignature = useMemo(() => itemIds.join('|'), [itemIds]);

  useEffect(() => {
    if (!responsiveVisible || !rootRef.current) return;

    const host = rootRef.current.closest('.cq-scale') as HTMLElement | null;
    if (!host) {
      setHasResponsiveHost(false);
      setContainerWidth(0);
      return;
    }

    setHasResponsiveHost(true);

    const update = () => {
      setContainerWidth(host.clientWidth || 0);
    };

    update();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [responsiveVisible]);

  const resolvedVisibleCount = useMemo(() => {
    if (typeof visibleCount === 'number') {
      return Math.max(1, Math.min(items.length, Math.floor(visibleCount)));
    }
    if (!responsiveVisible || !hasResponsiveHost || containerWidth <= 0) {
      return items.length;
    }
    if (containerWidth < 78) return Math.min(items.length, 1);
    if (containerWidth < 112) return Math.min(items.length, 2);
    if (containerWidth < 152) return Math.min(items.length, 3);
    if (containerWidth < 188) return Math.min(items.length, 4);
    return items.length;
  }, [visibleCount, responsiveVisible, hasResponsiveHost, containerWidth, items.length]);

  useEffect(() => {
    if (resolvedVisibleCount >= items.length) {
      setWindowOffset(0);
      return;
    }
    if (!preferredVisibleId) {
      setWindowOffset(0);
      return;
    }

    const preferredIndex = itemIds.findIndex((id) => id === preferredVisibleId);
    if (preferredIndex < 0) {
      setWindowOffset(0);
      return;
    }

    const centered = preferredIndex - Math.floor(resolvedVisibleCount / 2);
    const normalized = ((centered % items.length) + items.length) % items.length;
    setWindowOffset(normalized);
  }, [itemIdsSignature, items.length, preferredVisibleId, resolvedVisibleCount]);

  const renderedItems = useMemo(() => {
    if (!wheelCycle || resolvedVisibleCount >= items.length) {
      return items;
    }

    const next: ButtonGroupItem[] = [];
    for (let i = 0; i < resolvedVisibleCount; i += 1) {
      next.push(items[(windowOffset + i) % items.length]);
    }
    return next;
  }, [items, wheelCycle, resolvedVisibleCount, windowOffset]);

  // Use ref-based wheel listener with { passive: false } so preventDefault works
  // (React registers onWheel/onWheelCapture as passive, making preventDefault a no-op).
  const wheelCycleEnabled = wheelCycle && resolvedVisibleCount < items.length;
  const wheelCycleEnabledRef = useRef(wheelCycleEnabled);
  wheelCycleEnabledRef.current = wheelCycleEnabled;
  const itemsLengthRef = useRef(items.length);
  itemsLengthRef.current = items.length;

  // Track scroll direction for bracket bob animation
  const [scrollDir, setScrollDir] = useState<-1 | 0 | 1>(0);
  const scrollDirTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const handler = (event: WheelEvent) => {
      if (!wheelCycleEnabledRef.current) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 1) return;

      event.preventDefault();
      event.stopPropagation();

      const step = delta > 0 ? 1 : -1;
      const len = itemsLengthRef.current;
      setWindowOffset((prev) => {
        const next = prev + step;
        if (next < 0) return len - 1;
        if (next >= len) return 0;
        return next;
      });

      // Bob the brackets in scroll direction
      setScrollDir(step as 1 | -1);
      clearTimeout(scrollDirTimerRef.current);
      scrollDirTimerRef.current = setTimeout(() => setScrollDir(0), 200);
    };

    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => {
      el.removeEventListener('wheel', handler, { capture: true });
      clearTimeout(scrollDirTimerRef.current);
    };
  }, []);

  const isWindowed = wheelCycle && resolvedVisibleCount < items.length;
  const isHorizontal = layout === 'pill' || layout === 'inline';

  return (
    <div
      ref={rootRef}
      className={clsx(
        'flex shadow-lg relative',
        colorClass,
        config.container,
        isWindowed && 'cursor-ew-resize',
        className
      )}
    >
      {/* Scroll indicators — brackets showing more items exist */}
      {isWindowed && (
        <>
          {/* Scroll indicators — SVG arcs matching the pill's rounded-full curvature */}
          <svg
            className={clsx(
              'absolute pointer-events-none z-10 text-accent-hover overflow-visible transition-transform duration-200 ease-out',
              isHorizontal
                ? '-left-1.5 inset-y-0 h-full w-1.5'
                : 'inset-x-0 -top-1.5 w-full h-1.5',
            )}
            style={{
              transform: isHorizontal
                ? `translateX(${scrollDir === -1 ? -2 : 0}px)`
                : `translateY(${scrollDir === -1 ? -2 : 0}px)`,
            }}
            viewBox={isHorizontal ? '0 0 6 24' : '0 0 24 6'}
            preserveAspectRatio="none"
            fill="none"
          >
            <path
              d={isHorizontal ? 'M6,0 C0,0 0,24 6,24' : 'M0,6 C0,0 24,0 24,6'}
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <svg
            className={clsx(
              'absolute pointer-events-none z-10 text-accent-hover overflow-visible transition-transform duration-200 ease-out',
              isHorizontal
                ? '-right-1.5 inset-y-0 h-full w-1.5'
                : 'inset-x-0 -bottom-1.5 w-full h-1.5',
            )}
            style={{
              transform: isHorizontal
                ? `translateX(${scrollDir === 1 ? 2 : 0}px)`
                : `translateY(${scrollDir === 1 ? 2 : 0}px)`,
            }}
            viewBox={isHorizontal ? '0 0 6 24' : '0 0 24 6'}
            preserveAspectRatio="none"
            fill="none"
          >
            <path
              d={isHorizontal ? 'M0,0 C6,0 6,24 0,24' : 'M0,0 C0,6 24,6 24,0'}
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </>
      )}

      {renderedItems.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === renderedItems.length - 1;

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
                portal={portal}
              />
            ) : (
              <div className="relative">
                <button
                  onClick={item.onClick}
                  onAuxClick={item.onAuxClick}
                  onContextMenu={item.onContextMenu}
                  disabled={item.disabled}
                  className={clsx(
                    sizeClass,
                    'text-white transition-colors flex items-center gap-1.5',
                    hoverClass,
                    item.buttonClassName,
                    isFirst && config.firstRounding,
                    isLast && config.lastRounding,
                    item.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                  style={item.buttonStyle}
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
  portal: boolean;
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
  portal,
}: ExpandableItemProps) {
  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: item.expandDelay,
    collapseDelay: item.collapseDelay,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Inline (non-portal) expand position styles
  const INLINE_EXPAND: Record<AnchorPlacement, React.CSSProperties> = {
    top: { bottom: `calc(100% + ${expandOffset}px)`, left: '50%', transform: 'translateX(-50%)' },
    bottom: { top: `calc(100% + ${expandOffset}px)`, left: '50%', transform: 'translateX(-50%)' },
    left: { right: `calc(100% + ${expandOffset}px)`, top: '50%', transform: 'translateY(-50%)' },
    right: { left: `calc(100% + ${expandOffset}px)`, top: '50%', transform: 'translateY(-50%)' },
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      {...handlers}
    >
      <button
        onClick={item.onClick}
        onAuxClick={item.onAuxClick}
        onContextMenu={item.onContextMenu}
        disabled={item.disabled}
        className={clsx(
          sizeClass,
          'text-white transition-colors flex items-center gap-1.5',
          hoverClass,
          item.buttonClassName,
          isFirst && config.firstRounding,
          isLast && config.lastRounding,
          item.disabled && 'opacity-50 cursor-not-allowed'
        )}
        style={item.buttonStyle}
        title={item.title}
        type="button"
      >
        {item.icon}
        {showLabels && item.label && <span>{item.label}</span>}
      </button>
      {item.badge}

      {isExpanded && item.expandContent && (
        portal ? (
          <PortalFloat
            anchor={containerRef.current}
            placement={config.expandDirection}
            offset={expandOffset}
            onMouseEnter={handlers.onMouseEnter}
            onMouseLeave={handlers.onMouseLeave}
          >
            {item.expandContent}
          </PortalFloat>
        ) : (
          <div className="absolute z-dropdown" style={INLINE_EXPAND[config.expandDirection]}>
            {item.expandContent}
          </div>
        )
      )}
    </div>
  );
}

export default ButtonGroup;
