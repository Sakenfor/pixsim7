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
import type { OverlayConfiguration, WidgetContext, WidgetPosition, OverlayAnchor } from './types';
import { isOverlayPosition } from './types';
import {
  resolveBoxSeparation,
  type SeparationBox,
  type Nudge,
} from './utils/boxSeparation';
import { handleCollisions } from './utils/collision';
import { applyDefaults } from './utils/merge';
import { positionToStyle } from './utils/position';
import { partitionByStackGroup, type StackGroupInfo } from './utils/stacking';
import { validateAndLog } from './utils/validation';

const EMPTY_NUDGES: Map<string, Nudge> = new Map();

/** Shallow-equal two nudge maps so the effect can bail without a re-render. */
function nudgeMapsEqual(a: Map<string, Nudge>, b: Map<string, Nudge>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, av] of a) {
    const bv = b.get(key);
    if (!bv || bv.dx !== av.dx || bv.dy !== av.dy) return false;
  }
  return true;
}


const isDev = import.meta.env?.DEV ?? false;

/**
 * Initial guess for a scrollable stack region's length (~5 compact badges),
 * used only before {@link measure} runs. After mount the cap is the measured
 * room down to the card's edge (see {@link STACK_EDGE_MARGIN}) — no artificial
 * ceiling — so the stack grows to fit the card and only scrolls when it can't.
 */
const STACK_MAX_EXTENT = 132;
/** Never shrink the scroll region below this — keep it usable on tiny cards. */
const STACK_MIN_EXTENT = 44;
/** Gap kept between the scroll region's far edge and the card edge. */
const STACK_EDGE_MARGIN = 8;
/** Ignore transient 0fr/transitioning stack children when measuring a row. */
const STACK_MIN_ITEM_EXTENT = 16;
/**
 * Slack (px) added on the region's cross axis so a badge's hover-pop (scale up
 * to ~1.18×, see tailwind `hover-pop`) has room to grow instead of being
 * clipped. A scroll container with `overflow: auto` on one axis forces the
 * other axis to compute to `auto` too (CSS spec), so `overflow-x: visible`
 * doesn't actually keep the sides un-clipped — the padding does, and a matching
 * negative margin keeps the region's visual position unchanged. */
const STACK_POP_SLACK = 5;

function getStackItemExtent(el: HTMLDivElement, isColumn: boolean): number | null {
  for (const child of Array.from(el.children)) {
    let item = child as HTMLElement;
    // A pill-group wrapper bundles several glyphs; measure a real glyph inside
    // it, not the whole wrapper, so quantization stays per-glyph.
    if (item.dataset?.overlayPill !== undefined && item.firstElementChild) {
      item = item.firstElementChild as HTMLElement;
    }
    // Use the layout box (offset*), NOT getBoundingClientRect: the latter
    // folds in CSS transforms, so a glyph mid hover-pop (scale ~1.18×) inflates
    // the measured extent. A re-measure firing on scroll while a glyph is
    // hovered would then shrink the quantized cap and push the tail items past
    // the last reachable snap point — "not all active sets appear as we scroll".
    const size = isColumn ? item.offsetHeight : item.offsetWidth;
    if (size < STACK_MIN_ITEM_EXTENT) continue;
    const style = window.getComputedStyle(item);
    const margin = parseFloat(isColumn ? style.marginBottom : style.marginRight) || 0;
    return size + margin;
  }
  return null;
}

function quantizeStackExtent(cap: number, el: HTMLDivElement, isColumn: boolean): number {
  const itemExtent = getStackItemExtent(el, isColumn);
  if (!itemExtent) return Math.max(STACK_MIN_EXTENT, cap);
  const wholeItems = Math.max(1, Math.floor(cap / itemExtent));
  return wholeItems * itemExtent;
}

/**
 * Render a stack list, wrapping contiguous runs of widgets that share a
 * `pillGroup` id in a rounded grey backing pill so they read as one connected
 * group (e.g. the active-target count badge + its quick-access set glyphs).
 * A run of length 1 renders bare — a lone pill is just noise.
 */
