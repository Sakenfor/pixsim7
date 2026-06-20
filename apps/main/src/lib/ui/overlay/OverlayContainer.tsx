/**
 * OverlayContainer Component
 *
 * Main container that renders positioned overlay widgets on top of content.
 * Handles hover state, focus tracking, widget visibility coordination, and
 * optional collision detection.
 */

import { OverflowBracket } from '@pixsim7/shared.ui';
import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';

import { useWidgetData, type DataSourceBinding } from '@lib/dataBinding';

import { OverlayWidget } from './OverlayWidget';
import type { OverlayConfiguration, WidgetContext, WidgetPosition } from './types';
import { handleCollisions } from './utils/collision';
import { applyDefaults } from './utils/merge';
import { positionToStyle } from './utils/position';
import { partitionByStackGroup, type StackGroupInfo } from './utils/stacking';
import { validateAndLog } from './utils/validation';


const isDev = import.meta.env?.DEV ?? false;

/**
 * Ceiling on a scrollable stack region's length (~5 compact badges). The actual
 * cap is the smaller of this and the measured distance down to the card's edge
 * (see {@link STACK_EDGE_MARGIN}), so on a short card it folds well above the
 * bottom instead of nearly reaching it.
 */
const STACK_MAX_EXTENT = 132;
/** Never shrink the scroll region below this — keep it usable on tiny cards. */
const STACK_MIN_EXTENT = 44;
/** Gap kept between the scroll region's far edge and the card edge. */
const STACK_EDGE_MARGIN = 8;
/** Cap the region to this fraction of the card so it stays proportionally tight
 *  on small cards (where the room-to-edge alone is still too generous). */
const STACK_MAX_FRACTION = 0.42;
/**
 * Slack (px) added on the region's cross axis so a badge's hover-pop (scale up
 * to ~1.18×, see tailwind `hover-pop`) has room to grow instead of being
 * clipped. A scroll container with `overflow: auto` on one axis forces the
 * other axis to compute to `auto` too (CSS spec), so `overflow-x: visible`
 * doesn't actually keep the sides un-clipped — the padding does, and a matching
 * negative margin keeps the region's visual position unchanged. */
const STACK_POP_SLACK = 5;

/**
 * A single auto-stacked badge group (e.g. the top-right column). Capped via
 * {@link STACK_MAX_EXTENT}; when the stack overflows it scrolls on the mouse
 * wheel with **no scrollbar**, showing curved bracket indicators at the
 * over-scrollable edges — the same overflow affordance the generation
 * ButtonGroup uses, for visual consistency. (Unlike ButtonGroup it scrolls
 * rather than cyclically windows, so always-visible badges like the "in set"
 * glyphs never rotate out of view.) Pointer events are only captured while the
 * stack actually overflows, so otherwise the gaps stay click-through to the card.
 */
