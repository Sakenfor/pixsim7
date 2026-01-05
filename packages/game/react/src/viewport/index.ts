/**
 * Viewport Module
 *
 * Generic runtime state management for 2D/3D scenes.
 * Provides store factories and context providers for:
 * - Viewport: Selection, hover, and mode state
 * - Playback: Animation/video playback controls
 * - Loading: Loading status with error handling
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
} from './viewport';

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
} from './playback';

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
} from './loading';
