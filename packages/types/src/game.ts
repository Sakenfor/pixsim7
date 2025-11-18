/**
 * Game DTO types for PixSim7 game systems
 * Shared between frontend and game-core
 */

// ===================
// Location Types
// ===================

export interface GameLocationSummary {
  id: number;
  name: string;
  asset_id?: number | null;
  default_spawn?: string | null;
}

export interface GameHotspotDTO {
  id?: number;
  object_name: string;
  hotspot_id: string;
  linked_scene_id?: number | null;
  meta?: Record<string, unknown> | null;
}

export interface NpcTalkConfig {
  npcId?: number | null; // Optional override; else use assigned NPC
  preferredSceneId?: number | null;
}

export interface PickpocketConfig {
  baseSuccessChance: number;
  detectionChance: number;
  onSuccessFlags?: string[];
  onFailFlags?: string[];
}

export interface NpcSlotInteractions {
  canTalk?: boolean;
  npcTalk?: NpcTalkConfig;
  canPickpocket?: boolean;
  pickpocket?: PickpocketConfig;
}

export interface NpcSlot2d {
  id: string;
  x: number; // Normalized 0-1 position
  y: number; // Normalized 0-1 position
  roles?: string[];
  fixedNpcId?: number | null;
  interactions?: NpcSlotInteractions;
}

export interface GameLocationDetail {
  id: number;
  name: string;
  asset_id?: number | null;
  default_spawn?: string | null;
  meta?: Record<string, unknown> | null;
  hotspots: GameHotspotDTO[];
}

// ===================
// NPC Types
// ===================

export interface GameNpcSummary {
  id: number;
  name: string;
}

export interface GameNpcDetail extends GameNpcSummary {
  /** NPC metadata including preferences, traits, etc. */
  meta?: Record<string, unknown> | null;
  /** Bio/description */
  bio?: string | null;
  /** Current relationship level with player (0-100) */
  relationshipLevel?: number;
}

export interface NpcExpressionDTO {
  id?: number;
  state: string;
  asset_id: number;
  crop?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}

export interface NpcPresenceDTO {
  npc_id: number;
  location_id: number;
  state: Record<string, unknown>;
}

// ===================
// World Types
// ===================

export interface GameWorldSummary {
  id: number;
  name: string;
}

export interface GameWorldDetail {
  id: number;
  name: string;
  meta?: Record<string, unknown> | null;
  world_time: number;
}

// ===================
// Session Types
// ===================

export type SessionKind = 'world' | 'scene';
export type WorldMode = 'turn_based' | 'real_time';

export interface TurnRecord {
  /** Turn number */
  turnNumber: number;
  /** World time at the start of this turn */
  worldTime: number;
  /** Real-world timestamp when turn was taken */
  timestamp: number;
  /** Location ID where turn was taken */
  locationId?: number;
}

export interface WorldSessionFlags {
  /** Unique identifier for the conceptual world */
  id?: string;
  /** Turn-based or real-time mode */
  mode?: WorldMode;
  /** Current location ID in the world */
  currentLocationId?: number;
  /** For turn-based: delta seconds per turn (default: 3600 = 1 hour) */
  turnDeltaSeconds?: number;
  /** Current turn number (for turn-based mode) */
  turnNumber?: number;
  /** Turn history (limited to last N turns) */
  turnHistory?: TurnRecord[];
}

export interface SessionFlags {
  /** Type of session: world (life-sim) or scene (story-based) */
  sessionKind?: SessionKind;
  /** World-specific configuration */
  world?: WorldSessionFlags;
  /** Additional custom flags */
  [key: string]: unknown;
}

export interface GameSessionDTO {
  id: number;
  user_id: number;
  scene_id: number;
  current_node_id: number;
  flags: Record<string, unknown>;
  relationships: Record<string, unknown>;
  world_time: number;
  version: number; // Optimistic locking version, incremented on each update
}

/**
 * Type-safe session update payload - only includes mutable fields
 * Prevents accidentally updating readonly fields like id, user_id, etc.
 */
export interface SessionUpdatePayload {
  world_time?: number;
  flags?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  expected_version?: number; // For optimistic locking
}

// ===================
// Stealth/Interaction Types
// ===================

export interface PickpocketRequest {
  npc_id: number;
  slot_id: string;
  base_success_chance: number;
  detection_chance: number;
  world_id?: number | null;
  session_id: number;
}

export interface PickpocketResponse {
  success: boolean;
  detected: boolean;
  updated_flags: Record<string, unknown>;
  message: string;
}

// ===================
// Quest Types
// ===================

export interface QuestObjectiveDTO {
  id: string;
  description: string;
  completed: boolean;
  progress: number;
  target: number;
  optional: boolean;
}

export interface QuestDTO {
  id: string;
  title: string;
  description: string;
  status: string; // 'active' | 'completed' | 'failed' | 'hidden'
  objectives: QuestObjectiveDTO[];
  metadata: Record<string, unknown>;
}

// ===================
// Inventory Types
// ===================

export interface InventoryItemDTO {
  id: string;
  name: string;
  quantity: number;
  metadata: Record<string, unknown>;
}