function StackGroupContainer({
  group,
  baseStyle,
  renderWidget,
}: {
  group: StackGroupInfo;
  baseStyle: React.CSSProperties;
  renderWidget: (widget: StackGroupInfo['widgets'][number]) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [scrollDir, setScrollDir] = useState<-1 | 0 | 1>(0);
  const [maxExtent, setMaxExtent] = useState(STACK_MAX_EXTENT);
  const dirTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastPos = useRef(0);
  const isColumn = group.flexDirection === 'column';

  // Pinned badges (status/favorite/tag …) stay put at the anchor; only widgets
  // opting into `scrollable` (e.g. set target-toggles) fold into the scroll
  // region, so the pinned ones are never pushed out of view.
  const pinned = group.widgets.filter((w) => !w.scrollable);
  const scrollWidgets = group.widgets.filter((w) => w.scrollable);
  const scrollCount = scrollWidgets.length;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Clamp the cap to the room left down to the card edge. The region's start
    // (top/left) is fixed by the pinned badges above it and the card edge is
    // fixed, so this doesn't depend on the region's own size — no feedback loop.
    const card = el.closest('[data-overlay-container]') as HTMLElement | null;
    if (card) {
      const cardRect = card.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const room = isColumn
        ? cardRect.bottom - elRect.top - STACK_EDGE_MARGIN
        : cardRect.right - elRect.left - STACK_EDGE_MARGIN;
      // Bound by the ceiling, the room down to the card edge, AND a fraction of
      // the card — the last keeps it proportionally tight on small cards where
      // room-to-edge alone still fills most of the card.
      const cardExtent = isColumn ? cardRect.height : cardRect.width;
      const cap = Math.min(STACK_MAX_EXTENT, room, cardExtent * STACK_MAX_FRACTION);
      setMaxExtent(Math.max(STACK_MIN_EXTENT, cap));
    }

    const size = isColumn ? el.clientHeight : el.clientWidth;
    const scrollSize = isColumn ? el.scrollHeight : el.scrollWidth;
    const pos = isColumn ? el.scrollTop : el.scrollLeft;
    setOverflowing(scrollSize > size + 1);
    setAtStart(pos <= 1);
    setAtEnd(pos >= scrollSize - size - 1);
  }, [isColumn]);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Also react to the card itself resizing (smaller card => tighter cap).
    const card = el.closest('[data-overlay-container]');
    if (card) ro.observe(card);
    return () => ro.disconnect();
  }, [measure, scrollCount]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = isColumn ? el.scrollTop : el.scrollLeft;
    const dir = pos > lastPos.current ? 1 : pos < lastPos.current ? -1 : 0;
    lastPos.current = pos;
    if (dir !== 0) {
      setScrollDir(dir);
      clearTimeout(dirTimer.current);
      dirTimer.current = setTimeout(() => setScrollDir(0), 200);
    }
    measure();
  }, [isColumn, measure]);

  const flexStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: group.flexDirection,
    alignItems: group.alignItems,
  };

  return (
    <div
      data-overlay-stack-group={group.stackGroup}
      data-overlay-stack-anchor={group.anchor}
      style={{ ...baseStyle, ...flexStyle, zIndex: group.maxPriority, pointerEvents: 'none' }}
    >
      {pinned.map(renderWidget)}
      {scrollCount > 0 && (
        <div className="relative" style={{ ...flexStyle, pointerEvents: 'none' }}>
          {overflowing && !atStart && (
            <OverflowBracket orientation="vertical" edge="start" variant="round" active={scrollDir === -1} />
          )}
          {overflowing && !atEnd && (
            <OverflowBracket orientation="vertical" edge="end" variant="round" active={scrollDir === 1} />
          )}
          <div
            ref={ref}
            onScroll={handleScroll}
            className="no-scrollbar"
            // Marks this region as wheel-scrollable so ancestor wheel handlers
            // (e.g. the asset viewer's scroll-to-zoom in MediaPanel) bail out
            // and let the native overflow scroll run instead of preventing it.
            data-overlay-scroll=""
            style={{
              ...flexStyle,
              ...(isColumn
                ? {
                    maxHeight: maxExtent,
                    overflowY: 'auto',
                    overflowX: 'visible',
                    // Cross axis (horizontal) slack so the hover-pop isn't
                    // clipped at the sides; negative margin cancels the shift.
                    paddingLeft: STACK_POP_SLACK,
                    paddingRight: STACK_POP_SLACK,
                    marginLeft: -STACK_POP_SLACK,
                    marginRight: -STACK_POP_SLACK,
                  }
                : {
                    maxWidth: maxExtent,
                    overflowX: 'auto',
                    overflowY: 'visible',
                    paddingTop: STACK_POP_SLACK,
                    paddingBottom: STACK_POP_SLACK,
                    marginTop: -STACK_POP_SLACK,
                    marginBottom: -STACK_POP_SLACK,
                  }),
              // Don't chain the wheel to the gallery when the stack hits its edge.
              overscrollBehavior: 'contain',
              // Capture pointer events (for wheel scroll) only while overflowing;
              // otherwise keep the gaps click-through to the card. A directional
              // resize cursor hints the region is wheel-scrollable.
              pointerEvents: overflowing ? 'auto' : 'none',
              cursor: overflowing ? (isColumn ? 'ns-resize' : 'ew-resize') : undefined,
            }}
          >
            {scrollWidgets.map(renderWidget)}
          </div>
        </div>
      )}
    </div>
  );
}

