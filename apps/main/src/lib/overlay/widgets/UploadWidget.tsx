/**
 * Upload Widget
 *
 * Generic upload button with state tracking (idle, uploading, success, error)
 * Integrates with ProgressWidget for upload progress display
 */

import React from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Button } from '@pixsim/shared/ui';
import { Icon } from '@/lib/icons';
import type { DataBinding } from '@/lib/editing-core';
import { resolveDataBinding, createBindingFromValue } from '@/lib/editing-core';

export type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export interface UploadWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /**
   * Current upload state
   * Preferred: Use stateBinding with DataBinding<UploadState>
   * Legacy: UploadState | string | ((data: any) => UploadState)
   */
  state?: UploadState | string | ((data: any) => UploadState);
  stateBinding?: DataBinding<UploadState>;

  /**
   * Upload progress (0-100, only used when state is 'uploading')
   * Preferred: Use progressBinding with DataBinding<number>
   * Legacy: number | string | ((data: any) => number)
   */
  progress?: number | string | ((data: any) => number);
  progressBinding?: DataBinding<number>;

  /** Button label for each state */
  labels?: {
    idle?: string;
    uploading?: string;
    success?: string;
    error?: string;
  };

  /** Icons for each state */
  icons?: {
    idle?: string;
    uploading?: string;
    success?: string;
    error?: string;
  };

  /** Upload click handler */
  onUpload?: (data: any) => void | Promise<void>;

  /** Retry handler (shown on error) */
  onRetry?: (data: any) => void | Promise<void>;

  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost';

  /** Button size */
  size?: 'sm' | 'md' | 'lg';

  /** Show progress bar */
  showProgress?: boolean;

  /** Auto-hide success state after delay (ms) */
  successDuration?: number;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;
}

/**
 * Creates an upload widget from configuration
 */
export function createUploadWidget(config: UploadWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    state: stateProp,
    stateBinding,
    progress: progressProp,
    progressBinding,
    labels = {
      idle: 'Upload',
      uploading: 'Uploading...',
      success: 'Uploaded',
      error: 'Failed',
    },
    icons = {
      idle: 'upload',
      uploading: 'loader',
      success: 'check',
      error: 'alertCircle',
    },
    onUpload,
    onRetry,
    variant = 'secondary',
    size = 'sm',
    showProgress = true,
    successDuration,
    className = '',
    priority,
  } = config;

  // Create bindings (prefer new DataBinding, fall back to legacy pattern)
  const finalStateBinding = stateBinding || (stateProp !== undefined ? createBindingFromValue('state', stateProp) : undefined);
  const finalProgressBinding = progressBinding || (progressProp !== undefined ? createBindingFromValue('progress', progressProp) : undefined);

  return {
    id,
    type: 'upload',
    position,
    visibility,
    priority,
    interactive: true,
    render: (data: any) => {
      // ✨ Resolve bindings using editing-core DataBinding system
      const state = resolveDataBinding(finalStateBinding, data) ?? 'idle';
      const progress = resolveDataBinding(finalProgressBinding, data) ?? 0;

      const handleClick = async () => {
        if (state === 'uploading') return;

        if (state === 'error' && onRetry) {
          await onRetry(data);
        } else if (onUpload) {
          await onUpload(data);
        }
      };

      // State-based styling
      const stateConfig = {
        idle: {
          label: labels.idle || 'Upload',
          icon: icons.idle || 'upload',
          variant: variant,
          disabled: false,
        },
        uploading: {
          label: labels.uploading || 'Uploading...',
          icon: icons.uploading || 'loader',
          variant: 'secondary' as const,
          disabled: true,
        },
        success: {
          label: labels.success || 'Uploaded',
          icon: icons.success || 'check',
          variant: 'secondary' as const,
          disabled: true,
        },
        error: {
          label: labels.error || 'Failed',
          icon: icons.error || 'alertCircle',
          variant: 'danger' as const,
          disabled: false,
        },
      };

      const currentConfig = stateConfig[state];

      return (
        <div className={`flex flex-col gap-1 ${className}`}>
          {/* Upload button */}
          <Button
            onClick={handleClick}
            variant={currentConfig.variant}
            size={size}
            disabled={currentConfig.disabled}
            className={`
              ${state === 'uploading' ? 'cursor-wait' : ''}
              ${state === 'success' ? 'bg-green-500 hover:bg-green-600' : ''}
              ${state === 'error' ? 'bg-red-500 hover:bg-red-600' : ''}
            `}
          >
            {/* Icon */}
            <Icon
              name={currentConfig.icon}
              size={size === 'sm' ? 12 : size === 'md' ? 14 : 16}
              className={state === 'uploading' ? 'animate-spin' : ''}
            />

            {/* Label */}
            <span className="ml-1.5">{currentConfig.label}</span>
          </Button>

          {/* Progress bar (only shown when uploading) */}
          {showProgress && state === 'uploading' && (
            <div className="w-full">
              <div className="h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
              {progress > 0 && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {Math.round(progress)}%
                </span>
              )}
            </div>
          )}

          {/* Error message hint */}
          {state === 'error' && (
            <span className="text-xs text-red-600 dark:text-red-400">
              Click to retry
            </span>
          )}
        </div>
      );
    },
  };
}
