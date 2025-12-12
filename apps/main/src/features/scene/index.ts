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

export { PlaybackTimeline, type PlaybackTimelineProps, type PlaybackEvent } from './components/player/PlaybackTimeline';
export { SceneStateEditor, type SceneStateEditorProps } from './components/player/SceneStateEditor';
