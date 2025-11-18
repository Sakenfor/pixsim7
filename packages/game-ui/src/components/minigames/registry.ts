/**
 * Built-in Mini-Game Registrations
 *
 * This file provides registration functions for built-in mini-games.
 * Applications should call these functions during initialization to register mini-games.
 */

import { registerMiniGame, type MiniGameDefinition } from '@pixsim7/scene-gizmos';
import { ReflexMiniGame } from './ReflexMiniGame';

/**
 * Register the Reflex mini-game
 */
export function registerReflexMiniGame() {
  const reflexDefinition: MiniGameDefinition<
    { rounds?: number; windowMs?: number },
    { success: boolean; score: number }
  > = {
    id: 'reflex',
    name: 'Reflex Challenge',
    description: 'Test your reflexes by hitting the button when it turns green',
    category: 'timing',
    icon: '⚡',
    defaultConfig: {
      rounds: 3,
      windowMs: 1000,
    },
    component: ReflexMiniGame as any,
  };

  registerMiniGame(reflexDefinition);
}

/**
 * Register all built-in mini-games from @pixsim7/game-ui
 */
export function registerBuiltInMiniGames() {
  registerReflexMiniGame();
}
