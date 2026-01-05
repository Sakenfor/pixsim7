/**
 * @pixsim7/game.components - Shared game UI components
 *
 * This package contains reusable game UI components and utilities
 * that can be used in both the editor and standalone game player.
 *
 * Architecture:
 * - This package provides GENERIC, reusable UI components
 * - Application-specific components (like gizmo renderers) belong in the consuming app
 * - No imports from parent applications (maintains clean package boundaries)
 *
 * Note: Scene runtime hooks have moved to @pixsim7/game.react
 */

export { ScenePlayer } from './components/ScenePlayer';
export type { ScenePlayerProps } from './components/ScenePlayer';

// Mini-games
export { ReflexMiniGame } from './components/minigames/ReflexMiniGame';
export { MiniGameHost } from './components/minigames/MiniGameHost';
export type { MiniGameHostProps } from './components/minigames/MiniGameHost';

// Mini-game registration
export {
  registerReflexMiniGame,
  registerBuiltInMiniGames,
} from './components/minigames/registry';
