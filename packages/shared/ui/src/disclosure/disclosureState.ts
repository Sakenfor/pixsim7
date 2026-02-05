/**
 * Disclosure State - Pure TypeScript state management for disclosure/collapse patterns
 *
 * Framework-agnostic state logic that can be used with React, Vue, or vanilla JS.
 * Supports single disclosures, accordion groups, and nested structures.
 */

export interface DisclosureState {
  /** Current open/closed state */
  isOpen: boolean;
  /** Toggle the disclosure */
  toggle: () => void;
  /** Explicitly open */
  open: () => void;
  /** Explicitly close */
  close: () => void;
  /** Set state directly */
  setOpen: (isOpen: boolean) => void;
  /** Subscribe to state changes */
  subscribe: (listener: (isOpen: boolean) => void) => () => void;
}

export interface DisclosureOptions {
  /** Initial open state */
  defaultOpen?: boolean;
  /** Callback when state changes */
  onToggle?: (isOpen: boolean) => void;
}

/**
 * Create a single disclosure state manager
 *
 * @example
 * ```ts
 * const disclosure = createDisclosure({ defaultOpen: false });
 * disclosure.toggle();
 * console.log(disclosure.isOpen); // true
 * ```
 */
export function createDisclosure(options: DisclosureOptions = {}): DisclosureState {
  const { defaultOpen = false, onToggle } = options;

  let isOpen = defaultOpen;
  const listeners = new Set<(isOpen: boolean) => void>();

  const notify = () => {
    listeners.forEach((listener) => listener(isOpen));
    onToggle?.(isOpen);
  };

  return {
    get isOpen() {
      return isOpen;
    },
    toggle() {
      isOpen = !isOpen;
      notify();
    },
    open() {
      if (!isOpen) {
        isOpen = true;
        notify();
      }
    },
    close() {
      if (isOpen) {
        isOpen = false;
        notify();
      }
    },
    setOpen(value: boolean) {
      if (isOpen !== value) {
        isOpen = value;
        notify();
      }
    },
    subscribe(listener: (isOpen: boolean) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ============================================================================
// Disclosure Group (Accordion behavior)
// ============================================================================

export interface DisclosureGroupState {
  /** Get open state for an item */
  isOpen: (id: string) => boolean;
  /** Toggle an item */
  toggle: (id: string) => void;
  /** Open an item */
  open: (id: string) => void;
  /** Close an item */
  close: (id: string) => void;
  /** Close all items */
  closeAll: () => void;
  /** Get all open item IDs */
  getOpenIds: () => string[];
  /** Subscribe to changes for a specific item */
  subscribe: (id: string, listener: (isOpen: boolean) => void) => () => void;
  /** Subscribe to any change in the group */
  subscribeAll: (listener: (openIds: string[]) => void) => () => void;
}

export interface DisclosureGroupOptions {
  /** Allow multiple items open at once (false = accordion behavior) */
  allowMultiple?: boolean;
  /** Initially open item IDs */
  defaultOpenIds?: string[];
  /** Callback when any item changes */
  onToggle?: (id: string, isOpen: boolean) => void;
}

/**
 * Create a disclosure group for accordion/multi-select behavior
 *
 * @example
 * ```ts
 * // Accordion - only one open at a time
 * const accordion = createDisclosureGroup({ allowMultiple: false });
 * accordion.open('section-1');
 * accordion.open('section-2'); // closes section-1
 *
 * // Multi-select - multiple can be open
 * const multi = createDisclosureGroup({ allowMultiple: true });
 * multi.open('section-1');
 * multi.open('section-2'); // both remain open
 * ```
 */
export function createDisclosureGroup(options: DisclosureGroupOptions = {}): DisclosureGroupState {
  const { allowMultiple = true, defaultOpenIds = [], onToggle } = options;

  const openIds = new Set<string>(defaultOpenIds);
  const itemListeners = new Map<string, Set<(isOpen: boolean) => void>>();
  const groupListeners = new Set<(openIds: string[]) => void>();

  const notifyItem = (id: string, isOpen: boolean) => {
    itemListeners.get(id)?.forEach((listener) => listener(isOpen));
    onToggle?.(id, isOpen);
  };

  const notifyGroup = () => {
    const ids = Array.from(openIds);
    groupListeners.forEach((listener) => listener(ids));
  };

  return {
    isOpen(id: string) {
      return openIds.has(id);
    },

    toggle(id: string) {
      if (openIds.has(id)) {
        openIds.delete(id);
        notifyItem(id, false);
      } else {
        if (!allowMultiple) {
          // Close all others first
          openIds.forEach((openId) => {
            openIds.delete(openId);
            notifyItem(openId, false);
          });
        }
        openIds.add(id);
        notifyItem(id, true);
      }
      notifyGroup();
    },

    open(id: string) {
      if (!openIds.has(id)) {
        if (!allowMultiple) {
          openIds.forEach((openId) => {
            openIds.delete(openId);
            notifyItem(openId, false);
          });
        }
        openIds.add(id);
        notifyItem(id, true);
        notifyGroup();
      }
    },

    close(id: string) {
      if (openIds.has(id)) {
        openIds.delete(id);
        notifyItem(id, false);
        notifyGroup();
      }
    },

    closeAll() {
      openIds.forEach((id) => {
        openIds.delete(id);
        notifyItem(id, false);
      });
      notifyGroup();
    },

    getOpenIds() {
      return Array.from(openIds);
    },

    subscribe(id: string, listener: (isOpen: boolean) => void) {
      if (!itemListeners.has(id)) {
        itemListeners.set(id, new Set());
      }
      itemListeners.get(id)!.add(listener);
      return () => itemListeners.get(id)?.delete(listener);
    },

    subscribeAll(listener: (openIds: string[]) => void) {
      groupListeners.add(listener);
      return () => groupListeners.delete(listener);
    },
  };
}