export interface OverlayContainerProps {
  /** Overlay configuration */
  configuration: OverlayConfiguration;

  /**
   * Data passed to widget render functions.
   * Can be provided directly or resolved via `bindings`.
   */
  data?: any;

  /**
   * Data source bindings (from unified dataSourceRegistry).
   * When provided, data is resolved reactively from registered sources.
   * Resolved values are merged with `data` prop (bindings take precedence).
   *
   * @example
   * ```tsx
   * <OverlayContainer
   *   configuration={config}
   *   bindings={[
   *     { id: 'b1', sourceId: 'asset:current', targetProp: 'asset' },
   *     { id: 'b2', sourceId: 'upload:progress', targetProp: 'progress' },
   *   ]}
   * >
   *   <img src={...} />
   * </OverlayContainer>
   * ```
   */
  bindings?: DataSourceBinding[];

  /** Custom state for conditional widget rendering */
  customState?: Record<string, any>;

  /**
   * Force the container into its hovered state regardless of pointer hover.
   * Used by touch surfaces to reveal hover-gated widgets on tap, where no
   * real `mouseenter` ever fires.
   */
  forceHovered?: boolean;

  /** Callback when a widget is clicked */
  onWidgetClick?: (widgetId: string, data: any) => void;

  /** Container content (the element to overlay on) */
  children: React.ReactNode;

  /** Additional CSS classes */
  className?: string;

  /** Validate configuration in development */
  validate?: boolean;
}

/**
 * Container that renders overlay widgets on top of children
 *
 * Container contract:
 * - Sets `position: relative` so absolutely positioned widgets stay within bounds
 * - Tracks hover and focus state for widget visibility
 * - Coordinates widget rendering and interactions
 */
