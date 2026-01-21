/**
 * Visibility logic utilities for overlay widgets
 *
 * Handles when widgets should be shown/hidden based on triggers,
 * transitions, and accessibility requirements.
 */

import type { VisibilityConfig, VisibilityTrigger } from '../types';
import { TRANSITION_DURATIONS } from '../types';

/**
 * Determines if a widget should be visible based on its trigger and current state
 */
export function shouldShowWidget(
  trigger: VisibilityTrigger,
  state: {
    isHovered?: boolean;
    isContainerHovered?: boolean;
    isSiblingHovered?: boolean;
    isFocused?: boolean;
    isActive?: boolean;
    customConditions?: Record<string, boolean>;
  },
): boolean {
  if (trigger === 'always') {
    return true;
  }

  if (trigger === 'hover' && state.isHovered) {
    return true;
  }

  if (trigger === 'hover-container' && state.isContainerHovered) {
    return true;
  }

  if (trigger === 'hover-sibling' && state.isSiblingHovered) {
    return true;
  }

  if (trigger === 'focus' && state.isFocused) {
    return true;
  }

  if (trigger === 'active' && state.isActive) {
    return true;
  }

  // Custom condition
  if (typeof trigger === 'object' && 'condition' in trigger) {
    return state.customConditions?.[trigger.condition] ?? false;
  }

  return false;
}

/**
 * Gets the CSS class for transition animation
 */
export function getTransitionClass(
  transition: VisibilityConfig['transition'],
  isVisible: boolean,
): string {
  if (!transition || transition === 'none') {
    return '';
  }

  const baseClass = 'transition-opacity duration-250';

  switch (transition) {
    case 'fade':
      return `${baseClass} ${isVisible ? 'opacity-100' : 'opacity-0'}`;

    case 'slide':
      return `transition-all duration-250 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`;

    case 'scale':
      return `transition-all duration-250 ${
        isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`;

    default:
      return baseClass;
  }
}

/**
 * Gets inline style for transition animation
 */
export function getTransitionStyle(
  config: VisibilityConfig,
  isVisible: boolean,
  prefersReducedMotion: boolean,
): React.CSSProperties {
  const duration = config.transitionDuration ?? TRANSITION_DURATIONS.normal;
  const shouldAnimate = !prefersReducedMotion || !config.reduceMotion;

  if (!shouldAnimate || !config.transition || config.transition === 'none') {
    return {
      display: isVisible ? undefined : 'none',
    };
  }

  const baseStyle: React.CSSProperties = {
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: 'ease-in-out',
  };

  switch (config.transition) {
    case 'fade':
      return {
        ...baseStyle,
        transitionProperty: 'opacity',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
      };

    case 'slide':
      return {
        ...baseStyle,
        transitionProperty: 'opacity, transform',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(0.5rem)',
        pointerEvents: isVisible ? 'auto' : 'none',
      };

    case 'scale':
      return {
        ...baseStyle,
        transitionProperty: 'opacity, transform',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1)' : 'scale(0.95)',
        pointerEvents: isVisible ? 'auto' : 'none',
      };

    default:
      return baseStyle;
  }
}

/**
 * Checks if the user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false; // SSR-safe default
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Creates a visibility state machine for managing delayed show/hide
 */
export class VisibilityStateMachine {
  private showTimeout: ReturnType<typeof setTimeout> | null = null;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private isVisible = false;

  constructor(
    private readonly config: VisibilityConfig,
    private readonly onChange: (visible: boolean) => void,
  ) {}

  /**
   * Triggers the widget to show (with optional delay)
   */
  show(): void {
    // Clear any pending hide timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    const delay = this.config.delay ?? 0;

    if (delay > 0) {
      // Clear existing show timeout
      if (this.showTimeout) {
        clearTimeout(this.showTimeout);
      }

      this.showTimeout = setTimeout(() => {
        this.isVisible = true;
        this.onChange(true);
        this.showTimeout = null;
      }, delay);
    } else {
      this.isVisible = true;
      this.onChange(true);
    }
  }

  /**
   * Triggers the widget to hide (with optional delay)
   */
  hide(): void {
    // Clear any pending show timeout
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }

    const delay = this.config.delay ?? 0;

    if (delay > 0) {
      // Clear existing hide timeout
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
      }

      this.hideTimeout = setTimeout(() => {
        this.isVisible = false;
        this.onChange(false);
        this.hideTimeout = null;
      }, delay);
    } else {
      this.isVisible = false;
      this.onChange(false);
    }
  }

  /**
   * Immediately shows the widget (cancels any delays)
   */
  showImmediate(): void {
    this.clearTimeouts();
    this.isVisible = true;
    this.onChange(true);
  }

  /**
   * Immediately hides the widget (cancels any delays)
   */
  hideImmediate(): void {
    this.clearTimeouts();
    this.isVisible = false;
    this.onChange(false);
  }

  /**
   * Gets current visibility state
   */
  getState(): boolean {
    return this.isVisible;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.clearTimeouts();
  }

  private clearTimeouts(): void {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
}

/**
 * Validates a visibility configuration
 */
export function validateVisibilityConfig(config: VisibilityConfig): string | null {
  // Validate delay
  if (config.delay !== undefined && config.delay < 0) {
    return 'Delay cannot be negative';
  }

  // Validate transition duration
  if (config.transitionDuration !== undefined && config.transitionDuration < 0) {
    return 'Transition duration cannot be negative';
  }

  // Validate trigger
  const validTriggers = ['always', 'hover', 'hover-container', 'hover-sibling', 'focus', 'active'];
  if (typeof config.trigger === 'string' && !validTriggers.includes(config.trigger)) {
    return `Invalid trigger: ${config.trigger}`;
  }

  if (typeof config.trigger === 'object' && !('condition' in config.trigger)) {
    return 'Custom trigger must have a condition property';
  }

  return null;
}

/**
 * Fallback for touch devices - converts some hover triggers to always/focus
 *
 * Supports explicit touchFallback override in config, otherwise falls back
 * to automatic conversion:
 * - 'hover' → 'always'
 * - Other triggers (including hover-container) are left untouched by default
 *
 * Use touchFallback when you need hover-container buttons to be visible on
 * tablets, e.g.: { trigger: 'hover-container', touchFallback: 'always' }
 */
export function adaptVisibilityForTouch(config: VisibilityConfig): VisibilityConfig {
  if (typeof window === 'undefined') {
    return config;
  }

  // Detect touch-only device
  const isTouchOnly = 'ontouchstart' in window && !window.matchMedia('(hover: hover)').matches;

  if (!isTouchOnly) {
    return config;
  }

  // If explicit touchFallback is provided, use it
  if (config.touchFallback) {
    return {
      ...config,
      trigger: config.touchFallback,
    };
  }

  // Default: convert hover to always on touch devices
  const { trigger } = config;

  if (trigger === 'hover') {
    return {
      ...config,
      trigger: 'always',
    };
  }

  return config;
}
