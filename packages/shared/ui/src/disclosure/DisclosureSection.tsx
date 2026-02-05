/**
 * DisclosureSection - React component for collapsible content sections
 *
 * A ready-to-use component that combines the disclosure state with
 * proper styling, animations, and accessibility.
 */

import * as React from 'react';
import { useDisclosure } from './useDisclosure';
import clsx from 'clsx';

export interface DisclosureSectionProps {
  /** Section label/title */
  label: React.ReactNode;
  /** Content to show when expanded */
  children: React.ReactNode;
  /** Initial open state */
  defaultOpen?: boolean;
  /** Controlled open state */
  isOpen?: boolean;
  /** Callback when toggled */
  onToggle?: (isOpen: boolean) => void;
  /** Icon style: 'chevron' or 'plusMinus' */
  iconStyle?: 'chevron' | 'plusMinus';
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class for the container */
  className?: string;
  /** Additional class for the header/trigger */
  headerClassName?: string;
  /** Additional class for the content */
  contentClassName?: string;
  /** Whether to show border around content */
  bordered?: boolean;
  /** Disable the toggle interaction */
  disabled?: boolean;
}

/**
 * A collapsible section with header and expandable content
 *
 * @example
 * ```tsx
 * <DisclosureSection label="Details" defaultOpen={false}>
 *   <p>Hidden content here</p>
 * </DisclosureSection>
 * ```
 */
export function DisclosureSection({
  label,
  children,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  iconStyle = 'chevron',
  size = 'sm',
  className,
  headerClassName,
  contentClassName,
  bordered = false,
  disabled = false,
}: DisclosureSectionProps) {
  const disclosure = useDisclosure({
    defaultOpen,
    onToggle,
  });

  // Support controlled mode
  const isOpen = controlledIsOpen ?? disclosure.isOpen;
  const handleToggle = () => {
    if (disabled) return;
    if (controlledIsOpen !== undefined) {
      onToggle?.(!isOpen);
    } else {
      disclosure.toggle();
    }
  };

  const sizeClasses = {
    sm: {
      header: 'text-xs py-1',
      icon: 'w-3 h-3',
      content: 'text-xs',
    },
    md: {
      header: 'text-sm py-1.5',
      icon: 'w-4 h-4',
      content: 'text-sm',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div className={clsx('disclosure-section', className)}>
      {/* Header/Trigger */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-expanded={isOpen}
        className={clsx(
          'flex items-center gap-1.5 w-full text-left font-medium',
          'text-neutral-700 dark:text-neutral-300',
          'hover:text-neutral-900 dark:hover:text-neutral-100',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors',
          sizes.header,
          headerClassName
        )}
      >
        {/* Icon */}
        <span
          className={clsx(
            'flex-shrink-0 transition-transform duration-150',
            'text-neutral-500 dark:text-neutral-400',
            sizes.icon,
            isOpen && iconStyle === 'chevron' && 'rotate-90'
          )}
        >
          {iconStyle === 'chevron' ? (
            <ChevronIcon className="w-full h-full" />
          ) : (
            <span className="font-mono">{isOpen ? '-' : '+'}</span>
          )}
        </span>
        {/* Label */}
        <span className="flex-1">{label}</span>
      </button>

      {/* Content */}
      {isOpen && (
        <div
          className={clsx(
            'disclosure-content',
            'mt-1',
            sizes.content,
            bordered &&
              'pl-4 ml-1.5 border-l-2 border-neutral-200 dark:border-neutral-700',
            contentClassName
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Simple chevron icon (pointing right, rotates down when open)
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ============================================================================
// DisclosureGroup - Container for accordion behavior
// ============================================================================

export interface DisclosureGroupProps {
  /** Child DisclosureSection components */
  children: React.ReactNode;
  /** Allow multiple sections open (false = accordion) */
  allowMultiple?: boolean;
  /** Initially open section IDs */
  defaultOpenIds?: string[];
  /** Additional class */
  className?: string;
}

export interface DisclosureGroupContextValue {
  allowMultiple: boolean;
  openIds: Set<string>;
  toggle: (id: string) => void;
}

export const DisclosureGroupContext = React.createContext<DisclosureGroupContextValue | null>(null);

/**
 * Container for multiple DisclosureSection components with shared state
 *
 * @example
 * ```tsx
 * <DisclosureGroup allowMultiple={false}>
 *   <DisclosureSection id="a" label="Section A">Content A</DisclosureSection>
 *   <DisclosureSection id="b" label="Section B">Content B</DisclosureSection>
 * </DisclosureGroup>
 * ```
 */
export function DisclosureGroup({
  children,
  allowMultiple = true,
  defaultOpenIds = [],
  className,
}: DisclosureGroupProps) {
  const [openIds, setOpenIds] = React.useState<Set<string>>(() => new Set(defaultOpenIds));

  const toggle = React.useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (!allowMultiple) {
            next.clear();
          }
          next.add(id);
        }
        return next;
      });
    },
    [allowMultiple]
  );

  const value = React.useMemo(
    () => ({
      allowMultiple,
      openIds,
      toggle,
    }),
    [allowMultiple, openIds, toggle]
  );

  return (
    <DisclosureGroupContext.Provider value={value}>
      <div className={clsx('disclosure-group space-y-1', className)}>{children}</div>
    </DisclosureGroupContext.Provider>
  );
}
