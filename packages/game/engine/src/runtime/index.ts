/**
 * GameRuntime and GameController - session orchestration layer
 *
 * Provides a centralized runtime for managing game sessions, applying interactions,
 * and emitting events that UIs can subscribe to.
 */

// Export types
export * from './types';

// Export implementations
export { GameRuntime, createGameRuntime } from './GameRuntime';
export { GameController, createGameController } from './GameController';
