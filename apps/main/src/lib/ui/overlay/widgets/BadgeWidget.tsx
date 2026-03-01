/**
 * Badge Widget
 *
 * Pre-built widget for displaying badges (icons, text, status indicators)
 * Uses shared UI components for consistency where applicable
 */

import { Badge } from '@pixsim7/shared.ui';
import React from 'react';

import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';
import { Icon } from '@lib/icons';

import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';

// ---------------------------------------------------------------------------
// Badge position + stackGroup presets
// ---------------------------------------------------------------------------

export const BADGE_SLOT = {
  topLeft:     { position: { anchor: 'top-left',     offset: { x: 4, y: 4 } } as WidgetPosition,   stackGroup: 'badges-tl' },
  topRight:    { position: { anchor: 'top-right',    offset: { x: -4, y: 4 } } as WidgetPosition,  stackGroup: 'badges-tr' },
  bottomLeft:  { position: { anchor: 'bottom-left',  offset: { x: 4, y: -4 } } as WidgetPosition },
  bottomRight: { position: { anchor: 'bottom-right', offset: { x: -4, y: -4 } } as WidgetPosition },
} as const;

// ---------------------------------------------------------------------------
// Semantic priority constants
// ---------------------------------------------------------------------------

export const BADGE_PRIORITY = {
  background:   5,   // use-count, passive info
  info:        10,   // media-type icon, provider status
  status:      15,   // locked-frame, upload status
  interactive: 20,   // set-badge, set-link, action buttons
  slotIndex:   22,   // slot numbering
  important:   25,   // pin toggle, warnings
  action:      30,   // remove button, primary actions
  generation:  35,   // generate button (topmost)
} as const;

// ---------------------------------------------------------------------------
// Default visibility (trigger: 'always', no transition)
// ---------------------------------------------------------------------------

const DEFAULT_VISIBILITY: VisibilityConfig = { trigger: 'always', transition: 'none' };

export interface BadgeWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration (defaults to { trigger: 'always', transition: 'none' }) */
  visibility?: VisibilityConfig;

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
  color?: 'blue' | 'green' | 'red' | 'gray' | 'purple' | 'pink' | 'orange' | 'yellow' | 'accent';

  /** Badge shape (for icon-only badges) */
  shape?: 'circle' | 'square' | 'rounded';

  /** Enable pulse animation */
  pulse?: boolean;

  /** Tooltip text */
  tooltip?: string;

  /** Click handler — receives overlay data and the DOM event */
  onClick?: (data: any, event?: React.MouseEvent) => void;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;

  /** Stack group for auto-stacking with other widgets */
  stackGroup?: string;
}

/**
 * Creates a badge widget from configuration
 */
export function createBadgeWidget(config: BadgeWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility = DEFAULT_VISIBILITY,
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
    stackGroup,
  } = config;

  return {
    id,
    type: 'badge',
    position,
    visibility,
    priority,
    stackGroup,
    interactive: Boolean(onClick),
    ariaLabel: tooltip,
    onClick,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          accent: 'bg-accent text-accent-text',
        };

        return (
          <div
            className={`
              inline-flex items-center justify-center
              cq-btn-md
              ${iconColorClasses[color]}
              ${shapeClasses[shape]}
              ${pulse ? 'animate-pulse' : ''}
              shadow-md
              ${className}
            `.trim()}
            title={tooltip}
          >
            {icon && <Icon name={icon} />}
          </div>
        );
      }

      // Text and icon-text badges use shared Badge component
      return (
        <Badge
          color={color}
          className={`
            cq-badge inline-flex items-center gap-1
            ${pulse ? 'animate-pulse' : ''}
            shadow-sm
            ${className}
          `.trim()}
        >
          {(variant === 'icon' || variant === 'icon-text') && icon && (
            <Icon name={icon} />
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
      className: 'cq-badge-xs min-w-[1.25rem]',
    }),
};
