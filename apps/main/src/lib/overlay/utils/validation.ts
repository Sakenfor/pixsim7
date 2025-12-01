/**
 * Configuration validation utilities
 *
 * Validates overlay configurations and provides actionable error messages
 */

import type {
  OverlayConfiguration,
  OverlayWidget,
  ValidationResult,
  ValidationError,
  WidgetStyle,
} from '../types';
import { WIDGET_Z_INDEX_RANGE, SIZE_VALUES } from '../types';
import { validatePosition } from './position';
import { validateVisibilityConfig } from './visibility';

/**
 * Validates a complete overlay configuration
 */
export function validateConfiguration(
  config: OverlayConfiguration,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate basic fields
  if (!config.id || config.id.trim() === '') {
    errors.push({
      code: 'INVALID_ID',
      message: 'Configuration must have a non-empty id',
      severity: 'error',
    });
  }

  if (!config.name || config.name.trim() === '') {
    errors.push({
      code: 'INVALID_NAME',
      message: 'Configuration must have a non-empty name',
      severity: 'error',
    });
  }

  // Validate widgets array
  if (!Array.isArray(config.widgets)) {
    errors.push({
      code: 'INVALID_WIDGETS',
      message: 'Widgets must be an array',
      severity: 'error',
    });
    return { valid: false, errors };
  }

  if (config.widgets.length === 0) {
    errors.push({
      code: 'EMPTY_WIDGETS',
      message: 'Configuration has no widgets',
      severity: 'warning',
    });
  }

  // Validate each widget
  const widgetIds = new Set<string>();
  const tabIndexes = new Set<number>();

  for (const widget of config.widgets) {
    const widgetErrors = validateWidget(widget);

    // Check for duplicate IDs
    if (widgetIds.has(widget.id)) {
      widgetErrors.push({
        widgetId: widget.id,
        code: 'DUPLICATE_ID',
        message: `Duplicate widget ID: ${widget.id}`,
        severity: 'error',
      });
    }
    widgetIds.add(widget.id);

    // Check for conflicting tabIndex values
    if (widget.tabIndex !== undefined) {
      if (tabIndexes.has(widget.tabIndex)) {
        widgetErrors.push({
          widgetId: widget.id,
          code: 'DUPLICATE_TAB_INDEX',
          message: `Conflicting tabIndex ${widget.tabIndex} on widget ${widget.id}`,
          severity: 'warning',
        });
      }
      tabIndexes.add(widget.tabIndex);
    }

    errors.push(...widgetErrors);
  }

  // Validate default visibility if present
  if (config.defaultVisibility) {
    const visError = validateVisibilityConfig(config.defaultVisibility);
    if (visError) {
      errors.push({
        code: 'INVALID_DEFAULT_VISIBILITY',
        message: `Default visibility: ${visError}`,
        severity: 'error',
      });
    }
  }

  // Validate default style if present
  if (config.defaultStyle) {
    const styleErrors = validateStyle(config.defaultStyle);
    errors.push(...styleErrors);
  }

  return {
    valid: errors.filter((e) => e.severity === 'error').length === 0,
    errors,
  };
}

/**
 * Validates a single widget
 */
export function validateWidget(widget: OverlayWidget): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate ID
  if (!widget.id || widget.id.trim() === '') {
    errors.push({
      widgetId: widget.id,
      code: 'INVALID_WIDGET_ID',
      message: 'Widget must have a non-empty id',
      severity: 'error',
    });
  }

  // Validate type
  if (!widget.type || widget.type.trim() === '') {
    errors.push({
      widgetId: widget.id,
      code: 'INVALID_WIDGET_TYPE',
      message: `Widget ${widget.id} must have a non-empty type`,
      severity: 'error',
    });
  }

  // Validate position
  const posError = validatePosition(widget.position);
  if (posError) {
    errors.push({
      widgetId: widget.id,
      code: 'INVALID_POSITION',
      message: `Widget ${widget.id}: ${posError}`,
      severity: 'error',
    });
  }

  // Validate visibility
  const visError = validateVisibilityConfig(widget.visibility);
  if (visError) {
    errors.push({
      widgetId: widget.id,
      code: 'INVALID_VISIBILITY',
      message: `Widget ${widget.id}: ${visError}`,
      severity: 'error',
    });
  }

  // Validate style if present
  if (widget.style) {
    const styleErrors = validateStyle(widget.style, widget.id);
    errors.push(...styleErrors);
  }

  // Validate render function
  if (typeof widget.render !== 'function') {
    errors.push({
      widgetId: widget.id,
      code: 'INVALID_RENDER',
      message: `Widget ${widget.id} must have a render function`,
      severity: 'error',
    });
  }

  // Validate accessibility
  // Only warn about missing ariaLabel for wrapper-driven interactive widgets
  if (widget.interactive && !widget.ariaLabel && !widget.handlesOwnInteraction) {
    errors.push({
      widgetId: widget.id,
      code: 'MISSING_ARIA_LABEL',
      message: `Interactive widget ${widget.id} should have an ariaLabel (or set handlesOwnInteraction: true if accessibility is handled internally)`,
      severity: 'warning',
    });
  }

  if (widget.tabIndex !== undefined && widget.tabIndex < -1) {
    errors.push({
      widgetId: widget.id,
      code: 'INVALID_TAB_INDEX',
      message: `Widget ${widget.id} has invalid tabIndex (must be >= -1)`,
      severity: 'error',
    });
  }

  // Validate priority
  if (widget.priority !== undefined && widget.priority < 0) {
    errors.push({
      widgetId: widget.id,
      code: 'INVALID_PRIORITY',
      message: `Widget ${widget.id} has negative priority`,
      severity: 'warning',
    });
  }

  return errors;
}

