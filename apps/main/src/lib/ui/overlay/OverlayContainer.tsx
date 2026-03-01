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

  // Handle collision detection
  useEffect(() => {
    if (!config.collisionDetection || !containerRef.current) {
      setAdjustedPositions(new Map());
      return;
    }

    const containerEl = containerRef.current;

    // Run collision detection after render
    const checkCollisions = () => {
      if (!containerEl) return;
      const containerRect = containerEl.getBoundingClientRect();
      // Skip if container hasn't laid out yet
      if (containerRect.width === 0 && containerRect.height === 0) return;

      const result = handleCollisions(config.widgets, containerRect, widgetRefs.current);

      if (result.hasCollisions) {
        setAdjustedPositions(result.adjustedPositions);

        if (isDev) {
          console.log(
            `[Overlay] Detected ${result.collisions.length} collision(s), adjusted ${result.adjustedPositions.size} widget(s)`
          );
        }
      } else {
        setAdjustedPositions(new Map());
      }
    };

    // Initial check after widgets mount
    const timeoutId = setTimeout(checkCollisions, 100);

    // Re-check when container size settles (handles deferred layout)
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(checkCollisions);
      observer.observe(containerEl);
    }

    return () => {
      clearTimeout(timeoutId);
      observer?.disconnect();
    };
  }, [config.widgets, config.collisionDetection]);

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

  // Widget click handler
  const handleWidgetClick = useCallback(
    (widgetId: string, event?: React.MouseEvent) => {
      const widget = config.widgets.find((w) => w.id === widgetId);
      if (widget?.onClick) {
        widget.onClick(data, event);
      }
      onWidgetClick?.(widgetId, data);
    },
    [config.widgets, data, onWidgetClick],
  );

  // Determine overflow behavior
  const overflowClass = config.allowOverflow !== false ? 'overflow-visible' : 'overflow-hidden';

  return (
    <div
      ref={containerRef}
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
            onRef={(el) => {
              if (el) {
                widgetRefs.current.set(widget.id, el);
              } else {
                widgetRefs.current.delete(widget.id);
              }
            }}
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
                onRef={(el) => {
                  if (el) {
                    widgetRefs.current.set(widget.id, el);
                  } else {
                    widgetRefs.current.delete(widget.id);
                  }
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};

OverlayContainer.displayName = 'OverlayContainer';
