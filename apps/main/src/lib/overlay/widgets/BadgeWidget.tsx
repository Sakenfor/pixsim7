/**
 * Badge Widget
 *
 * Pre-built widget for displaying badges (icons, text, status indicators)
 * Uses shared UI components for consistency where applicable
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Badge } from '@pixsim7/shared.ui';
import { Icon } from '@/lib/icons';
import type { DataBinding } from '@/lib/editing-core';
import { resolveDataBinding, createBindingFromValue } from '@/lib/editing-core';

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

  /**
   * Text label binding (if variant includes text).
   * Use createBindingFromValue() for static values or functions.
   */
  labelBinding?: DataBinding<string>;

  /** Badge color/variant */
  color?: 'blue' | 'green' | 'red' | 'gray' | 'purple' | 'pink' | 'orange' | 'yellow';

  /** Badge shape (for icon-only badges) */
  shape?: 'circle' | 'square' | 'rounded';

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
    labelBinding,
    color = 'gray',
    shape = 'rounded',
    pulse = false,
    tooltip,
    onClick,
    className = '',
    priority,
  } = config;

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
      const resolvedLabel = resolveDataBinding(labelBinding, data);

      // Icon-only badges use custom circular styling
      if (variant === 'icon' && !resolvedLabel) {
        const shapeClasses = {
          circle: 'rounded-full',
          square: 'rounded-none',
          rounded: 'rounded',
        };

        // Color map for icon badges (darker, more prominent)
        const iconColorClasses = {
          blue: 'bg-blue-600 text-white',
          green: 'bg-green-600 text-white',
          red: 'bg-red-600 text-white',
          gray: 'bg-gray-700 text-white',
          purple: 'bg-purple-600 text-white',
          pink: 'bg-pink-600 text-white',
          orange: 'bg-orange-600 text-white',
          yellow: 'bg-yellow-600 text-white',
        };

        return (
          <div
            className={`
              inline-flex items-center justify-center
              w-8 h-8
              ${iconColorClasses[color]}
              ${shapeClasses[shape]}
              ${pulse ? 'animate-pulse' : ''}
              shadow-md
              ${className}
            `.trim()}
            title={tooltip}
          >
            {icon && <Icon name={icon} className="w-4 h-4" />}
          </div>
        );
      }

      // Text and icon-text badges use shared Badge component
      return (
        <Badge
          color={color}
          className={`
            inline-flex items-center gap-1
            ${pulse ? 'animate-pulse' : ''}
            shadow-sm
            ${className}
          `.trim()}
        >
          {(variant === 'icon' || variant === 'icon-text') && icon && (
            <Icon name={icon} className="w-3 h-3" />
          )}
          {resolvedLabel && (
            <span className="whitespace-nowrap">{resolvedLabel}</span>
          )}
        </Badge>
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
      color: 'blue',
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
      ok: { icon: 'check', color: 'green' as const, label: 'OK' },
      warning: { icon: 'alertCircle', color: 'yellow' as const, label: 'Warning' },
      error: { icon: 'x', color: 'red' as const, label: 'Error' },
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
      labelBinding: {
        kind: 'fn',
        target: 'label',
        fn: (data) => {
          const value = typeof count === 'function' ? count(data) : count;
          return value > 99 ? '99+' : String(value);
        },
      },
      color: 'red',
      shape: 'rounded',
      className: 'min-w-[1.25rem] !text-[10px] !px-1.5 !py-0',
    }),
};
