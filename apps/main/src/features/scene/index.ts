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
 * import { ScenePlaybackPanel } from '@features/scene';
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
// Stores
// ============================================================================

export { useWorldContextStore } from './stores/worldContextStore';
export { useProjectSessionStore } from './stores/projectSessionStore';

// ============================================================================
// Plugin SDK - Stable Exports for Scene View Plugins
// ============================================================================
//
// These exports form the stable API for scene view plugins.
// Breaking changes to these exports require a major version bump.
//
// Plugin developers should import from '@features/scene' for:
// - Comic panel data access (getActiveComicPanels, getComicPanelById, etc.)
// - Comic panel types (SceneMetaComicPanel, ComicPanelLayout, etc.)
// - Asset utilities (ensureAssetRef, extractNumericAssetId)
// - React components (ComicPanelView)
//
// See: docs/PLUGIN_ARCHITECTURE.md § Scene View Plugins

export {
  // Components
  ComicPanelView,
  type ComicPanelViewProps,

  // Data Access Functions (Stable Plugin SDK)
  getActiveComicPanels,
  getComicPanelById,
  getComicPanelsByTags,
  getComicPanelAssetIds,
  setCurrentComicPanel,
  clearCurrentComicPanel,

  // Types (Stable Plugin SDK)
  type ComicPanelLayout,
  type ComicPanelSession,
  type ComicPanelSceneMeta,
  type ComicPanelRequestContext,
  type ComicPanelDerivedContext,
  type SceneMetaComicPanel,
  type ComicSessionFlags,

  // Asset Utilities (Stable Plugin SDK)
  ensureAssetRef,
  extractNumericAssetId,
} from './ui/comicPanels';
