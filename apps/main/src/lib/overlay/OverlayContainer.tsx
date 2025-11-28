/**
 * OverlayContainer Component
 *
 * Main container that renders positioned overlay widgets on top of content.
 * Handles hover state, focus tracking, and widget visibility coordination.
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import type { OverlayConfiguration, WidgetContext } from './types';
import { OverlayWidget } from './OverlayWidget';
import { applyDefaults } from './utils/merge';
import { validateAndLog } from './utils/validation';

export interface OverlayContainerProps {
  /** Overlay configuration */
  configuration: OverlayConfiguration;

  /** Data passed to widget render functions */
  data?: any;

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
  data,
  customState,
  onWidgetClick,
  children,
  className = '',
  validate = process.env.NODE_ENV === 'development',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Validate configuration in development
  if (validate) {
    validateAndLog(configuration);
  }

  // Apply defaults to widgets
  const config = useMemo(
    () => applyDefaults(configuration),
    [configuration],
  );

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
    (widgetId: string) => {
      const widget = config.widgets.find((w) => w.id === widgetId);
      if (widget?.onClick) {
        widget.onClick(data);
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

      {/* Overlay widgets */}
      {config.widgets.map((widget) => (
        <OverlayWidget
          key={widget.id}
          widget={widget}
          context={context}
          data={data}
          spacing={config.spacing ?? 'normal'}
          onWidgetClick={handleWidgetClick}
        />
      ))}
    </div>
  );
};

OverlayContainer.displayName = 'OverlayContainer';
