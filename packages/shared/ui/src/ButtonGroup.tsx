import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useHoverExpand } from './useHoverExpand';
import { OverflowBracket } from './OverflowBracket';
import { PortalFloat, type AnchorPlacement } from './PortalFloat';
import { useBurstGesture, BurstLadder } from './burstGesture';

// Stable identities for the no-burst case so the gesture hook doesn't churn.
const EMPTY_STEPS: number[] = [];
const NOOP = () => {};

// Responsive-windowing calibration (`responsiveVisible`). Visible count grows
// continuously with width instead of snapping at coarse breakpoints, and — key
// fix — it keeps graduating past 4 rather than jumping straight to "show all"
// (which previously left a card wide enough for a 5th button stuck at 4, then
// crammed every item at once). FIRST is the px budget for the first item
// (container padding + one button); PER is each additional item. Calibrated to
// match the prior 2/3/4 breakpoints at 78/112/152px.
const WINDOW_FIRST_ITEM_PX = 40;
const WINDOW_PER_ITEM_PX = 32;

// ============================================================================
// Types
// ============================================================================

/**
 * Press-and-drag "burst" gesture: press the button and drag upward to pick how
 * many times to fire it, release to commit. A quick tap (no drag) is left to
 * the normal `onClick`. Opt-in per item; when omitted the button behaves
 * exactly as before. Coexists with `expandContent` — the hover/tap menu is
 * suppressed while a burst drag is engaged.
 */
