/**
 * useDisclosure - React hook for disclosure state management
 *
 * Wraps the framework-agnostic disclosureState for React usage.
 */

import { useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  createDisclosure,
  createDisclosureGroup,
  type DisclosureOptions,
  type DisclosureGroupOptions,
  type DisclosureGroupState,
} from './disclosureState';

// ============================================================================
// Single Disclosure Hook
// ============================================================================

export interface UseDisclosureOptions extends DisclosureOptions {}

export interface UseDisclosureReturn {
  /** Current open state */
  isOpen: boolean;
  /** Toggle open/closed */
  toggle: () => void;
  /** Open the disclosure */
  open: () => void;
  /** Close the disclosure */
  close: () => void;
  /** Set open state directly */
  setOpen: (isOpen: boolean) => void;
  /** Props to spread on the trigger element */
  triggerProps: {
    onClick: () => void;
    'aria-expanded': boolean;
  };
  /** Props to spread on the content element */
  contentProps: {
    hidden: boolean;
  };
}

/**
 * React hook for single disclosure state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isOpen, toggle, triggerProps, contentProps } = useDisclosure({ defaultOpen: false });
 *
 *   return (
 *     <div>
 *       <button {...triggerProps}>Toggle</button>
 *       <div {...contentProps}>Content here</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useDisclosure(options: UseDisclosureOptions = {}): UseDisclosureReturn {
  const [isOpen, setIsOpenState] = useState(options.defaultOpen ?? false);

  const toggle = useCallback(() => {
    setIsOpenState((prev) => {
      const next = !prev;
      options.onToggle?.(next);
      return next;
    });
  }, [options.onToggle]);

  const open = useCallback(() => {
    setIsOpenState((prev) => {
      if (!prev) {
        options.onToggle?.(true);
        return true;
      }
      return prev;
    });
  }, [options.onToggle]);

  const close = useCallback(() => {
    setIsOpenState((prev) => {
      if (prev) {
        options.onToggle?.(false);
        return false;
      }
      return prev;
    });
  }, [options.onToggle]);

  const setOpen = useCallback(
    (value: boolean) => {
      setIsOpenState((prev) => {
        if (prev !== value) {
          options.onToggle?.(value);
          return value;
        }
        return prev;
      });
    },
    [options.onToggle]
  );

  const triggerProps = useMemo(
    () => ({
      onClick: toggle,
      'aria-expanded': isOpen,
    }),
    [toggle, isOpen]
  );

  const contentProps = useMemo(
    () => ({
      hidden: !isOpen,
    }),
    [isOpen]
  );

  return {
    isOpen,
    toggle,
    open,
    close,
    setOpen,
    triggerProps,
    contentProps,
  };
}

// ============================================================================
// Disclosure Group Hook (Accordion)
// ============================================================================

export interface UseDisclosureGroupOptions extends DisclosureGroupOptions {}

export interface UseDisclosureGroupReturn {
  /** Check if an item is open */
  isOpen: (id: string) => boolean;
  /** Toggle an item */
  toggle: (id: string) => void;
  /** Open an item */
  open: (id: string) => void;
  /** Close an item */
  close: (id: string) => void;
  /** Close all items */
  closeAll: () => void;
  /** Get all open IDs */
  openIds: string[];
  /** Get props for an item's trigger */
  getTriggerProps: (id: string) => {
    onClick: () => void;
    'aria-expanded': boolean;
  };
  /** Get props for an item's content */
  getContentProps: (id: string) => {
    hidden: boolean;
  };
}

/**
 * React hook for disclosure group (accordion) state
 *
 * @example
 * ```tsx
 * function Accordion() {
 *   const group = useDisclosureGroup({ allowMultiple: false });
 *
 *   return (
 *     <div>
 *       {items.map(item => (
 *         <div key={item.id}>
 *           <button {...group.getTriggerProps(item.id)}>{item.title}</button>
 *           <div {...group.getContentProps(item.id)}>{item.content}</div>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useDisclosureGroup(options: UseDisclosureGroupOptions = {}): UseDisclosureGroupReturn {
  // Create stable group instance
  const [group] = useState(() => createDisclosureGroup(options));

  // Subscribe to group changes for re-renders
  const openIds = useSyncExternalStore(
    (onStoreChange) => group.subscribeAll(onStoreChange),
    () => group.getOpenIds(),
    () => group.getOpenIds()
  );

  const isOpen = useCallback((id: string) => group.isOpen(id), [group]);
  const toggle = useCallback((id: string) => group.toggle(id), [group]);
  const open = useCallback((id: string) => group.open(id), [group]);
  const close = useCallback((id: string) => group.close(id), [group]);
  const closeAll = useCallback(() => group.closeAll(), [group]);

  const getTriggerProps = useCallback(
    (id: string) => ({
      onClick: () => group.toggle(id),
      'aria-expanded': group.isOpen(id),
    }),
    [group]
  );

  const getContentProps = useCallback(
    (id: string) => ({
      hidden: !group.isOpen(id),
    }),
    [group]
  );

  return {
    isOpen,
    toggle,
    open,
    close,
    closeAll,
    openIds,
    getTriggerProps,
    getContentProps,
  };
}

// Re-export core state creators for advanced usage
export { createDisclosure, createDisclosureGroup } from './disclosureState';
export type { DisclosureState, DisclosureGroupState } from './disclosureState';
