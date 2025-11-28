/**
 * Overlay Configuration Converters
 *
 * Bidirectional converters between Overlay's runtime types and UnifiedSurfaceConfig.
 * Enables cross-editor preset sharing and interoperability with editing-core.
 *
 * Part of Task 102 - Editable UI Core cleanup
 */

import type {
  OverlayConfiguration,
  OverlayWidget,
  OverlayPosition,
  CustomPosition,
  WidgetPosition,
  VisibilityConfig,
  VisibilityTrigger,
  WidgetStyle,
} from './types';
import type {
  UnifiedSurfaceConfig,
  UnifiedWidgetConfig,
  UnifiedAnchor,
  UnifiedPosition,
  UnifiedVisibility,
  SimpleVisibilityTrigger,
  UnifiedStyle,
} from '../editing-core';

// ============================================================================
// Type Converters - Overlay → Unified
// ============================================================================

/**
 * Convert OverlayAnchor to UnifiedAnchor
 */
function toUnifiedAnchor(anchor: string): UnifiedAnchor {
  return anchor as UnifiedAnchor; // 1:1 mapping
}

/**
 * Convert WidgetPosition to UnifiedPosition
 */
function toUnifiedPosition(position: WidgetPosition, order?: number): UnifiedPosition {
  if ('anchor' in position) {
    // OverlayPosition with anchor
    const overlayPos = position as OverlayPosition;
    return {
      mode: 'anchor',
      anchor: toUnifiedAnchor(overlayPos.anchor),
      offset: overlayPos.offset
        ? {
            x: typeof overlayPos.offset.x === 'number' ? overlayPos.offset.x : parseFloat(overlayPos.offset.x) || 0,
            y: typeof overlayPos.offset.y === 'number' ? overlayPos.offset.y : parseFloat(overlayPos.offset.y) || 0,
          }
        : undefined,
      order,
    };
  } else {
    // CustomPosition with x/y coordinates
    const customPos = position as CustomPosition;
    return {
      mode: 'absolute',
      offset: {
        x: typeof customPos.x === 'number' ? customPos.x : parseFloat(customPos.x) || 0,
        y: typeof customPos.y === 'number' ? customPos.y : parseFloat(customPos.y) || 0,
      },
      order,
    };
  }
}

/**
 * Convert VisibilityConfig to UnifiedVisibility
 */
function toUnifiedVisibility(visibility: VisibilityConfig): UnifiedVisibility {
  const trigger = visibility.trigger;

  // Simple triggers: 'always', 'hover', 'focus'
  if (trigger === 'always' || trigger === 'hover' || trigger === 'focus') {
    return {
      simple: trigger as SimpleVisibilityTrigger,
    };
  }

  // Advanced/custom conditions
  if (typeof trigger === 'object' && 'condition' in trigger) {
    return {
      advanced: [
        {
          id: trigger.condition,
          type: 'custom',
          params: {
            delay: visibility.delay,
            transition: visibility.transition,
            transitionDuration: visibility.transitionDuration,
          },
        },
      ],
    };
  }

  // Default to 'always' for other triggers
  return { simple: 'always' };
}

/**
 * Convert WidgetStyle to UnifiedStyle
 */
function toUnifiedStyle(style?: WidgetStyle): UnifiedStyle | undefined {
  if (!style) return undefined;

  return {
    size: style.size,
    opacity: style.opacity,
    padding: style.padding,
    zIndex: style.zIndex,
    className: style.className,
    maxWidth: style.maxWidth,
    maxHeight: style.maxHeight,
  };
}

/**
 * Convert OverlayWidget to UnifiedWidgetConfig
 * Note: Drops runtime properties (render, onClick) as they're not serializable
 */
function toUnifiedWidget(widget: OverlayWidget): UnifiedWidgetConfig {
  return {
    id: widget.id,
    type: widget.type,
    componentType: 'overlay', // Mark as overlay widget
    position: toUnifiedPosition(widget.position, widget.priority),
    visibility: toUnifiedVisibility(widget.visibility),
    style: toUnifiedStyle(widget.style),
    props: {
      interactive: widget.interactive,
      dismissible: widget.dismissible,
      ariaLabel: widget.ariaLabel,
      tabIndex: widget.tabIndex,
      group: widget.group,
    },
    version: 1,
  };
}

