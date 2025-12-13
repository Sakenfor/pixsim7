/**
 * Button Widget
 *
 * Pre-built widget for action buttons
 * Uses shared Button component for consistency
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Button } from '@pixsim7/shared.ui';
import { Icon } from '@/lib/icons';
import type { DataBinding } from '@/lib/editing-core';
import { resolveDataBinding } from '@/lib/editing-core';

export interface ButtonWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /** Icon name */
  icon?: string;

  /**
   * Button label binding.
   * Use createBindingFromValue() for static values or functions.
   */
  labelBinding?: DataBinding<string>;

  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';

  /** Button size */
  size?: 'sm' | 'md' | 'lg';

  /** Disabled state */
  disabled?: boolean;

  /** Click handler */
  onClick?: (data: any) => void;

  /** Tooltip */
  tooltip?: string;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;
}

/**
 * Icon size mapping for button sizes
 */
const iconSizeClasses = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

/**
 * Creates a button widget from configuration
 */
export function createButtonWidget(config: ButtonWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    icon,
    labelBinding,
    variant = 'primary',
    size = 'md',
    disabled = false,
    onClick,
    tooltip,
    className = '',
    priority,
  } = config;

  return {
    id,
    type: 'button',
    position,
    visibility,
    priority,
    interactive: true,
    handlesOwnInteraction: true, // Button handles its own click
    ariaLabel: tooltip,
    // Let the inner shared Button handle focus/tab order
    render: (data, context) => {
      const resolvedLabel = resolveDataBinding(labelBinding, data);

      // Shared Button component doesn't have 'danger' variant, so we handle it with className
      const buttonVariant = variant === 'danger' ? 'primary' : variant;
      const dangerClass = variant === 'danger'
        ? '!bg-red-600 hover:!bg-red-700 dark:!bg-red-600 dark:hover:!bg-red-700'
        : '';

      return (
        <Button
          variant={buttonVariant}
          size={size}
          className={`${dangerClass} ${className}`.trim()}
          title={tooltip}
          type="button"
          disabled={disabled}
          onClick={() => onClick?.(data)}
        >
          {icon && <Icon name={icon} className={iconSizeClasses[size]} />}
          {resolvedLabel && <span>{resolvedLabel}</span>}
        </Button>
      );
    },
  };
}