export interface ButtonGroupBurst {
  /** Ascending count stops the ladder snaps through, e.g. [1, 2, 3, 5, 10]. */
  steps: number[];
  /** Fire `count` times. Called on release after an engaged drag. */
  onFire: (count: number) => void;
  /** Pixels of upward travel between ladder steps. Default 26. */
  stepPx?: number;
  /** Upward movement (px) before the burst engages. Default 6. */
  threshold?: number;
}

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
  /** Pointer-enter handler (e.g. lazy-load expand content on hover) */
  onMouseEnter?: (e: React.MouseEvent) => void;
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
  /** Press-and-drag-up burst gesture (fire N times). Opt-in; see ButtonGroupBurst. */
  burst?: ButtonGroupBurst;
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
   * Clamp portaled expand content within the viewport so it doesn't clip at
   * screen edges (nudges it into view — e.g. a top-placed menu near the top
   * edge "pops lower"). Only applies when `portal` is set. Default: true.
   */
  expandClamp?: boolean;
  /** Minimum margin (px) from viewport edges when clamping expand content. Default: 8. */
  expandViewportMargin?: number;
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
  /**
   * Pixels to subtract from the measured `.cq-scale` host width before deciding
   * how many items fit. Lets a centered overlay group reserve room at the edges
   * (e.g. keep the bottom corners clear for badges) by windowing to a narrower
   * effective width instead of spanning the whole card. Only affects
   * `responsiveVisible` windowing; default 0.
   */
  widthInset?: number;
  /**
   * Controlled wheel-cycle window offset. When a number is provided it overrides
   * the internal auto-centered offset, so several groups can share one scroll
   * position (e.g. all generation pills on a media-card surface). Leave
   * undefined for self-managed per-instance state; pair with
   * {@link onWindowOffsetChange} to write back wheel steps.
   */
  windowOffset?: number;
  /** Called with the next offset on each wheel-cycle step (controlled use). */
  onWindowOffsetChange?: (next: number) => void;
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
  expandClamp = true,
  expandViewportMargin,
  wheelCycle = false,
  responsiveVisible = false,
  visibleCount,
  preferredVisibleId,
  widthInset = 0,
  windowOffset: controlledWindowOffset,
  onWindowOffsetChange,
}: ButtonGroupProps) {
  if (items.length === 0) return null;

  const config = LAYOUT_CONFIG[layout];
  const sizeClass = SIZE_CLASSES[size];
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [hasResponsiveHost, setHasResponsiveHost] = useState(false);
  // Internal (uncontrolled) offset. The *effective* offset below prefers a
  // controlled value when one is supplied, letting groups share a scroll
  // position across instances; the auto-centering effect only ever writes the
  // internal copy, so a freshly-mounted sibling never clobbers the shared value.
  const [internalOffset, setInternalOffset] = useState(0);
  const windowOffset = controlledWindowOffset ?? internalOffset;
  const windowOffsetRef = useRef(windowOffset);
  windowOffsetRef.current = windowOffset;
  // A wheel step updates the internal copy (so uncontrolled use works) AND
  // notifies the controller (so controlled/shared use works).
  const commitWindowOffset = useCallback(
    (next: number) => {
      setInternalOffset(next);
      onWindowOffsetChange?.(next);
    },
    [onWindowOffsetChange],
  );
  // The wheel listener binds once (passive:false), so reach the latest commit
  // through a ref rather than capturing a stale closure.
  const commitWindowOffsetRef = useRef(commitWindowOffset);
  commitWindowOffsetRef.current = commitWindowOffset;
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
      setContainerWidth(Math.max(0, (host.clientWidth || 0) - widthInset));
    };

    update();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [responsiveVisible, widthInset]);

  const resolvedVisibleCount = useMemo(() => {
    if (typeof visibleCount === 'number') {
      return Math.max(1, Math.min(items.length, Math.floor(visibleCount)));
    }
    if (!responsiveVisible || !hasResponsiveHost || containerWidth <= 0) {
      return items.length;
    }
    const fit = Math.floor((containerWidth - WINDOW_FIRST_ITEM_PX) / WINDOW_PER_ITEM_PX) + 1;
    return Math.max(1, Math.min(items.length, fit));
  }, [visibleCount, responsiveVisible, hasResponsiveHost, containerWidth, items.length]);

  useEffect(() => {
    if (resolvedVisibleCount >= items.length) {
      setInternalOffset(0);
      return;
    }
    if (!preferredVisibleId) {
      setInternalOffset(0);
      return;
    }

    const preferredIndex = itemIds.findIndex((id) => id === preferredVisibleId);
    if (preferredIndex < 0) {
      setInternalOffset(0);
      return;
    }

    const centered = preferredIndex - Math.floor(resolvedVisibleCount / 2);
    const normalized = ((centered % items.length) + items.length) % items.length;
    setInternalOffset(normalized);
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
      const prev = windowOffsetRef.current;
      let next = prev + step;
      if (next < 0) next = len - 1;
      else if (next >= len) next = 0;
      commitWindowOffsetRef.current(next);

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
      {/* Scroll indicators — brackets showing more items exist (shared shape;
          `pill` variant matches this row's rounded-full curvature). */}
      {isWindowed && (
        <>
          <OverflowBracket
            orientation={isHorizontal ? 'horizontal' : 'vertical'}
            edge="start"
            active={scrollDir === -1}
          />
          <OverflowBracket
            orientation={isHorizontal ? 'horizontal' : 'vertical'}
            edge="end"
            active={scrollDir === 1}
          />
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
                expandClamp={expandClamp}
                expandViewportMargin={expandViewportMargin}
              />
            ) : (
              <div className="relative">
                <button
                  onClick={item.onClick}
                  onAuxClick={item.onAuxClick}
                  onContextMenu={item.onContextMenu}
                  onMouseEnter={item.onMouseEnter}
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
// Coarse-pointer (touch) detection
// ============================================================================

/**
 * True on touch / coarse-pointer devices, where hover events never fire.
 * Expandable items fall back to tap-to-toggle on these devices.
 */
function useIsCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return coarse;
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
  expandClamp: boolean;
  expandViewportMargin?: number;
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
  expandClamp,
  expandViewportMargin,
}: ExpandableItemProps) {
  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: item.expandDelay,
    collapseDelay: item.collapseDelay,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLDivElement>(null);

  // Touch devices have no hover, so the submenu would be unreachable. Fall back
  // to tap-to-toggle: the first tap opens the submenu (which always contains the
  // button's primary action), a tap outside dismisses it.
  const isCoarse = useIsCoarsePointer();
  const [tapOpen, setTapOpen] = useState(false);
  const burst = useBurstGesture({
    steps: item.burst?.steps ?? EMPTY_STEPS,
    onFire: item.burst?.onFire ?? NOOP,
    orientation: 'vertical',
    stepPx: item.burst?.stepPx,
    threshold: item.burst?.threshold,
    disabled: !item.burst || item.disabled,
  });
  // The hover/tap menu must stay hidden while a burst drag is engaged.
  const open = (isCoarse ? tapOpen : isExpanded) && !burst.active;

  // Dismiss the tap-opened submenu when the user taps outside it. The submenu
  // may be portaled to <body>, so test the portal content (expandRef) too.
  useEffect(() => {
    if (!isCoarse || !tapOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (containerRef.current?.contains(target)) return;
      if (expandRef.current?.contains(target)) return;
      setTapOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [isCoarse, tapOpen]);

  const handleButtonClick = useCallback((e: React.MouseEvent) => {
    if (burst.shouldSwallowClick()) {
      // This click trails a burst gesture — already handled on release.
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (isCoarse) {
      // On touch, the trigger toggles the submenu rather than firing the
      // primary action directly (the primary lives inside the submenu).
      e.preventDefault();
      e.stopPropagation();
      setTapOpen((v) => !v);
      return;
    }
    item.onClick?.(e);
  }, [isCoarse, item, burst]);

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
      {...(isCoarse ? {} : handlers)}
    >
      <button
        ref={burst.buttonRef}
        onClick={handleButtonClick}
        onAuxClick={item.onAuxClick}
        onContextMenu={item.onContextMenu}
        onMouseEnter={item.onMouseEnter}
        {...(item.burst ? burst.pointerHandlers : {})}
        disabled={item.disabled}
        className={clsx(
          sizeClass,
          'text-white transition-colors flex items-center gap-1.5',
          hoverClass,
          item.buttonClassName,
          isFirst && config.firstRounding,
          isLast && config.lastRounding,
          item.disabled && 'opacity-50 cursor-not-allowed',
          // Own the vertical drag so the page/strip doesn't scroll mid-burst.
          item.burst && 'touch-none select-none',
          // Visible "engaged" state while the burst slider is active.
          burst.active && 'ring-2 ring-inset ring-white/80 bg-white/10',
        )}
        style={item.buttonStyle}
        title={item.title}
        type="button"
      >
        {item.icon}
        {showLabels && item.label && <span>{item.label}</span>}
      </button>
      {item.badge}

      {item.burst && (
        <BurstLadder
          state={burst}
          orientation="vertical"
          placement={config.expandDirection}
          offset={expandOffset}
        />
      )}

      {open && item.expandContent && (
        portal ? (
          <PortalFloat
            anchor={containerRef.current}
            placement={config.expandDirection}
            offset={expandOffset}
            clamp={expandClamp}
            viewportMargin={expandViewportMargin}
            onMouseEnter={isCoarse ? undefined : handlers.onMouseEnter}
            onMouseLeave={isCoarse ? undefined : handlers.onMouseLeave}
          >
            <div ref={expandRef}>{item.expandContent}</div>
          </PortalFloat>
        ) : (
          <div
            ref={expandRef}
            className="absolute z-dropdown"
            style={INLINE_EXPAND[config.expandDirection]}
          >
            {item.expandContent}
          </div>
        )
      )}
    </div>
  );
}

export default ButtonGroup;
