/**
 * Scene Feature Module
 *
 * Scene browsing, playback, and management UI components.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { SceneManagementPanel, SceneLibraryPanel, PlaybackTimeline } from '@features/scene';
 *
 * // Or import specific modules
 * import { ScenePlaybackPanel } from '@features/scene/components/panels/ScenePlaybackPanel';
 * ```
 */

// ============================================================================
// Components - Panels
// ============================================================================

export { SceneManagementPanel } from './components/panels/SceneManagementPanel';
export { SceneLibraryPanel } from './components/panels/SceneLibraryPanel';
export { SceneCollectionPanel } from './components/panels/SceneCollectionPanel';
export { SceneBuilderPanel } from './components/panels/SceneBuilderPanel';
export { ScenePlaybackPanel, type ScenePlaybackPanelProps } from './components/panels/ScenePlaybackPanel';

// ============================================================================
// Components - Player
// ============================================================================

export { PlaybackTimeline, type PlaybackTimelineProps } from './components/player/PlaybackTimeline';
export { SceneStateEditor, type SceneStateEditorProps } from './components/player/SceneStateEditor';

// ============================================================================
// Lib - Scene Core
// ============================================================================

export type { PlaybackEvent } from './lib/core';

// ============================================================================
// UI Helpers
// ============================================================================

export {
  ComicPanelView,
  type ComicPanelViewProps,
  type ComicPanelLayout,
  getActiveComicPanels,
  getComicPanelById,
  getComicPanelsByTags,
  getComicPanelAssetIds,
  setCurrentComicPanel,
  clearCurrentComicPanel,
  type ComicPanelSession,
  type ComicPanelSceneMeta,
  type ComicPanelRequestContext,
  type ComicPanelDerivedContext,
  type SceneMetaComicPanel,
  type ComicSessionFlags,
  // Utilities for scene view plugins
  ensureAssetRef,
  extractNumericAssetId,
} from './ui/comicPanels';
