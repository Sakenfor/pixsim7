/**
 * Game Runtime System
 *
 * Core game engine adapters, session management, and runtime helpers.
 * Provides integration between frontend and headless game engine.
 *
 * Two hooks are available:
 * - useGameRuntime: For game interactions, world time, mode transitions
 * - usePixSim7Core: For NPC brain state inspection (dev tools)
 */

// Core hooks
export * from './usePixSim7Core';

// Session management
export * from './session';

// Interactions
export * from './interactionSchema';
export * from './interactions';

// Relationships & NPCs
export * from './relationshipHelpers';
export * from './relationshipComputation';
export * from './npcPreferences';
export * from './slotAssignment';

// Custom helpers
export * from './customHelpers';

// Runtime
export * from './runtime';
