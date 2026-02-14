/**
 * Built-in Mini-Game Registrations
 *
 * This file provides registration functions for built-in mini-games.
 * Applications should call these functions during initialization to register mini-games.
 */

import { registerMiniGame, type MiniGameDefinition, type MiniGameResult } from '@pixsim7/interaction.gizmos';
import { ReflexMiniGame } from './ReflexMiniGame';

/**
 * Register the Reflex mini-game
 */
export function registerReflexMiniGame() {
  const reflexDefinition: MiniGameDefinition<
    { rounds?: number; windowMs?: number },
    MiniGameResult
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
    component: ReflexMiniGame,
  };

  registerMiniGame(reflexDefinition);
}

/**
 * Register all built-in mini-games from @pixsim7/game.components
 */
export function registerBuiltInMiniGames() {
  registerReflexMiniGame();
}
