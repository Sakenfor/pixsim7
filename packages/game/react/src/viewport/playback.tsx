/**
 * Playback Store
 *
 * Generic playback state management for animations and video.
 * Uses store factory + context pattern.
 *
 * currentTime is handled via ref to avoid high-frequency re-renders.
 */

import {
  createContext,
  useContext,
  useRef,
  useCallback,
  type ReactNode,
  type MutableRefObject,
} from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

/**
 * Playback state stored in Zustand
 * Note: currentTime is NOT in store state - it's in a ref for performance
 */
export interface PlaybackState {
  /** Whether playback is active */
  isPlaying: boolean;
  /** Playback speed multiplier (1.0 = normal) */
  playbackSpeed: number;
  /** Total duration in seconds */
  duration: number;
}

/**
 * Playback actions
 */
export interface PlaybackActions {
  /** Start playback */
  play: () => void;
  /** Pause playback */
  pause: () => void;
  /** Toggle play/pause */
  toggle: () => void;
  /** Set playback speed */
  setSpeed: (speed: number) => void;
  /** Set duration */
  setDuration: (duration: number) => void;
  /** Reset to initial state */
  reset: () => void;
}

/**
 * Combined playback store type
 */
export type PlaybackStore = PlaybackState & PlaybackActions;

/**
 * Options for creating a playback store
 */
export interface CreatePlaybackStoreOptions {
  /** Initial state overrides */
  initial?: Partial<PlaybackState>;
}

/**
 * Context value includes both store and time ref
 */
interface PlaybackContextValue {
  store: StoreApi<PlaybackStore>;
  timeRef: MutableRefObject<number>;
}

// =============================================================================
// Default State
// =============================================================================

const DEFAULT_STATE: PlaybackState = {
  isPlaying: false,
  playbackSpeed: 1,
  duration: 0,
};

// =============================================================================
// Store Factory
// =============================================================================

/**
 * Create an isolated playback store instance.
 * Each call returns a new store.
 */
export function createPlaybackStore(
  options?: CreatePlaybackStoreOptions
): StoreApi<PlaybackStore> {
  const initialState: PlaybackState = {
    ...DEFAULT_STATE,
    ...options?.initial,
  };

  return createStore<PlaybackStore>()(
    subscribeWithSelector((set) => ({
      // State
      ...initialState,

      // Actions
      play: () => set({ isPlaying: true }),

      pause: () => set({ isPlaying: false }),

      toggle: () => set((s) => ({ isPlaying: !s.isPlaying })),

      setSpeed: (speed) => set({ playbackSpeed: speed }),

      setDuration: (duration) => set({ duration }),

      reset: () => set(initialState),
    }))
  );
}

// =============================================================================
// Context
// =============================================================================

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

/**
 * Props for PlaybackProvider
 */
export interface PlaybackProviderProps {
  children: ReactNode;
  /** Optional pre-created store */
  store?: StoreApi<PlaybackStore>;
  /** Initial state for auto-created store */
  initial?: Partial<PlaybackState>;
  /** Initial time value (default: 0) */
  initialTime?: number;
}

/**
 * Provider component for playback state.
 * Creates an isolated store and time ref for its subtree.
 */
export function PlaybackProvider({
  children,
  store: externalStore,
  initial,
  initialTime = 0,
}: PlaybackProviderProps) {
  const storeRef = useRef<StoreApi<PlaybackStore> | null>(null);
  const timeRef = useRef<number>(initialTime);

  if (!storeRef.current) {
    storeRef.current = externalStore ?? createPlaybackStore({ initial });
  }

  const contextValue = useRef<PlaybackContextValue>({
    store: storeRef.current,
    timeRef,
  });

  return (
    <PlaybackContext.Provider value={contextValue.current}>
      {children}
    </PlaybackContext.Provider>
  );
}

/**
 * Hook to access the playback context.
 * Must be used within a PlaybackProvider.
 */
function usePlaybackContext(): PlaybackContextValue {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
}

/**
 * Hook to access the playback store directly.
 */
export function usePlaybackStore(): StoreApi<PlaybackStore> {
  return usePlaybackContext().store;
}

/**
 * Hook to access playback state and actions.
 * Primary API for components.
 */
export function usePlayback(): PlaybackStore {
  const { store } = usePlaybackContext();
  return useStore(store);
}

/**
 * Hook with selector for optimized subscriptions.
 */
export function usePlaybackSelector<T>(
  selector: (state: PlaybackStore) => T
): T {
  const { store } = usePlaybackContext();
  return useStore(store, selector);
}

/**
 * Hook to access the current time ref.
 * Use for high-frequency time updates (RAF loops).
 * Does NOT cause re-renders when time changes.
 */
export function usePlaybackTimeRef(): MutableRefObject<number> {
  return usePlaybackContext().timeRef;
}

/**
 * Hook for time control with imperative API.
 * Returns methods to update and read time without re-renders.
 */
export function usePlaybackTimeControl(): {
  /** Get current time */
  getTime: () => number;
  /** Set current time (does not cause re-render) */
  setTime: (time: number) => void;
  /** Seek to time (clamps to duration) */
  seek: (time: number) => void;
} {
  const { store, timeRef } = usePlaybackContext();

  const getTime = useCallback(() => timeRef.current, [timeRef]);

  const setTime = useCallback(
    (time: number) => {
      timeRef.current = time;
    },
    [timeRef]
  );

  const seek = useCallback(
    (time: number) => {
      const duration = store.getState().duration;
      timeRef.current = Math.max(0, Math.min(duration, time));
    },
    [store, timeRef]
  );

  return { getTime, setTime, seek };
}

// =============================================================================
// Selectors
// =============================================================================

/** Select playing state */
export const selectIsPlaying = (s: PlaybackState): boolean => s.isPlaying;

/** Select playback speed */
export const selectPlaybackSpeed = (s: PlaybackState): number => s.playbackSpeed;

/** Select duration */
export const selectDuration = (s: PlaybackState): number => s.duration;
