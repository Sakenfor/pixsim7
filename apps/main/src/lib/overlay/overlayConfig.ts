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
} from '@/lib/editing-core';

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
 * Preserves overlay-specific triggers via advanced conditions
 */
function toUnifiedVisibility(visibility: VisibilityConfig): UnifiedVisibility {
  const trigger = visibility.trigger;

  // Simple triggers: 'always', 'hover', 'focus'
  if (trigger === 'always' || trigger === 'hover' || trigger === 'focus') {
    return {
      simple: trigger as SimpleVisibilityTrigger,
    };
  }

  // Overlay-specific triggers: hover-container, hover-sibling, active
  if (trigger === 'hover-container' || trigger === 'hover-sibling' || trigger === 'active') {
    return {
      advanced: [
        {
          id: `overlay-${trigger}`,
          type: 'overlayTrigger',
          params: {
            trigger,
            delay: visibility.delay,
            transition: visibility.transition,
            transitionDuration: visibility.transitionDuration,
            reduceMotion: visibility.reduceMotion,
          },
        },
      ],
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
            reduceMotion: visibility.reduceMotion,
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
 * Helper to extract DataBinding from a widget property
 */
function extractDataBindingFromWidget(widget: any, propName: string): any[] {
  const bindings: any[] = [];
  const bindingProp = `${propName}Binding`;

  if (widget[bindingProp]) {
    const binding = widget[bindingProp];
    if (binding.kind === 'static') {
      bindings.push({
        kind: 'static',
        target: propName,
        staticValue: binding.value,
      });
    } else if (binding.kind === 'path') {
      bindings.push({
        kind: 'path',
        target: propName,
        path: binding.path,
      });
    } else if (binding.kind === 'fn') {
      // Function bindings can't be serialized, skip them
      console.warn(`Skipping non-serializable function binding for ${propName} on widget ${widget.id}`);
    }
  }

  return bindings;
}

/**
 * Convert OverlayWidget to UnifiedWidgetConfig
 * Extracts widget-specific props and bindings for supported widget types
 */
function toUnifiedWidget(widget: OverlayWidget): UnifiedWidgetConfig {
  const bindings: any[] = [];
  const props: Record<string, unknown> = {
    interactive: widget.interactive,
    dismissible: widget.dismissible,
    ariaLabel: widget.ariaLabel,
    tabIndex: widget.tabIndex,
    group: widget.group,
  };

  // Extract type-specific props and bindings
  const widgetAny = widget as any;

  switch (widget.type) {
    case 'badge':
      props.variant = widgetAny.variant;
      props.icon = widgetAny.icon;
      props.color = widgetAny.color;
      props.shape = widgetAny.shape;
      props.pulse = widgetAny.pulse;
      props.tooltip = widgetAny.tooltip;
      bindings.push(...extractDataBindingFromWidget(widgetAny, 'label'));
      break;

    case 'panel':
      props.variant = widgetAny.variant;
      props.backdrop = widgetAny.backdrop;
      bindings.push(...extractDataBindingFromWidget(widgetAny, 'title'));
      bindings.push(...extractDataBindingFromWidget(widgetAny, 'content'));
      break;

    case 'upload':
      props.variant = widgetAny.variant;
      props.size = widgetAny.size;
      props.showProgress = widgetAny.showProgress;
      props.successDuration = widgetAny.successDuration;
      props.labels = widgetAny.labels;
      props.icons = widgetAny.icons;
      bindings.push(...extractDataBindingFromWidget(widgetAny, 'state'));
      bindings.push(...extractDataBindingFromWidget(widgetAny, 'progress'));
      break;

    case 'button':
      props.variant = widgetAny.variant;
      props.size = widgetAny.size;
      props.icon = widgetAny.icon;
      props.disabled = widgetAny.disabled;
      props.tooltip = widgetAny.tooltip;
      bindings.push(...extractDataBindingFromWidget(widgetAny, 'label'));
      break;

    // Add more widget types as needed
  }

  return {
    id: widget.id,
    type: widget.type,
    componentType: 'overlay',
    position: toUnifiedPosition(widget.position, widget.priority),
    visibility: toUnifiedVisibility(widget.visibility),
    style: toUnifiedStyle(widget.style),
    props,
    bindings: bindings.length > 0 ? bindings : undefined,
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
export function fromUnifiedPosition(position: UnifiedPosition): WidgetPosition {
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
 * Restores overlay-specific triggers from advanced conditions
 */
export function fromUnifiedVisibility(visibility?: UnifiedVisibility): VisibilityConfig {
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

    // Restore overlay-specific triggers
    if (first.type === 'overlayTrigger' && first.params?.trigger) {
      const trigger = first.params.trigger as string;
      return {
        trigger: trigger as VisibilityTrigger,
        delay: first.params?.delay as number | undefined,
        transition: first.params?.transition as any,
        transitionDuration: first.params?.transitionDuration as number | undefined,
        reduceMotion: first.params?.reduceMotion as boolean | undefined,
      };
    }

    // Custom conditions
    return {
      trigger: { condition: first.id },
      delay: first.params?.delay as number | undefined,
      transition: first.params?.transition as any,
      transitionDuration: first.params?.transitionDuration as number | undefined,
      reduceMotion: first.params?.reduceMotion as boolean | undefined,
    };
  }

  return { trigger: 'always' };
}

/**
 * Convert UnifiedStyle to WidgetStyle
 */
export function fromUnifiedStyle(style?: UnifiedStyle): WidgetStyle | undefined {
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

// ============================================================================
// Registry-Based Reconstruction (Task 94.1)
// ============================================================================

import { createWidget, type WidgetRuntimeOptions } from '@/lib/editing-core/registry/widgetRegistry';

/**
 * Build fully functional OverlayWidget instances from a UnifiedSurfaceConfig
 * using the widget registry. This enables reconstruction of real widgets with
 * render functions, bindings, and click handlers.
 *
 * @param surfaceConfig - The unified surface configuration
 * @param runtimeOptions - Optional runtime options (onClick callbacks, etc.)
 * @returns A complete OverlayConfiguration with renderable widgets
 */
export function buildOverlayConfigFromUnified(
  surfaceConfig: UnifiedSurfaceConfig,
  runtimeOptions?: Record<string, WidgetRuntimeOptions>
): OverlayConfiguration {
  const widgets: OverlayWidget[] = [];

  for (const widgetConfig of surfaceConfig.widgets) {
    const options = runtimeOptions?.[widgetConfig.id];
    const widget = createWidget<OverlayWidget>(widgetConfig.type, widgetConfig, options);

    if (widget) {
      widgets.push(widget);
    } else {
      console.warn(`Failed to create widget: ${widgetConfig.id} (type: ${widgetConfig.type})`);
    }
  }

  return {
    id: surfaceConfig.id,
    name: surfaceConfig.name,
    description: surfaceConfig.description,
    widgets,
  };
}
