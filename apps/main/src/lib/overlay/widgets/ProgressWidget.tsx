/**
 * Progress Widget
 *
 * Generic progress bar/indicator widget for uploads, playback, generation, etc.
 * Supports horizontal/vertical bars, circular progress, and custom styling
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Icon } from '@/lib/icons';
import type { DataBinding } from '@/lib/editing-core';
import { resolveDataBinding, createBindingFromValue } from '@/lib/editing-core';

export interface ProgressWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /**
   * Progress value (0-100)
   * Preferred: Use valueBinding with DataBinding<number>
   * Legacy: number | string | ((data: any) => number)
   */
  value?: number | string | ((data: any) => number);
  valueBinding?: DataBinding<number>;

  /** Maximum value (default 100) */
  max?: number;

  /** Progress bar variant */
  variant?: 'bar' | 'circular' | 'line';

  /** Orientation (for bar variant) */
  orientation?: 'horizontal' | 'vertical';

  /** Size for circular variant */
  size?: 'sm' | 'md' | 'lg';

  /** Color/theme */
  color?: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'gray';

  /** Show percentage label */
  showLabel?: boolean;

  /**
   * Custom label text
   * Preferred: Use labelBinding with DataBinding<string>
   * Legacy: string | ((value: number, data: any) => string)
   */
  label?: string | ((value: number, data: any) => string);
  labelBinding?: DataBinding<string>;

  /** Show icon */
  icon?: string;

  /** Animated/striped effect */
  animated?: boolean;

  /** Progress state */
  state?: 'normal' | 'success' | 'error' | 'warning';

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;
}

/**
 * Creates a progress widget from configuration
 */
export function createProgressWidget(config: ProgressWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    value: valueProp,
    valueBinding,
    max = 100,
    variant = 'bar',
    orientation = 'horizontal',
    size = 'md',
    color = 'blue',
    showLabel = false,
    label: labelProp,
    labelBinding,
    icon,
    animated = false,
    state = 'normal',
    className = '',
    priority,
  } = config;

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    gray: 'bg-gray-500',
  };

  const stateColors = {
    normal: colorClasses[color],
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-orange-500',
  };

  // Create bindings (prefer new DataBinding, fall back to legacy pattern)
  const finalValueBinding = valueBinding || (valueProp !== undefined ? createBindingFromValue('value', valueProp) : undefined);
  const finalLabelBinding = labelBinding || (labelProp !== undefined ? createBindingFromValue('label', labelProp) : undefined);

  return {
    id,
    type: 'progress',
    position,
    visibility,
    priority,
    interactive: false,
    render: (data: any) => {
      // ✨ Resolve bindings using editing-core DataBinding system
      const value = resolveDataBinding(finalValueBinding, data) ?? 0;
      const percentage = Math.max(0, Math.min(100, (value / max) * 100));

      // Resolve label - if binding provided, use it; otherwise default to percentage
      let label = resolveDataBinding(finalLabelBinding, data);
      if (!label) {
        label = `${Math.round(percentage)}%`;
      }

      if (variant === 'circular') {
        const sizeClasses = { sm: 32, md: 48, lg: 64 };
        const sizePx = sizeClasses[size];
        const radius = (sizePx - 8) / 2;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (percentage / 100) * circumference;

        return (
          <div className={`flex items-center justify-center ${className}`}>
            <div className="relative" style={{ width: sizePx, height: sizePx }}>
              {/* Background circle */}
              <svg className="transform -rotate-90" width={sizePx} height={sizePx}>
                <circle
                  cx={sizePx / 2}
                  cy={sizePx / 2}
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-neutral-200 dark:text-neutral-700"
                />
                {/* Progress circle */}
                <circle
                  cx={sizePx / 2}
                  cy={sizePx / 2}
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className={stateColors[state]}
                  style={{
                    transition: 'stroke-dashoffset 0.3s ease',
                  }}
                />
              </svg>

              {/* Center label */}
              {showLabel && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium">{label}</span>
                </div>
              )}
            </div>
          </div>
        );
      }

      if (variant === 'line') {
        return (
          <div className={`flex items-center gap-2 ${className}`}>
            {icon && <Icon name={icon} size={14} />}
            <div
              className={`flex-1 h-0.5 ${stateColors[state]} transition-all duration-300`}
              style={{ width: `${percentage}%` }}
            />
            {showLabel && <span className="text-xs font-medium">{label}</span>}
          </div>
        );
      }

      // Default: bar variant
      const isHorizontal = orientation === 'horizontal';

      return (
        <div className={`flex ${isHorizontal ? 'flex-col' : 'flex-row'} gap-1 ${className}`}>
          {/* Label and icon */}
          {(showLabel || icon) && (
            <div className="flex items-center gap-1.5">
              {icon && <Icon name={icon} size={14} />}
              {showLabel && <span className="text-xs font-medium">{label}</span>}
            </div>
          )}

          {/* Progress bar */}
          <div
            className={`
              ${isHorizontal ? 'w-full h-2' : 'h-full w-2'}
              bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden
            `}
          >
            <div
              className={`
                ${stateColors[state]}
                ${isHorizontal ? 'h-full' : 'w-full'}
                transition-all duration-300 rounded-full
                ${animated ? 'animate-pulse' : ''}
              `}
              style={{
                [isHorizontal ? 'width' : 'height']: `${percentage}%`,
              }}
            />
          </div>
        </div>
      );
    },
  };
}