function renderStackList(
  widgets: StackGroupInfo['widgets'],
  renderWidget: (w: StackGroupInfo['widgets'][number]) => React.ReactNode,
  flexStyle: React.CSSProperties,
  revealed: boolean,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < widgets.length) {
    const pg = widgets[i].pillGroup;
    if (!pg) {
      out.push(renderWidget(widgets[i]));
      i += 1;
      continue;
    }
    const run: StackGroupInfo['widgets'] = [];
    while (i < widgets.length && widgets[i].pillGroup === pg) {
      run.push(widgets[i]);
      i += 1;
    }
    if (run.length <= 1) {
      out.push(renderWidget(run[0]));
      continue;
    }
    out.push(
      <div
        key={`pill:${pg}`}
        data-overlay-pill=""
        style={{
          ...flexStyle,
          // Paint the backing only while revealed. The wrapper itself always
          // stays mounted (so its hover-gated children don't remount), but at
          // rest those children collapse to ~0 height — without this gate the
          // padding + bg would linger as a flattened pill where the badges were.
          ...(revealed
            ? {
                padding: 3,
                borderRadius: 13,
                background: 'rgba(23,23,23,0.5)',
                backdropFilter: 'blur(2px)',
                // Double hairline (light inset + dark outer) so the pill edge
                // reads on any background — the dark fill alone vanishes against
                // a grey thumbnail; one of the two outlines always contrasts.
                boxShadow:
                  'inset 0 0 0 1px rgba(255,255,255,0.22), 0 0 0 1px rgba(0,0,0,0.28)',
                // The pill's padding would otherwise inset its badges off the
                // column's anchored edge, leaving them misaligned with the
                // unpilled badges above (e.g. the set group sitting left of
                // favorite/quick-tag). Pull the pill out by the padding on the
                // aligned side so the badges' edge lines back up.
                ...(flexStyle.alignItems === 'flex-end'
                  ? { marginRight: -3 }
                  : flexStyle.alignItems === 'flex-start'
                    ? { marginLeft: -3 }
                    : null),
              }
            : null),
          // Visual backing only — clicks reach the badges inside (they set their
          // own pointerEvents: auto).
          pointerEvents: 'none',
        }}
      >
        {run.map(renderWidget)}
      </div>,
    );
  }
  return out;
}

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
  onRootRef,
  nudge,
  revealed = false,
}: {
  group: StackGroupInfo;
  baseStyle: React.CSSProperties;
  renderWidget: (widget: StackGroupInfo['widgets'][number]) => React.ReactNode;
  /** Reports the group's positioned root element for box-separation measuring. */
  onRootRef?: (el: HTMLDivElement | null) => void;
  /** Box-separation translate applied to the whole group, composed onto baseStyle. */
  nudge?: { dx: number; dy: number };
  /** Container hover/reveal state. Pill-group backings only paint while revealed,
   *  so a group of hover-gated badges doesn't leave a flattened pill behind when
   *  its members collapse on hover-out. */
  revealed?: boolean;
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

  // How the group splits into always-pinned vs scrollable widgets:
  // - With an overflow-scroll policy (e.g. the top corner badge columns): keep
  //   the top `pinnedLeaderCount` highest-priority widgets pinned and fold the
  //   rest into the scroll region, so the whole column scrolls when it can't fit
  //   a short card instead of being clipped. `group.widgets` is already sorted
  //   priority-descending, so a slice is the leader split.
  // - Without a policy (legacy): only widgets opting into `scrollable` (e.g. the
  //   set target-toggle glyphs) scroll; everything else stays pinned.
  const policy = group.scrollPolicy;
  const pinned = policy?.overflowScroll
    ? group.widgets.slice(0, policy.pinnedLeaderCount ?? 0)
    : group.widgets.filter((w) => !w.scrollable);
  const scrollWidgets = policy?.overflowScroll
    ? group.widgets.slice(policy.pinnedLeaderCount ?? 0)
    : group.widgets.filter((w) => w.scrollable);
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
      // Bound only by the real room down to the card edge. The active-set cap
      // (MAX_ACTIVE_TARGETS) is the user's intent for "how many sets" — the badge
      // column shouldn't impose a tighter, separate ceiling that hides some of
      // them. So the expanded stack grows to fill the card and only scrolls when
      // it genuinely can't fit, instead of folding at an arbitrary 132px / 0.34×
      // short-side fraction (which showed ~3 glyphs and scrolled the rest out of
      // sight). Room-to-edge already keeps it from spilling past the card.
      const cap = room;
      setMaxExtent(quantizeStackExtent(cap, el, isColumn));
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

  // Remembered scroll position across hover cycles. Hover-gated glyphs collapse
  // via `grid-template-rows: 0fr` on hover-out (they don't unmount), shrinking
  // the region so the browser clamps scrollTop to 0; on hover-in we restore the
  // saved spot once the glyphs finish re-expanding (see handleTransitionEnd).
  const savedScrollRef = useRef(0);
  const prevScrollSizeRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = isColumn ? el.scrollTop : el.scrollLeft;
    const scrollSize = isColumn ? el.scrollHeight : el.scrollWidth;
    // Only remember the position on a real user scroll — i.e. when the content
    // size is stable. A scroll event fired *because* the content is collapsing/
    // expanding (height changing) is the browser clamping, not the user, and
    // must not overwrite the saved spot with the clamped 0.
    if (scrollSize === prevScrollSizeRef.current) {
      savedScrollRef.current = pos;
    }
    prevScrollSizeRef.current = scrollSize;

    const dir = pos > lastPos.current ? 1 : pos < lastPos.current ? -1 : 0;
    lastPos.current = pos;
    if (dir !== 0) {
      setScrollDir(dir);
      clearTimeout(dirTimer.current);
      dirTimer.current = setTimeout(() => setScrollDir(0), 200);
    }
    measure();
  }, [isColumn, measure]);

  // Restore the saved position when the glyphs finish re-expanding on hover-in.
  // `grid-template-rows` is the collapse/expand axis; ignore the sibling opacity/
  // margin transitions. No-op while collapsed (not overflowing).
  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.propertyName !== 'grid-template-rows') return;
      const el = ref.current;
      if (!el) return;
      const size = isColumn ? el.clientHeight : el.clientWidth;
      const scrollSize = isColumn ? el.scrollHeight : el.scrollWidth;
      if (scrollSize <= size + 1) return; // collapsed → nothing to restore yet
      const target = Math.min(savedScrollRef.current, scrollSize - size);
      if (target <= 0) return;
      if (isColumn) {
        if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
      } else if (Math.abs(el.scrollLeft - target) > 1) {
        el.scrollLeft = target;
      }
    },
    [isColumn],
  );

  // Forget the saved spot when the set of scrollable widgets changes (e.g.
  // expand/collapse toggled, or active sets added/removed) — a fresh stack
  // starts at the top.
  useEffect(() => {
    savedScrollRef.current = 0;
    prevScrollSizeRef.current = 0;
  }, [scrollCount]);

  const flexStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: group.flexDirection,
    alignItems: group.alignItems,
  };

  const nudgeTransform =
    nudge && (nudge.dx !== 0 || nudge.dy !== 0)
      ? `translate(${nudge.dx}px, ${nudge.dy}px)`
      : undefined;
  const composedTransform = [baseStyle.transform, nudgeTransform]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div
      ref={onRootRef}
      data-overlay-stack-group={group.stackGroup}
      data-overlay-stack-anchor={group.anchor}
      style={{
        ...baseStyle,
        ...flexStyle,
        transform: composedTransform,
        transition: nudgeTransform ? 'transform 120ms ease-out' : baseStyle.transition,
        zIndex: group.maxPriority,
        pointerEvents: 'none',
      }}
    >
      {renderStackList(pinned, renderWidget, flexStyle, revealed)}
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
            onTransitionEnd={handleTransitionEnd}
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
              // No scroll-snap: snapping fires a delayed re-snap animation after
              // the native wheel scroll — the "instant scroll, then a second slide
              // ~0.2s later in the same direction" double-motion. `quantizeStackExtent`
              // already sizes the viewport to a whole number of glyphs, so the
              // region stays item-tidy without snapping. (mandatory also trapped the
              // tail glyph out of reach; both issues go away by dropping snap.)
              // Capture pointer events (for wheel scroll) only while overflowing;
              // otherwise keep the gaps click-through to the card. A directional
              // resize cursor hints the region is wheel-scrollable.
              pointerEvents: overflowing ? 'auto' : 'none',
              cursor: overflowing ? (isColumn ? 'ns-resize' : 'ew-resize') : undefined,
            }}
          >
            {renderStackList(scrollWidgets, renderWidget, flexStyle, revealed)}
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
  // Positioned root element per stack group, keyed by group.key — measured by
  // the box-separation pass so a whole stack (e.g. the top-right set column)
  // can be nudged as one unit.
  const stackGroupRefs = useRef<Map<string, HTMLElement>>(new Map());
  const stackGroupRefCallbacks = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const getStackGroupRefCallback = useCallback((key: string) => {
    let cb = stackGroupRefCallbacks.current.get(key);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) stackGroupRefs.current.set(key, el);
        else stackGroupRefs.current.delete(key);
      };
      stackGroupRefCallbacks.current.set(key, cb);
    }
    return cb;
  }, []);
  // Per-unit translate from the box-separation pass (unit id = group key or
  // ungrouped widget id).
  const [unitNudges, setUnitNudges] = useState<Map<string, Nudge>>(EMPTY_NUDGES);
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

  // ── Box-separation pass ────────────────────────────────────────────────
  // Treats each rendered overlay unit (stack-group container + each ungrouped
  // widget) as a measured box and nudges lower-priority units off higher ones.
  // Gated on hover because the overlaps it resolves (bottom button group,
  // hover-revealed badges, expanded set column) only exist while hovered — this
  // keeps resting galleries free of the measurement cost.
  const boxSeparationEnabled = !!config.boxSeparation;
  const hoverActive = isHovered || forceHovered;

  // Mirror the applied nudges so the next measure can recover each unit's
  // *natural* rect (measured − applied) instead of feeding moved boxes back in.
  const appliedNudgesRef = useRef<Map<string, Nudge>>(unitNudges);
  appliedNudgesRef.current = unitNudges;

  useEffect(() => {
    // Reset nudges whenever the pass is inactive (disabled or hover-out) so
    // units glide back to their natural spots.
    if (!boxSeparationEnabled || !hoverActive) {
      setUnitNudges((prev) => (prev.size === 0 ? prev : EMPTY_NUDGES));
      return;
    }
    const containerEl = containerRef.current;
    if (!containerEl) return;

    let debounceId: ReturnType<typeof setTimeout> | null = null;

    const measure = () => {
      const containerRect = containerEl.getBoundingClientRect();
      if (containerRect.width === 0 && containerRect.height === 0) return;

      const applied = appliedNudgesRef.current;
      const boxes: SeparationBox[] = [];

      const pushBox = (
        id: string,
        el: HTMLElement | undefined,
        priority: number,
        anchor: OverlayAnchor,
      ) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        // Skip hidden / collapsed units — they shouldn't reserve space.
        if (r.width <= 0 || r.height <= 0) return;
        const n = applied.get(id);
        // Recover the natural (un-nudged) rect, relative to the container.
        boxes.push({
          id,
          priority,
          anchor,
          rect: {
            x: r.left - containerRect.left - (n?.dx ?? 0),
            y: r.top - containerRect.top - (n?.dy ?? 0),
            width: r.width,
            height: r.height,
          },
        });
      };

      for (const group of stackGroups) {
        pushBox(group.key, stackGroupRefs.current.get(group.key), group.maxPriority, group.anchor);
      }
      for (const widget of ungrouped) {
        // Skip interaction layers (e.g. the full-card video scrubber) — they
        // cover the whole card, so treating them as boxes would collide with
        // every badge and their churning content would re-fire this pass while
        // you hold still over the card. They opt out via `ignoreCollisions`,
        // the same flag the legacy collision pass honors.
        if (widget.ignoreCollisions) continue;
        const anchor = isOverlayPosition(widget.position)
          ? widget.position.anchor
          : 'top-left';
        pushBox(widget.id, widgetRefs.current.get(widget.id), widget.priority ?? 0, anchor);
      }

      const next = resolveBoxSeparation(boxes, {
        x: 0,
        y: 0,
        width: containerRect.width,
        height: containerRect.height,
      });

      setUnitNudges((prev) => (nudgeMapsEqual(prev, next) ? prev : next));
    };

    const debouncedMeasure = () => {
      if (debounceId !== null) clearTimeout(debounceId);
      debounceId = setTimeout(measure, 60);
    };

    // Measure right away, then again after the ~150ms reveal/expand transitions
    // settle (the button group fades in and the set column expands on hover, so
    // an immediate read would catch mid-transition sizes).
    const timers = [
      setTimeout(measure, 30),
      setTimeout(measure, 220),
    ];

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(debouncedMeasure);
      observer.observe(containerEl);
      // Observe each measured unit too: hover-reveal grows a widget from ~0 to
      // full size and an expanding set column changes the group's height without
      // resizing the container, so container-only observation would miss both.
      // Excluded units (the video scrubber) are skipped so their churning
      // content doesn't keep re-firing the pass while you hold still.
      for (const el of stackGroupRefs.current.values()) observer.observe(el);
      for (const widget of ungrouped) {
        if (widget.ignoreCollisions) continue;
        const el = widgetRefs.current.get(widget.id);
        if (el) observer.observe(el);
      }
    }

    return () => {
      for (const t of timers) clearTimeout(t);
      if (debounceId !== null) clearTimeout(debounceId);
      observer?.disconnect();
    };
  }, [boxSeparationEnabled, hoverActive, stackGroups, ungrouped]);

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
            nudge={unitNudges.get(widget.id)}
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
            onRootRef={getStackGroupRefCallback(group.key)}
            nudge={unitNudges.get(group.key)}
            revealed={hoverActive}
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
