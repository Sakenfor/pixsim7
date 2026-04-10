/**
 * OverlayContainer Component
 *
 * Main container that renders positioned overlay widgets on top of content.
 * Handles hover state, focus tracking, widget visibility coordination, and
 * optional collision detection.
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';

import { useWidgetData, type DataSourceBinding } from '@lib/dataBinding';

import { OverlayWidget } from './OverlayWidget';
import type { OverlayConfiguration, WidgetContext, WidgetPosition } from './types';
import { handleCollisions } from './utils/collision';
import { applyDefaults } from './utils/merge';
import { positionToStyle } from './utils/position';
import { partitionByStackGroup } from './utils/stacking';
import { validateAndLog } from './utils/validation';


const isDev = import.meta.env?.DEV ?? false;

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
      isHovered,
      isFocused,
      customState,
    }),
    [isHovered, isFocused, customState],
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
          <div
            key={group.key}
            data-overlay-stack-group={group.stackGroup}
            data-overlay-stack-anchor={group.anchor}
            style={{
              ...containerStyle,
              display: 'flex',
              flexDirection: group.flexDirection,
              alignItems: group.alignItems,
              zIndex: group.maxPriority,
              pointerEvents: 'none',
            }}
          >
            {group.widgets.map((widget) => (
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
            ))}
          </div>
        );
      })}
    </div>
  );
};

OverlayContainer.displayName = 'OverlayContainer';
