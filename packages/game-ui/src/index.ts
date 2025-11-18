/**
 * @pixsim7/game-ui - Shared game UI components
 *
 * This package contains reusable game UI components and utilities
 * that can be used in both the editor and standalone game player.
 */

export { ScenePlayer } from './components/ScenePlayer';
export type { ScenePlayerProps } from './components/ScenePlayer';

// Mini-games
export { ReflexMiniGame } from './components/minigames/ReflexMiniGame';

// Scene runtime utilities
// TODO: Fix missing sceneCallStack module
// export { callStackManager, bindParameters } from './lib/sceneCallStack';
