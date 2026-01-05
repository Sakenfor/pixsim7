/**
 * @pixsim7/game.runtime
 *
 * Generic runtime state management for 2D/3D scenes.
 * Provides store factories and context providers for:
 * - Viewport: Selection, hover, and mode state
 * - Playback: Animation/video playback controls
 * - Loading: Loading status with error handling
 *
 * Each module uses a factory + context pattern that allows
 * multiple isolated instances (e.g., for split panes or 2D/3D).
 *
 * @example
 * ```tsx
 * import {
 *   ViewportProvider, useViewport,
 *   PlaybackProvider, usePlayback,
 *   LoadingProvider, useLoading,
 * } from '@pixsim7/game.runtime';
 *
 * function MyViewport() {
 *   return (
 *     <ViewportProvider initial={{ baseMode: 'edit', modeDetail: 'zones' }}>
 *       <PlaybackProvider>
 *         <LoadingProvider>
 *           <MySceneComponent />
 *         </LoadingProvider>
 *       </PlaybackProvider>
 *     </ViewportProvider>
 *   );
 * }
 *
 * function MySceneComponent() {
 *   const { selectedElementId, select, hover } = useViewport();
 *   const { isPlaying, toggle, setSpeed } = usePlayback();
 *   const { status, startLoading, setLoaded } = useLoading();
 *   // ...
 * }
 * ```
 */

// Viewport
export {
  // Factory
  createViewportStore,
  // Context
  ViewportProvider,
  useViewport,
  useViewportStore,
  useViewportSelector,
  // Selectors
  selectSelectedId,
  selectHoveredId,
  selectMode,
  isSelected,
  isHovered,
  isEditMode,
  isModeDetail,
  // Types
  type BaseMode,
  type ViewportState,
  type ViewportActions,
  type ViewportStore,
  type ViewportProviderProps,
  type CreateViewportStoreOptions,
} from './viewport.js';

// Playback
export {
  // Factory
  createPlaybackStore,
  // Context
  PlaybackProvider,
  usePlayback,
  usePlaybackStore,
  usePlaybackSelector,
  usePlaybackTimeRef,
  usePlaybackTimeControl,
  // Selectors
  selectIsPlaying,
  selectPlaybackSpeed,
  selectDuration,
  // Types
  type PlaybackState,
  type PlaybackActions,
  type PlaybackStore,
  type PlaybackProviderProps,
  type CreatePlaybackStoreOptions,
} from './playback.js';

// Loading
export {
  // Factory
  createLoadingStore,
  // Context
  LoadingProvider,
  useLoading,
  useLoadingStore,
  useLoadingSelector,
  // Selectors
  selectStatus,
  selectError,
  isLoading,
  isLoaded,
  isError,
  isIdle,
  isDone,
  // Types
  type LoadingStatus,
  type LoadingState,
  type LoadingActions,
  type LoadingStore,
  type LoadingProviderProps,
  type CreateLoadingStoreOptions,
} from './loading.js';
