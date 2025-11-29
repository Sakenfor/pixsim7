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

export interface ButtonWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /** Icon name */
  icon?: string;

  /** Button label */
  label?: string;

  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';

  /** Button size */
  size?: 'sm' | 'md' | 'lg';

  /** Click handler */
  onClick: (data: any) => void;

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
    label,
    variant = 'primary',
    size = 'md',
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
    ariaLabel: tooltip ?? label,
    tabIndex: 0,
    onClick,
    render: (data, context) => {
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
        >
          {icon && <Icon name={icon} className={iconSizeClasses[size]} />}
          {label && <span>{label}</span>}
        </Button>
      );
    },
  };
}
