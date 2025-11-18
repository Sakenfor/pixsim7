import { ReactNode, useEffect, useState } from 'react';
import { clsx } from 'clsx';

/**
 * Tooltip — canonical tooltip component.
 * REUSE this component for any tooltip across the app.
 *
 * Features:
 * - Positioning (top, bottom, left, right)
 * - Variants (default, info, warning, success)
 * - Delay support
 * - Keyboard shortcut display
 * - Arrow pointing to target
 * - Dismissal management with localStorage
 *
 * Usage:
 * <Tooltip content="Hello!" position="top" show={isHovered}>
 *   <button>Hover me</button>
 * </Tooltip>
 *
 * With shortcut:
 * <Tooltip content="Save" shortcut="⌘S" show={true} />
 */

export interface TooltipProps {
  /** Tooltip content */
  content: ReactNode;
  /** Position relative to target */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Whether to show the tooltip */
  show?: boolean;
  /** Delay before showing (ms) */
  delay?: number;
  /** Visual style variant */
  variant?: 'default' | 'info' | 'warning' | 'success';
  /** Additional CSS classes */
  className?: string;
  /** Keyboard shortcut to display */
  shortcut?: string;
}

const VARIANT_STYLES = {
  default: 'bg-gray-900/95 border-gray-700 text-white',
  info: 'bg-blue-900/95 border-blue-700 text-blue-100',
  warning: 'bg-orange-900/95 border-orange-700 text-orange-100',
  success: 'bg-green-900/95 border-green-700 text-green-100',
};

const POSITION_STYLES = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const ARROW_STYLES = {
  top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
};

export function Tooltip({
  content,
  position = 'top',
  show = false,
  delay = 500,
  variant = 'default',
  className,
  shortcut,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      setVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [show, delay]);

  if (!visible) return null;

  return (
    <div
      className={clsx(
        'absolute z-[10001] pointer-events-none',
        'animate-in fade-in duration-200',
        POSITION_STYLES[position],
        className
      )}
    >
      <div
        className={clsx(
          'px-3 py-2 rounded-lg border backdrop-blur-md shadow-xl',
          'text-sm font-medium whitespace-nowrap',
          'max-w-xs',
          VARIANT_STYLES[variant]
        )}
      >
        <div className="flex items-center gap-2">
          <div>{content}</div>
          {shortcut && (
            <kbd className="px-1.5 py-0.5 text-xs rounded bg-white/10 border border-white/20">
              {shortcut}
            </kbd>
          )}
        </div>
      </div>
      {/* Arrow */}
      <div
        className={clsx(
          'absolute w-0 h-0',
          'border-4',
          ARROW_STYLES[position]
        )}
        style={{
          borderTopColor: variant === 'default' ? '#374151' :
                         variant === 'info' ? '#1e3a8a' :
                         variant === 'warning' ? '#7c2d12' :
                         '#14532d',
          borderBottomColor: variant === 'default' ? '#374151' :
                            variant === 'info' ? '#1e3a8a' :
                            variant === 'warning' ? '#7c2d12' :
                            '#14532d',
          borderLeftColor: variant === 'default' ? '#374151' :
                          variant === 'info' ? '#1e3a8a' :
                          variant === 'warning' ? '#7c2d12' :
                          '#14532d',
          borderRightColor: variant === 'default' ? '#374151' :
                           variant === 'info' ? '#1e3a8a' :
                           variant === 'warning' ? '#7c2d12' :
                           '#14532d',
        }}
      />
    </div>
  );
}

/**
 * Hook to manage tooltip dismissal state with localStorage
 *
 * Usage:
 * const { dismissed, dismiss } = useTooltipDismissal('welcome-tooltip');
 * if (!dismissed) {
 *   return <Tooltip content="Welcome!" />;
 * }
 */
export function useTooltipDismissal(tooltipId: string) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(`tooltip-dismissed-${tooltipId}`) === 'true';
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      localStorage.setItem(`tooltip-dismissed-${tooltipId}`, 'true');
      setDismissed(true);
    } catch {
      // Ignore storage errors
    }
  };

  const reset = () => {
    try {
      localStorage.removeItem(`tooltip-dismissed-${tooltipId}`);
      setDismissed(false);
    } catch {
      // Ignore storage errors
    }
  };

  return { dismissed, dismiss, reset };
}

// Legacy export for backward compatibility
export const CubeTooltip = Tooltip;
export type CubeTooltipProps = TooltipProps;
