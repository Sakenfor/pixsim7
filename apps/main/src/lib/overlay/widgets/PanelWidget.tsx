/**
 * Panel Widget
 *
 * Pre-built widget for information panels and overlays
 * Uses shared Panel component as base with additional styling variants
 */

import React, { ReactNode } from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Panel } from '@pixsim/shared/ui';

export interface PanelWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /** Panel title */
  title?: string | ((data: any) => string);

  /** Panel content */
  content: ReactNode | ((data: any) => ReactNode);

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
    content,
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
      // Resolve title and content if they're functions
      const resolvedTitle = typeof title === 'function' ? title(data) : title;
      const resolvedContent = typeof content === 'function' ? content(data) : content;

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
