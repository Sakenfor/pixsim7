/**
 * Panel Widget
 *
 * Pre-built widget for information panels and overlays
 * Uses shared Panel component as base with additional styling variants
 */

import React, { ReactNode } from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Panel } from '@pixsim7/shared.ui';
import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';

export interface PanelWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /**
   * Panel title binding.
   * Use createBindingFromValue() for static values or functions.
   */
  titleBinding?: DataBinding<string>;

  /**
   * Panel content binding.
   * Use createBindingFromValue() for static values or functions.
   */
  contentBinding?: DataBinding<ReactNode>;

  /** Enable backdrop/background */
  backdrop?: boolean;

  /** Maximum width */
  maxWidth?: number | string;

  /** Maximum height */
  maxHeight?: number | string;

  /** Panel variant */
  variant?: 'default' | 'dark' | 'glass';

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;

  /** Click handler (for interactive panels) */
  onClick?: (data: any) => void;
}

/**
 * Creates a panel widget from configuration
 */
export function createPanelWidget(config: PanelWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    titleBinding,
    contentBinding,
    backdrop = false,
    maxWidth,
    maxHeight,
    variant = 'default',
    className = '',
    priority,
    onClick,
  } = config;

  return {
    id,
    type: 'panel',
    position,
    visibility,
    priority,
    interactive: Boolean(onClick),
    onClick,
    style: {
      maxWidth,
      maxHeight,
    },
    render: (data, context) => {
      const resolvedTitle = resolveDataBinding(titleBinding, data);
      const resolvedContent = resolveDataBinding(contentBinding, data);

      // Additional styling for variants
      const variantClasses = {
        default: '', // Use shared Panel's default styling
        dark: '!bg-black/80 !text-white !border-white/10',
        glass: '!bg-white/10 backdrop-blur-md !text-white !border-white/20',
      };

      return (
        <Panel
          padded={backdrop}
          className={`
            ${variantClasses[variant]}
            ${!backdrop ? 'p-3' : ''}
            ${className}
          `.trim()}
        >
          {resolvedTitle && (
            <div className="text-sm font-semibold mb-2 border-b border-current/10 pb-2">
              {resolvedTitle}
            </div>
          )}

          <div className="text-sm">
            {resolvedContent}
          </div>
        </Panel>
      );
    },
  };
}
