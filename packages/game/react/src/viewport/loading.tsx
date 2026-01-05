/**
 * Loading Store
 *
 * Generic loading state management.
 * Uses status enum to avoid inconsistent states.
 */

import { createContext, useContext, useRef, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

/**
 * Loading status enum
 * Single source of truth for loading state - no separate isLoading boolean
 */
export type LoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Loading state
 */
export interface LoadingState {
  /** Current loading status */
  status: LoadingStatus;
  /** Error message (only set when status === 'error') */
  error: string | null;
}

/**
 * Loading actions
 */
export interface LoadingActions {
  /** Transition to loading state */
  startLoading: () => void;
  /** Transition to loaded state */
  setLoaded: () => void;
  /** Transition to error state with message */
  setError: (error: string) => void;
  /** Reset to idle state */
  reset: () => void;
}

/**
 * Combined loading store type
 */
export type LoadingStore = LoadingState & LoadingActions;

/**
 * Options for creating a loading store
 */
export interface CreateLoadingStoreOptions {
  /** Initial status (default: 'idle') */
  initialStatus?: LoadingStatus;
}

// =============================================================================
// Default State
// =============================================================================

const DEFAULT_STATE: LoadingState = {
  status: 'idle',
  error: null,
};

// =============================================================================
// Store Factory
// =============================================================================

/**
 * Create an isolated loading store instance.
 */
export function createLoadingStore(
  options?: CreateLoadingStoreOptions
): StoreApi<LoadingStore> {
  const initialState: LoadingState = {
    status: options?.initialStatus ?? 'idle',
    error: null,
  };

  return createStore<LoadingStore>()(
    subscribeWithSelector((set) => ({
      // State
      ...initialState,

      // Actions
      startLoading: () => set({ status: 'loading', error: null }),

      setLoaded: () => set({ status: 'loaded', error: null }),

      setError: (error) => set({ status: 'error', error }),

      reset: () => set(initialState),
    }))
  );
}

// =============================================================================
// Context
// =============================================================================

const LoadingContext = createContext<StoreApi<LoadingStore> | null>(null);

/**
 * Props for LoadingProvider
 */
export interface LoadingProviderProps {
  children: ReactNode;
  /** Optional pre-created store */
  store?: StoreApi<LoadingStore>;
  /** Initial status */
  initialStatus?: LoadingStatus;
}

/**
 * Provider component for loading state.
 */
export function LoadingProvider({
  children,
  store: externalStore,
  initialStatus,
}: LoadingProviderProps) {
  const storeRef = useRef<StoreApi<LoadingStore> | null>(null);

  if (!storeRef.current) {
    storeRef.current = externalStore ?? createLoadingStore({ initialStatus });
  }

  return (
    <LoadingContext.Provider value={storeRef.current}>
      {children}
    </LoadingContext.Provider>
  );
}

/**
 * Hook to access the loading store.
 * Must be used within a LoadingProvider.
 */
export function useLoadingStore(): StoreApi<LoadingStore> {
  const store = useContext(LoadingContext);
  if (!store) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return store;
}

/**
 * Hook to access loading state and actions.
 * Primary API for components.
 */
export function useLoading(): LoadingStore {
  const store = useLoadingStore();
  return useStore(store);
}

/**
 * Hook with selector for optimized subscriptions.
 */
export function useLoadingSelector<T>(
  selector: (state: LoadingStore) => T
): T {
  const store = useLoadingStore();
  return useStore(store, selector);
}

// =============================================================================
// Selectors & Helpers
// =============================================================================

/** Select status */
export const selectStatus = (s: LoadingState): LoadingStatus => s.status;

/** Select error */
export const selectError = (s: LoadingState): string | null => s.error;

/** Check if currently loading */
export const isLoading = (s: LoadingState): boolean => s.status === 'loading';

/** Check if loaded successfully */
export const isLoaded = (s: LoadingState): boolean => s.status === 'loaded';

/** Check if in error state */
export const isError = (s: LoadingState): boolean => s.status === 'error';

/** Check if idle (not started) */
export const isIdle = (s: LoadingState): boolean => s.status === 'idle';

/** Check if done (loaded or error) */
export const isDone = (s: LoadingState): boolean =>
  s.status === 'loaded' || s.status === 'error';