/**
 * Validates widget style configuration
 */
export function validateStyle(
  style: WidgetStyle,
  widgetId?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate size
  if (style.size !== undefined) {
    if (typeof style.size === 'number' && style.size < 0) {
      errors.push({
        widgetId,
        code: 'INVALID_SIZE',
        message: 'Size cannot be negative',
        severity: 'error',
      });
    }

    if (typeof style.size === 'string' && !Object.keys(SIZE_VALUES).includes(style.size)) {
      errors.push({
        widgetId,
        code: 'INVALID_SIZE',
        message: `Invalid size preset: ${style.size}`,
        severity: 'error',
      });
    }
  }

  // Validate opacity
  if (style.opacity !== undefined) {
    if (style.opacity < 0 || style.opacity > 1) {
      errors.push({
        widgetId,
        code: 'INVALID_OPACITY',
        message: 'Opacity must be between 0 and 1',
        severity: 'error',
      });
    }
  }

  // Validate z-index
  if (style.zIndex !== undefined) {
    if (style.zIndex < WIDGET_Z_INDEX_RANGE.min || style.zIndex > WIDGET_Z_INDEX_RANGE.max) {
      errors.push({
        widgetId,
        code: 'ZINDEX_OUT_OF_RANGE',
        message: `Z-index ${style.zIndex} is outside recommended range (${WIDGET_Z_INDEX_RANGE.min}-${WIDGET_Z_INDEX_RANGE.max})`,
        severity: 'warning',
      });
    }
  }

  // Validate padding
  if (style.padding !== undefined) {
    if (typeof style.padding === 'number' && style.padding < 0) {
      errors.push({
        widgetId,
        code: 'INVALID_PADDING',
        message: 'Padding cannot be negative',
        severity: 'error',
      });
    }
  }

  return errors;
}

/**
 * Validates and provides helpful warnings for common issues
 */
export function lintConfiguration(config: OverlayConfiguration): ValidationError[] {
  const warnings: ValidationError[] = [];

  // Check for too many widgets
  if (config.widgets.length > 10) {
    warnings.push({
      code: 'TOO_MANY_WIDGETS',
      message: `Configuration has ${config.widgets.length} widgets. Consider splitting into groups.`,
      severity: 'info',
    });
  }

  // Check for widgets at same position
  const positionMap = new Map<string, string[]>();

  for (const widget of config.widgets) {
    const posKey = JSON.stringify(widget.position);
    const existing = positionMap.get(posKey) ?? [];
    existing.push(widget.id);
    positionMap.set(posKey, existing);
  }

  for (const [pos, ids] of positionMap) {
    if (ids.length > 1 && !config.collisionDetection) {
      warnings.push({
        code: 'OVERLAPPING_WIDGETS',
        message: `Widgets ${ids.join(', ')} are at the same position. Enable collisionDetection or adjust positions.`,
        severity: 'warning',
      });
    }
  }

  // Check for widgets with no visibility trigger
  for (const widget of config.widgets) {
    if (!widget.visibility.trigger) {
      warnings.push({
        widgetId: widget.id,
        code: 'MISSING_VISIBILITY_TRIGGER',
        message: `Widget ${widget.id} has no visibility trigger`,
        severity: 'warning',
      });
    }
  }

  // Check for interactive widgets without onClick
  // (skip widgets that handle their own interaction internally)
  for (const widget of config.widgets) {
    if (widget.interactive && !widget.onClick && !widget.handlesOwnInteraction) {
      warnings.push({
        widgetId: widget.id,
        code: 'INTERACTIVE_WITHOUT_CLICK',
        message: `Interactive widget ${widget.id} has no onClick handler and handlesOwnInteraction is not set`,
        severity: 'info',
      });
    }
  }

  return warnings;
}

/**
 * Runs validation and logs errors/warnings in development
 */
export function validateAndLog(config: OverlayConfiguration): ValidationResult {
  const result = validateConfiguration(config);

  if (process.env.NODE_ENV === 'development') {
    const allIssues = [...result.errors, ...lintConfiguration(config)];

    if (allIssues.length > 0) {
      console.group(`[Overlay] Validation issues for "${config.name}"`);

      const errors = allIssues.filter((e) => e.severity === 'error');
      const warnings = allIssues.filter((e) => e.severity === 'warning');
      const info = allIssues.filter((e) => e.severity === 'info');

      if (errors.length > 0) {
        console.error('Errors:', errors);
      }
      if (warnings.length > 0) {
        console.warn('Warnings:', warnings);
      }
      if (info.length > 0) {
        console.info('Info:', info);
      }

      console.groupEnd();
    }
  }

  return result;
}
