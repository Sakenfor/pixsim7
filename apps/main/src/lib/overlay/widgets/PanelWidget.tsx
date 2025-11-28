/**
 * Panel Widget
 *
 * Pre-built widget for information panels and overlays
 */

import React, { ReactNode } from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';

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
  variant?: 'default' | 'dark' | 'glass' | 'solid';

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

  // Variant classes
  const variantClasses = {
    default: 'bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-white',
    dark: 'bg-black/80 text-white',
    glass: 'bg-white/10 backdrop-blur-md text-white border border-white/20',
    solid: 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
  };

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

      return (
        <div
          className={`
            ${variantClasses[variant]}
            rounded-lg shadow-lg
            ${backdrop ? 'p-4' : 'p-3'}
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
        </div>
      );
    },
  };
}
