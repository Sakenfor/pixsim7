/**
 * Game World and Simulation Types
 *
 * Type definitions for game worlds, NPCs, sessions, and simulation scheduler.
 * Corresponds to Pydantic schemas in pixsim7/backend/main/domain/game/schemas.py
 */

import type { GameWorldDisplayMeta } from './display';

// ===================
// World Simulation Scheduler Types (Task 21)
// ===================

/**
 * Per-tier NPC limits for world simulation scheduler
 */
export interface WorldSchedulerTierConfig {
  maxNpcs: number;
  description?: string;
  [key: string]: any;
}

/**
 * World simulation scheduler configuration
 * Stored in GameWorld.meta.simulation
 *
 * Controls world time advancement, NPC simulation scheduling,
 * and generation job backpressure.
 */
export interface WorldSchedulerConfig {
  /** Game time multiplier (1 real second = timeScale game seconds) */
  timeScale: number;
  /** Maximum NPC simulation ticks per scheduler step */
  maxNpcTicksPerStep: number;
  /** Maximum generation job operations per scheduler step */
  maxJobOpsPerStep: number;
  /** Real-time interval between scheduler ticks (seconds) */
  tickIntervalSeconds: number;
  /** Per-tier NPC limits */
  tiers: {
    detailed: WorldSchedulerTierConfig;
    active: WorldSchedulerTierConfig;
    ambient: WorldSchedulerTierConfig;
    dormant: WorldSchedulerTierConfig;
    [tierName: string]: WorldSchedulerTierConfig;
  };
  /** If true, scheduler will not advance world_time or process ticks */
  pauseSimulation?: boolean;
  /** Additional scheduler metadata */
  meta?: Record<string, any>;
}

/**
 * Get default world simulation scheduler configuration
 */
export function getDefaultWorldSchedulerConfig(): WorldSchedulerConfig {
  return {
    timeScale: 60.0, // 1 real second = 60 game seconds (1 minute)
    maxNpcTicksPerStep: 50,
    maxJobOpsPerStep: 10,
    tickIntervalSeconds: 1.0,
    tiers: {
      detailed: {
        maxNpcs: 20,
        description: "NPCs near player or critical to scene"
      },
      active: {
        maxNpcs: 100,
        description: "NPCs relevant to current session/arcs"
      },
      ambient: {
        maxNpcs: 500,
        description: "NPCs in same world but not focused"
      },
      dormant: {
        maxNpcs: 5000,
        description: "NPCs not actively simulated"
      }
    },
    pauseSimulation: false,
    meta: {}
  };
}

// ===================
// Game World Types
// ===================

/**
 * Game world metadata structure
 */
export interface GameWorldMeta {
  /** World simulation scheduler config */
  simulation?: WorldSchedulerConfig;
  /** World display configuration (spaces, surfaces, etc.) */
  display?: GameWorldDisplayMeta;
  /** Relationship schemas */
  relationship_schemas?: Record<string, any>;
  /** Intimacy schema */
  intimacy_schema?: Record<string, any>;
  /** NPC mood schema */
  npc_mood_schema?: Record<string, any>;
  /** Behavior configuration */
  behavior?: Record<string, any>;
  /** Metric registry */
  metrics?: Record<string, any>;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * Game world
 */
export interface GameWorld {
  id: number;
  owner_user_id: number;
  name: string;
  meta: GameWorldMeta;
  created_at: string;
}

/**
 * Game world state (time tracking)
 */
export interface GameWorldState {
  world_id: number;
  world_time: number;
  last_advanced_at: string;
  meta?: Record<string, any>;
}

// ===================
// Game Session Types
// ===================

/**
 * Game session
 */
export interface GameSession {
  id: number;
  user_id: number;
  scene_id: number;
  current_node_id: number;
  world_id?: number;
  flags: Record<string, any>;
  relationships: Record<string, any>;
  world_time: number;
  version: number;
  created_at: string;
  updated_at: string;
}

// ===================
// NPC Types
// ===================

/**
 * Game NPC
 */
export interface GameNPC {
  id: number;
  name: string;
  personality?: Record<string, any>;
  home_location_id?: number;
}

/**
 * NPC schedule entry
 */
export interface NPCSchedule {
  id: number;
  npc_id: number;
  day_of_week: number; // 0=Mon
  start_time: number; // Seconds into day
  end_time: number; // Seconds into day
  location_id: number;
  rule?: Record<string, any>;
}

/**
 * NPC state
 */
export interface NPCState {
  npc_id: number;
  current_location_id?: number;
  state: Record<string, any>;
  version: number;
  updated_at: string;
}
