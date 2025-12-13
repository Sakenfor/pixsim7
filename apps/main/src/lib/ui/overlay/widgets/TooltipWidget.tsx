/**
 * Tooltip Widget
 *
 * Generic rich tooltip widget for displaying contextual information
 * Supports text, icons, lists, and custom content on hover/focus
 */

import React, { useState, useRef, useEffect } from 'react';
import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';
import { Icon } from '@lib/icons';

export interface TooltipContent {
  /** Title text */
  title?: string;

  /** Description text */
  description?: string | string[];

  /** Icon */
  icon?: string;

  /** Icon color */
  iconColor?: string;

  /** List items */
  items?: Array<{
    label: string;
    value?: string;
    icon?: string;
  }>;

  /** Custom React content */
  custom?: React.ReactNode;
}

export interface TooltipWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration */
  visibility: VisibilityConfig;

  /** Tooltip content */
  content: TooltipContent | ((data: any) => TooltipContent);

  /** Trigger element (icon/badge/text that shows tooltip on hover) */
  trigger?: {
    type: 'icon' | 'text' | 'badge';
    icon?: string;
    label?: string;
    className?: string;
  };

  /** Tooltip placement relative to trigger */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';

  /** Show arrow pointing to trigger */
  showArrow?: boolean;

  /** Delay before showing tooltip (ms) */
  delay?: number;

  /** Max width of tooltip */
  maxWidth?: number;

  /** Enable rich formatting (multiline, lists, etc.) */
  rich?: boolean;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;
}

/**
 * Creates a tooltip widget from configuration
 */
export function createTooltipWidget(config: TooltipWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility,
    content: contentProp,
    trigger = { type: 'icon', icon: 'info' },
    placement = 'auto',
    showArrow = true,
    delay = 300,
    maxWidth = 280,
    rich = true,
    className = '',
    priority,
  } = config;

  return {
    id,
    type: 'tooltip',
    position,
    visibility,
    priority,
    interactive: true,
    handlesOwnInteraction: true, // Tooltip manages its own hover/focus interaction internally
    render: (data: any) => {
      const [isVisible, setIsVisible] = useState(false);
      const [actualPlacement, setActualPlacement] = useState(placement);
      const timeoutRef = useRef<NodeJS.Timeout>();
      const triggerRef = useRef<HTMLDivElement>(null);
      const tooltipRef = useRef<HTMLDivElement>(null);

      const content = typeof contentProp === 'function' ? contentProp(data) : contentProp;

      // Auto-calculate placement if set to 'auto'
      useEffect(() => {
        if (placement !== 'auto' || !isVisible || !triggerRef.current || !tooltipRef.current) {
          return;
        }

        const triggerRect = triggerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight,
        };

        // Check available space in each direction
        const space = {
          top: triggerRect.top,
          bottom: viewport.height - triggerRect.bottom,
          left: triggerRect.left,
          right: viewport.width - triggerRect.right,
        };

        // Choose placement with most space
        const maxSpace = Math.max(space.top, space.bottom, space.left, space.right);
        if (maxSpace === space.top) setActualPlacement('top');
        else if (maxSpace === space.bottom) setActualPlacement('bottom');
        else if (maxSpace === space.left) setActualPlacement('left');
        else setActualPlacement('right');
      }, [isVisible, placement]);

      const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => {
          setIsVisible(true);
        }, delay);
      };

      const handleMouseLeave = () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        setIsVisible(false);
      };

      const renderTrigger = () => {
        if (trigger.type === 'icon') {
          return (
            <div
              className={`
                p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700
                transition-colors cursor-help ${trigger.className || ''}
              `}
            >
              <Icon
                name={trigger.icon || 'info'}
                size={14}
                className="text-neutral-500 dark:text-neutral-400"
              />
            </div>
          );
        }

        if (trigger.type === 'text') {
          return (
            <span
              className={`
                text-sm underline decoration-dotted cursor-help
                ${trigger.className || ''}
              `}
            >
              {trigger.label || 'Info'}
            </span>
          );
        }

        // Badge type
        return (
          <div
            className={`
              px-2 py-0.5 rounded-full text-xs font-medium
              bg-neutral-200 dark:bg-neutral-700
              text-neutral-700 dark:text-neutral-300
              cursor-help ${trigger.className || ''}
            `}
          >
            {trigger.icon && <Icon name={trigger.icon} size={10} className="mr-1" />}
            {trigger.label || '?'}
          </div>
        );
      };

      const renderContent = () => {
        if (content.custom) {
          return content.custom;
        }

        return (
          <div className="space-y-2">
            {/* Title with icon */}
            {(content.title || content.icon) && (
              <div className="flex items-center gap-2">
                {content.icon && (
                  <Icon
                    name={content.icon}
                    size={16}
                    className={content.iconColor || 'text-blue-500'}
                  />
                )}
                {content.title && (
                  <h4 className="font-semibold text-sm">{content.title}</h4>
                )}
              </div>
            )}

            {/* Description */}
            {content.description && (
              <div className="text-xs text-neutral-600 dark:text-neutral-300">
                {Array.isArray(content.description) ? (
                  <ul className="list-disc list-inside space-y-1">
                    {content.description.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{content.description}</p>
                )}
              </div>
            )}

            {/* Items list */}
            {content.items && content.items.length > 0 && (
              <div className="space-y-1.5">
                {content.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      {item.icon && (
                        <Icon name={item.icon} size={12} className="text-neutral-500" />
                      )}
                      <span className="text-neutral-600 dark:text-neutral-400">
                        {item.label}
                      </span>
                    </div>
                    {item.value && (
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {item.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      };

      const placementClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
      };

      const arrowClasses = {
        top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
        bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
        left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
        right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
      };

      return (
        <div
          ref={triggerRef}
          className={`relative inline-block ${className}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Trigger */}
          {renderTrigger()}

          {/* Tooltip */}
          {isVisible && (
            <div
              ref={tooltipRef}
              className={`
                absolute z-50 ${placementClasses[actualPlacement]}
                bg-white dark:bg-neutral-800
                border border-neutral-200 dark:border-neutral-700
                rounded-lg shadow-lg p-3
                ${rich ? 'min-w-[180px]' : 'whitespace-nowrap'}
              `}
              style={{ maxWidth }}
            >
              {/* Arrow */}
              {showArrow && (
                <div
                  className={`
                    absolute w-0 h-0
                    border-4 ${arrowClasses[actualPlacement]}
                    border-white dark:border-neutral-800
                  `}
                />
              )}

              {/* Content */}
              {renderContent()}
            </div>
          )}
        </div>
      );
    },
  };
}