export const OverlayContainer: React.FC<OverlayContainerProps> = ({
  configuration,
  data: dataProp,
  bindings,
  customState,
  forceHovered = false,
  onWidgetClick,
  children,
  className = '',
  validate = isDev,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRefs = useRef<Map<string, HTMLElement>>(new Map());
  // Stable per-widget ref callbacks — cached so React.memo children don't re-render
  const widgetRefCallbacks = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const getWidgetRefCallback = useCallback((widgetId: string) => {
    let cb = widgetRefCallbacks.current.get(widgetId);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) { widgetRefs.current.set(widgetId, el); }
        else { widgetRefs.current.delete(widgetId); }
      };
      widgetRefCallbacks.current.set(widgetId, cb);
    }
    return cb;
  }, []);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [adjustedPositions, setAdjustedPositions] = useState<Map<string, WidgetPosition>>(
    new Map()
  );

  // Resolve data from bindings (unified data source system)
  const resolvedData = useWidgetData(bindings);

  // Merge resolved data with provided data (resolved takes precedence)
  const data = useMemo(
    () => ({ ...dataProp, ...resolvedData }),
    [dataProp, resolvedData]
  );

  // Apply defaults to widgets
  const config = useMemo(
    () => applyDefaults(configuration),
    [configuration],
  );

  // Partition widgets into stack groups and ungrouped
  const { stackGroups, ungrouped } = useMemo(
    () => partitionByStackGroup(config.widgets),
    [config.widgets],
  );

  // Validate configuration in development (runs when configuration changes)
  useEffect(() => {
    if (validate) {
      validateAndLog(configuration);
    }
  }, [validate, configuration]);

  // Handle collision detection — only for ungrouped widgets (stacked widgets
  // are already positioned by their flex container and don't need adjustment).
  const collisionDetectionEnabled = !!config.collisionDetection;

  // Clear adjusted positions when collision detection is disabled.
  // Separate from the main collision effect to avoid re-running collision setup
  // when positions are cleared.
  useEffect(() => {
    if (!collisionDetectionEnabled) {
      setAdjustedPositions((prev) => (prev.size === 0 ? prev : new Map()));
    }
  }, [collisionDetectionEnabled]);

  useEffect(() => {
    if (!collisionDetectionEnabled) return;
    if (!containerRef.current) return;

    const containerEl = containerRef.current;
    let debounceId: ReturnType<typeof setTimeout> | null = null;

    const checkCollisions = () => {
      if (!containerEl) return;
      const containerRect = containerEl.getBoundingClientRect();
      if (containerRect.width === 0 && containerRect.height === 0) return;

      // Only collision-check ungrouped widgets; stacked widgets are flex-laid-out.
      const result = handleCollisions(ungrouped, containerRect, widgetRefs.current);

      if (result.hasCollisions) {
        setAdjustedPositions(result.adjustedPositions);
      } else {
        setAdjustedPositions((prev) => (prev.size === 0 ? prev : new Map()));
      }
    };

    const debouncedCheck = () => {
      if (debounceId !== null) clearTimeout(debounceId);
      debounceId = setTimeout(checkCollisions, 150);
    };

    // Initial check after widgets mount
    const timeoutId = setTimeout(checkCollisions, 100);

    // Re-check on resize, debounced to avoid per-frame work
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(debouncedCheck);
      observer.observe(containerEl);
    }

    return () => {
      clearTimeout(timeoutId);
      if (debounceId !== null) clearTimeout(debounceId);
      observer?.disconnect();
    };
  }, [ungrouped, collisionDetectionEnabled]);

  // Create widget context
  const context: WidgetContext = useMemo(
    () => ({
      containerRef,
      isHovered: isHovered || forceHovered,
      isFocused,
      customState,
    }),
    [isHovered, forceHovered, isFocused, customState],
  );

  // Hover handlers
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Focus handlers
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  // Widget click handler — use refs so callback identity is stable across renders
  const configRef = useRef(config);
  configRef.current = config;
  const dataRef = useRef(data);
  dataRef.current = data;
  const onWidgetClickRef = useRef(onWidgetClick);
  onWidgetClickRef.current = onWidgetClick;

  const handleWidgetClick = useCallback(
    (widgetId: string, event?: React.MouseEvent) => {
      const widget = configRef.current.widgets.find((w) => w.id === widgetId);
      if (widget?.onClick) {
        widget.onClick(dataRef.current, event);
      }
      onWidgetClickRef.current?.(widgetId, dataRef.current);
    },
    [],
  );

  // Determine overflow behavior
  const overflowClass = config.allowOverflow !== false ? 'overflow-visible' : 'overflow-hidden';

  return (
    <div
      ref={containerRef}
      data-overlay-container="true"
      className={`relative ${overflowClass} ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {/* Main content */}
      {children}

      {/* Ungrouped overlay widgets (absolute-positioned, collision detection) */}
      {ungrouped.map((widget) => {
        // Use adjusted position if collision detection found one
        const adjustedPosition = adjustedPositions.get(widget.id);
        const effectiveWidget = adjustedPosition
          ? { ...widget, position: adjustedPosition }
          : widget;

        return (
          <OverlayWidget
            key={widget.id}
            widget={effectiveWidget}
            context={context}
            data={data}
            spacing={config.spacing ?? 'normal'}
            onWidgetClick={handleWidgetClick}
            onRef={getWidgetRefCallback(widget.id)}
          />
        );
      })}

      {/* Stack groups: flex containers with auto-stacked children.
          Spacing is handled per-child via margin (not gap) so collapsed
          widgets don't leave empty gaps. */}
      {stackGroups.map((group) => {
        const spacing = config.spacing ?? 'normal';
        const containerStyle = positionToStyle({
          anchor: group.anchor,
          offset: group.offset,
        });

        return (
          <StackGroupContainer
            key={group.key}
            group={group}
            baseStyle={containerStyle}
            renderWidget={(widget) => (
              <OverlayWidget
                key={widget.id}
                widget={widget}
                context={context}
                data={data}
                spacing={spacing}
                onWidgetClick={handleWidgetClick}
                inStack
                onRef={getWidgetRefCallback(widget.id)}
              />
            )}
          />
        );
      })}
    </div>
  );
};

OverlayContainer.displayName = 'OverlayContainer';
