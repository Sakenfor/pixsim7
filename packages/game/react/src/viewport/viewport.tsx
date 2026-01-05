/**
 * Viewport Store
 *
 * Generic viewport state management for 2D/3D scenes.
 * Uses store factory + context pattern to support multiple viewports.
 */

import { createContext, useContext, useRef, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

/**
 * Base mode for viewport interaction
 */
export type BaseMode = 'view' | 'edit' | 'select';

/**
 * Viewport state
 */
export interface ViewportState {
  /** Currently selected element ID */
  selectedElementId: string | null;
  /** Currently hovered element ID */
  hoveredElementId: string | null;
  /** Base interaction mode */
  baseMode: BaseMode;
  /** Mode detail for extensibility (e.g., 'draw', 'erase', 'zones') */
  modeDetail?: string;
}

/**
 * Viewport actions
 */
export interface ViewportActions {
  /** Select an element */
  select: (id: string | null) => void;
  /** Set hovered element */
  hover: (id: string | null) => void;
  /** Set mode with optional detail */
  setMode: (baseMode: BaseMode, detail?: string) => void;
  /** Reset to initial state */
  reset: () => void;
}

/**
 * Combined viewport store type
 */
export type ViewportStore = ViewportState & ViewportActions;

/**
 * Options for creating a viewport store
 */
export interface CreateViewportStoreOptions {
  /** Initial state overrides */
  initial?: Partial<ViewportState>;
}

// =============================================================================
// Default State
// =============================================================================

const DEFAULT_STATE: ViewportState = {
  selectedElementId: null,
  hoveredElementId: null,
  baseMode: 'view',
  modeDetail: undefined,
};

// =============================================================================
// Store Factory
// =============================================================================

/**
 * Create an isolated viewport store instance.
 * Each call returns a new store - use for independent viewports.
 */
export function createViewportStore(
  options?: CreateViewportStoreOptions
): StoreApi<ViewportStore> {
  const initialState: ViewportState = {
    ...DEFAULT_STATE,
    ...options?.initial,
  };

  return createStore<ViewportStore>()(
    subscribeWithSelector((set) => ({
      // State
      ...initialState,

      // Actions
      select: (id) => set({ selectedElementId: id }),

      hover: (id) => set({ hoveredElementId: id }),

      setMode: (baseMode, detail) =>
        set({ baseMode, modeDetail: detail }),

      reset: () => set(initialState),
    }))
  );
}

// =============================================================================
// Context
// =============================================================================

const ViewportContext = createContext<StoreApi<ViewportStore> | null>(null);

/**
 * Props for ViewportProvider
 */
export interface ViewportProviderProps {
  children: ReactNode;
  /** Optional pre-created store (for advanced use cases) */
  store?: StoreApi<ViewportStore>;
  /** Initial state for auto-created store */
  initial?: Partial<ViewportState>;
}

/**
 * Provider component for viewport state.
 * Creates an isolated store for its subtree.
 */
export function ViewportProvider({
  children,
  store: externalStore,
  initial,
}: ViewportProviderProps) {
  const storeRef = useRef<StoreApi<ViewportStore> | null>(null);

  if (!storeRef.current) {
    storeRef.current = externalStore ?? createViewportStore({ initial });
  }

  return (
    <ViewportContext.Provider value={storeRef.current}>
      {children}
    </ViewportContext.Provider>
  );
}

/**
 * Hook to access the viewport store from context.
 * Must be used within a ViewportProvider.
 */
export function useViewportStore(): StoreApi<ViewportStore> {
  const store = useContext(ViewportContext);
  if (!store) {
    throw new Error('useViewportStore must be used within a ViewportProvider');
  }
  return store;
}

/**
 * Hook to access viewport state and actions.
 * Primary API for components.
 */
export function useViewport(): ViewportStore {
  const store = useViewportStore();
  return useStore(store);
}

/**
 * Hook with selector for optimized subscriptions.
 * Use when you only need specific parts of state.
 */
export function useViewportSelector<T>(
  selector: (state: ViewportStore) => T
): T {
  const store = useViewportStore();
  return useStore(store, selector);
}

// =============================================================================
// Selectors
// =============================================================================

/** Select only the selected element ID */
export const selectSelectedId = (s: ViewportState): string | null =>
  s.selectedElementId;

/** Select only the hovered element ID */
export const selectHoveredId = (s: ViewportState): string | null =>
  s.hoveredElementId;

/** Select the mode state */
export const selectMode = (
  s: ViewportState
): { baseMode: BaseMode; modeDetail?: string } => ({
  baseMode: s.baseMode,
  modeDetail: s.modeDetail,
});

/** Check if an element is selected */
export const isSelected = (s: ViewportState, id: string): boolean =>
  s.selectedElementId === id;

/** Check if an element is hovered */
export const isHovered = (s: ViewportState, id: string): boolean =>
  s.hoveredElementId === id;

/** Check if in edit mode (any detail) */
export const isEditMode = (s: ViewportState): boolean =>
  s.baseMode === 'edit';

/** Check if in specific mode with detail */
export const isModeDetail = (s: ViewportState, detail: string): boolean =>
  s.modeDetail === detail;
