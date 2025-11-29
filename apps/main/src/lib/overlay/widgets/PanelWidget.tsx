/**
 * Panel Widget
 *
 * Pre-built widget for information panels and overlays
 * Uses shared Panel component as base with additional styling variants
 */

import React, { ReactNode } from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Panel } from '@pixsim7/shared.ui';
import type { DataBinding } from '@/lib/editing-core';
import { resolveDataBinding, createBindingFromValue } from '@/lib/editing-core';

export interface PanelWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /**
   * Panel title
   * Preferred: Use titleBinding with DataBinding<string>
   * Legacy: string | ((data: any) => string)
   */
  title?: string | ((data: any) => string);
  titleBinding?: DataBinding<string>;

  /**
   * Panel content
   * Preferred: Use contentBinding with DataBinding<ReactNode>
   * Legacy: ReactNode | ((data: any) => ReactNode)
   */
  content?: ReactNode | ((data: any) => ReactNode);
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
    title,
    titleBinding,
    content,
    contentBinding,
    backdrop = false,
    maxWidth,
    maxHeight,
    variant = 'default',
    className = '',
    priority,
    onClick,
  } = config;

  // Create bindings (prefer new DataBinding, fall back to legacy pattern)
  const finalTitleBinding = titleBinding || (title !== undefined ? createBindingFromValue('title', title) : undefined);
  const finalContentBinding = contentBinding || (content !== undefined ? createBindingFromValue('content', content) : undefined);

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
      // ✨ Resolve bindings using editing-core DataBinding system
      const resolvedTitle = resolveDataBinding(finalTitleBinding, data);
      const resolvedContent = resolveDataBinding(finalContentBinding, data);

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
