/**
 * Badge Widget
 *
 * Pre-built widget for displaying badges (icons, text, status indicators)
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Icon } from '@/components/common/Icon';

export interface BadgeWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /** Badge variant */
  variant: 'icon' | 'text' | 'icon-text';

  /** Icon name (if variant includes icon) */
  icon?: string;

  /** Text label (if variant includes text) */
  label?: string | ((data: any) => string);

  /** Badge color/variant */
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

  /** Badge shape */
  shape?: 'circle' | 'square' | 'rounded' | 'pill';

  /** Enable pulse animation */
  pulse?: boolean;

  /** Tooltip text */
  tooltip?: string;

  /** Click handler */
  onClick?: (data: any) => void;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;
}

/**
 * Creates a badge widget from configuration
 */
export function createBadgeWidget(config: BadgeWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    variant,
    icon,
    label,
    color = 'neutral',
    shape = 'rounded',
    pulse = false,
    tooltip,
    onClick,
    className = '',
    priority,
  } = config;

  // Color classes
  const colorClasses = {
    primary: 'bg-blue-500 text-white',
    success: 'bg-green-500 text-white',
    warning: 'bg-yellow-500 text-white',
    danger: 'bg-red-500 text-white',
    neutral: 'bg-gray-700 text-white',
  };

  // Shape classes
  const shapeClasses = {
    circle: 'rounded-full',
    square: 'rounded-none',
    rounded: 'rounded',
    pill: 'rounded-full',
  };

  // Size classes based on variant
  const sizeClasses = {
    icon: 'w-8 h-8',
    text: 'px-2 py-1',
    'icon-text': 'px-2 py-1',
  };

  return {
    id,
    type: 'badge',
    position,
    visibility,
    priority,
    interactive: Boolean(onClick),
    ariaLabel: tooltip,
    onClick,
    render: (data, context) => {
      // Resolve label if it's a function
      const resolvedLabel = typeof label === 'function' ? label(data) : label;

      return (
        <div
          className={`
            inline-flex items-center justify-center gap-1
            ${colorClasses[color]}
            ${shapeClasses[shape]}
            ${sizeClasses[variant]}
            ${pulse ? 'animate-pulse' : ''}
            ${className}
            shadow-md
          `.trim()}
          title={tooltip}
        >
          {(variant === 'icon' || variant === 'icon-text') && icon && (
            <Icon name={icon} className="w-4 h-4" />
          )}

          {(variant === 'text' || variant === 'icon-text') && resolvedLabel && (
            <span className="text-xs font-medium whitespace-nowrap">
              {resolvedLabel}
            </span>
          )}
        </div>
      );
    },
  };
}

/**
 * Common badge presets
 */
export const BadgePresets = {
  /**
   * Media type badge (video, image, audio, etc.)
   */
  mediaType: (
    id: string,
    mediaTypeIcon: string,
    position: WidgetPosition = { anchor: 'top-left', offset: { x: 8, y: 8 } },
  ): OverlayWidget =>
    createBadgeWidget({
      id,
      position,
      visibility: { trigger: 'always' },
      variant: 'icon',
      icon: mediaTypeIcon,
      color: 'primary',
      shape: 'circle',
      tooltip: 'Media type',
    }),

  /**
   * Status badge with color
   */
  status: (
    id: string,
    status: 'ok' | 'warning' | 'error',
    position: WidgetPosition = { anchor: 'top-right', offset: { x: -8, y: 8 } },
  ): OverlayWidget => {
    const statusConfig = {
      ok: { icon: 'check', color: 'success' as const, label: 'OK' },
      warning: { icon: 'alertCircle', color: 'warning' as const, label: 'Warning' },
      error: { icon: 'x', color: 'danger' as const, label: 'Error' },
    };

    const config = statusConfig[status];

    return createBadgeWidget({
      id,
      position,
      visibility: { trigger: 'always' },
      variant: 'icon',
      icon: config.icon,
      color: config.color,
      shape: 'circle',
      tooltip: config.label,
    });
  },

  /**
   * Count badge (e.g., number of items)
   */
  count: (
    id: string,
    count: number | ((data: any) => number),
    position: WidgetPosition = { anchor: 'top-right', offset: { x: -4, y: -4 } },
  ): OverlayWidget =>
    createBadgeWidget({
      id,
      position,
      visibility: { trigger: 'always' },
      variant: 'text',
      label: (data) => {
        const value = typeof count === 'function' ? count(data) : count;
        return value > 99 ? '99+' : String(value);
      },
      color: 'danger',
      shape: 'pill',
      className: 'min-w-[1.25rem] text-[10px]',
    }),
};
