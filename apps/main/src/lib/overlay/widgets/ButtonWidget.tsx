/**
 * Button Widget
 *
 * Pre-built widget for action buttons
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Icon } from '@/components/common/Icon';

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

  // Variant classes
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    ghost: 'bg-transparent hover:bg-white/10 text-white border border-white/20',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

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
      return (
        <button
          className={`
            inline-flex items-center gap-1.5
            ${variantClasses[variant]}
            ${sizeClasses[size]}
            rounded font-medium
            transition-colors
            shadow-md
            focus:outline-none focus:ring-2 focus:ring-white/50
            ${className}
          `.trim()}
          title={tooltip}
          type="button"
        >
          {icon && <Icon name={icon} className={iconSizeClasses[size]} />}
          {label && <span>{label}</span>}
        </button>
      );
    },
  };
}