/**
 * Convert OverlayConfiguration to UnifiedSurfaceConfig
 * This enables overlay presets to be exported in the unified format
 */
export function toUnifiedSurfaceConfig(config: OverlayConfiguration): UnifiedSurfaceConfig {
  return {
    id: config.id,
    componentType: 'overlay',
    name: config.name,
    description: config.description,
    widgets: config.widgets.map(toUnifiedWidget),
    version: 1,
  };
}

// ============================================================================
// Type Converters - Unified → Overlay
// ============================================================================

/**
 * Convert UnifiedAnchor to OverlayAnchor
 */
function fromUnifiedAnchor(anchor: UnifiedAnchor): string {
  return anchor; // 1:1 mapping
}

/**
 * Convert UnifiedPosition to WidgetPosition
 */
function fromUnifiedPosition(position: UnifiedPosition): WidgetPosition {
  if (position.mode === 'anchor' && position.anchor) {
    return {
      anchor: fromUnifiedAnchor(position.anchor) as any,
      offset: position.offset
        ? {
            x: position.offset.x,
            y: position.offset.y,
          }
        : undefined,
    } as OverlayPosition;
  } else if (position.mode === 'absolute' && position.offset) {
    return {
      x: position.offset.x,
      y: position.offset.y,
    } as CustomPosition;
  }

  // Default to center anchor if unknown
  return {
    anchor: 'center',
  } as OverlayPosition;
}

/**
 * Convert UnifiedVisibility to VisibilityConfig
 */
function fromUnifiedVisibility(visibility?: UnifiedVisibility): VisibilityConfig {
  if (!visibility) {
    return { trigger: 'always' };
  }

  if (visibility.simple) {
    return {
      trigger: visibility.simple as VisibilityTrigger,
    };
  }

  if (visibility.advanced && visibility.advanced.length > 0) {
    const first = visibility.advanced[0];
    return {
      trigger: { condition: first.id },
      delay: first.params?.delay as number | undefined,
      transition: first.params?.transition as any,
      transitionDuration: first.params?.transitionDuration as number | undefined,
    };
  }

  return { trigger: 'always' };
}

/**
 * Convert UnifiedStyle to WidgetStyle
 */
function fromUnifiedStyle(style?: UnifiedStyle): WidgetStyle | undefined {
  if (!style) return undefined;

  return {
    size: style.size as any,
    opacity: style.opacity,
    padding: style.padding,
    zIndex: style.zIndex,
    className: style.className,
    maxWidth: style.maxWidth,
    maxHeight: style.maxHeight,
  };
}

/**
 * Convert UnifiedWidgetConfig to OverlayWidget (partial)
 * Note: Cannot restore runtime properties (render, onClick)
 * These must be re-attached by the widget registry
 */
export function fromUnifiedWidget(widget: UnifiedWidgetConfig): Partial<OverlayWidget> {
  return {
    id: widget.id,
    type: widget.type,
    position: fromUnifiedPosition(widget.position),
    visibility: fromUnifiedVisibility(widget.visibility),
    style: fromUnifiedStyle(widget.style),
    interactive: widget.props?.interactive as boolean | undefined,
    dismissible: widget.props?.dismissible as boolean | undefined,
    ariaLabel: widget.props?.ariaLabel as string | undefined,
    tabIndex: widget.props?.tabIndex as number | undefined,
    group: widget.props?.group as string | undefined,
    priority: widget.position.order,
  };
}

/**
 * Convert UnifiedSurfaceConfig to OverlayConfiguration (partial)
 * Note: Returns a partial config that needs widget render functions attached
 */
export function fromUnifiedSurfaceConfig(config: UnifiedSurfaceConfig): Partial<OverlayConfiguration> {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    // Widgets need render functions attached via widget registry
    widgets: config.widgets.map(fromUnifiedWidget) as OverlayWidget[],
  };
}

/**
 * Check if a UnifiedSurfaceConfig is an overlay configuration
 */
export function isOverlayConfig(config: UnifiedSurfaceConfig): boolean {
  return config.componentType === 'overlay';
}
