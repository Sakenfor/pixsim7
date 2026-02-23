/**
 * OverlayWidget Component
 *
 * Renders an individual overlay widget with positioning, visibility, and transitions.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type {
  OverlayWidget as OverlayWidgetType,
  WidgetContext,
  WidgetSpacing,
} from './types';
import { SPACING_VALUES, SIZE_VALUES, WIDGET_Z_INDEX_RANGE } from './types';
import { positionToStyle } from './utils/position';
import {
  shouldShowWidget,
  getTransitionStyle,
  prefersReducedMotion,
  adaptVisibilityForTouch,
} from './utils/visibility';

export interface OverlayWidgetProps {
  /** Widget configuration */
  widget: OverlayWidgetType;

  /** Rendering context */
  context: WidgetContext;

  /** Data for widget render function */
  data: any;

  /** Spacing between widgets */
  spacing: WidgetSpacing;

  /** Click handler callback */
  onWidgetClick: (widgetId: string) => void;

  /** Ref callback for collision detection */
  onRef?: (el: HTMLDivElement | null) => void;

  /** When true, widget is inside a stack group flex container — skip absolute positioning */
  inStack?: boolean;
}

/**
 * Renders an individual overlay widget
 */
export const OverlayWidget: React.FC<OverlayWidgetProps> = ({
  widget,
  context,
  data,
  spacing,
  onWidgetClick,
  onRef,
  inStack = false,
}) => {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [isWidgetHovered, setIsWidgetHovered] = useState(false);
  const [isWidgetFocused, setIsWidgetFocused] = useState(false);
  // TODO: wire up sibling hover detection via OverlayContainer
  const isSiblingHovered = false;
  const [reducedMotion, setReducedMotion] = useState(false);

  // Adapt visibility for touch devices
  const visibility = useMemo(
    () => adaptVisibilityForTouch(widget.visibility),
    [widget.visibility],
  );

  // Check for reduced motion preference
  useEffect(() => {
    setReducedMotion(prefersReducedMotion());

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReducedMotion(mediaQuery.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Determine if widget should be visible
  const isVisible = shouldShowWidget(visibility.trigger, {
    isHovered: isWidgetHovered,
    isContainerHovered: context.isHovered,
    isSiblingHovered,
    isFocused: isWidgetFocused,
    isActive: false, // TODO: Track active state
    customConditions: context.customState,
  });

  // Calculate position styles (skipped when inside a stack group flex container)
  const positionStyles = useMemo(
    () => inStack ? {} : positionToStyle(widget.position),
    [widget.position, inStack],
  );

  // Calculate transition styles
  const transitionStyles = useMemo(
    () => getTransitionStyle(visibility, isVisible, reducedMotion),
    [visibility, isVisible, reducedMotion],
  );

  // Keep anchor translation and transition transforms together.
  // Without composition, transition transform can override anchor centering
  // (e.g. bottom-center translateX(-50%)), causing visual/click drift.
  const composedTransform = useMemo(() => {
    const positionTransform = (positionStyles as React.CSSProperties).transform;
    const transitionTransform = (transitionStyles as React.CSSProperties).transform;

    if (positionTransform && transitionTransform) {
      return `${positionTransform} ${transitionTransform}`;
    }
    return positionTransform ?? transitionTransform;
  }, [positionStyles, transitionStyles]);

  // Calculate size
  const size = widget.style?.size;
  const sizeValue = useMemo(() => {
    if (typeof size === 'number') {
      return size;
    }
    if (typeof size === 'string') {
      return SIZE_VALUES[size as keyof typeof SIZE_VALUES];
    }
    return undefined;
  }, [size]);

  // Calculate z-index from priority or explicit style
  // Priority maps to z-index: higher priority = higher z-index
  // If explicit zIndex is provided in style, it takes precedence
  const zIndex = widget.style?.zIndex ?? (widget.priority ?? WIDGET_Z_INDEX_RANGE.default);

  // Calculate spacing offset (if in a group)
  const spacingValue = SPACING_VALUES[spacing];

  // Render widget content (done early so inStack can detect null renders)
  const content = widget.render(data, context);

  // For stacked widgets: determine if this item should be collapsed.
  // Collapsed when the visibility system hides it OR the render returns null.
  const isStackCollapsed = inStack && (!isVisible || content == null);

  // Combine all styles
  // Note: widget.style properties override positionStyles if specified
  const combinedStyles: React.CSSProperties = inStack
    ? {
        // Stack items use grid-template-rows for smooth height collapse.
        // Margin-bottom handles spacing (not flex gap) so collapsed items
        // don't leave empty gaps.
        display: 'grid',
        gridTemplateRows: isStackCollapsed ? '0fr' : '1fr',
        opacity: isStackCollapsed ? 0 : (widget.style?.opacity ?? 1),
        marginBottom: isStackCollapsed ? 0 : spacingValue,
        pointerEvents: widget.style?.pointerEvents ?? (isStackCollapsed ? 'none' : 'auto'),
        transition: 'grid-template-rows 150ms ease-out, opacity 150ms ease-out, margin-bottom 150ms ease-out',
        zIndex,
        padding: widget.style?.padding,
        maxWidth: widget.style?.maxWidth,
        ...(sizeValue ? { width: sizeValue } : {}),
      }
    : {
        ...positionStyles,
        ...transitionStyles,
        ...(composedTransform ? { transform: composedTransform } : {}),
        zIndex,
        opacity: widget.style?.opacity,
        padding: widget.style?.padding,
        // Position overrides (for widgets that need inset-0 style positioning)
        ...(widget.style?.top !== undefined && { top: widget.style.top }),
        ...(widget.style?.left !== undefined && { left: widget.style.left }),
        ...(widget.style?.right !== undefined && { right: widget.style.right }),
        ...(widget.style?.bottom !== undefined && { bottom: widget.style.bottom }),
        width: widget.style?.width,
        height: widget.style?.height,
        maxWidth: widget.style?.maxWidth,
        maxHeight: widget.style?.maxHeight,
        pointerEvents: widget.style?.pointerEvents ?? (isVisible ? 'auto' : 'none'),
        ...(sizeValue ? { width: sizeValue, height: sizeValue } : {}),
      };

  // Handle widget hover
  const handleMouseEnter = () => {
    setIsWidgetHovered(true);
  };

  const handleMouseLeave = () => {
    setIsWidgetHovered(false);
  };

  // Handle widget focus
  const handleFocus = () => {
    setIsWidgetFocused(true);
  };

  const handleBlur = () => {
    setIsWidgetFocused(false);
  };

  // Handle click (only for wrapper-driven interaction)
  const handleClick = () => {
    if (widget.interactive && !widget.handlesOwnInteraction) {
      onWidgetClick(widget.id);
    }
  };

  // Keyboard handler (only for wrapper-driven interaction)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (widget.interactive && !widget.handlesOwnInteraction && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onWidgetClick(widget.id);
    }
  };

  // Additional classes
  const className = widget.style?.className ?? '';
  // Only apply cursor-pointer for wrapper-driven interactive widgets
  const interactiveClass = widget.interactive && !widget.handlesOwnInteraction ? 'cursor-pointer' : '';

  // Determine if wrapper should be focusable and have button role
  const isWrapperInteractive = widget.interactive && !widget.handlesOwnInteraction;
  const role = isWrapperInteractive ? 'button' : undefined;
  const tabIndex = isWrapperInteractive ? (widget.tabIndex ?? 0) : widget.tabIndex;

  return (
    <div
      ref={(el) => {
        widgetRef.current = el;
        onRef?.(el);
      }}
      className={`${className} ${interactiveClass}`.trim()}
      style={combinedStyles}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={role}
      aria-label={widget.ariaLabel}
      tabIndex={tabIndex}
      data-widget-id={widget.id}
      data-widget-type={widget.type}
    >
      {/* Inner overflow:hidden wrapper is required for grid-template-rows
          collapse animation when inStack. Without it 0fr won't clip content. */}
      {inStack ? <div style={{ overflow: 'hidden' }}>{content}</div> : content}
    </div>
  );
};

OverlayWidget.displayName = 'OverlayWidget';
