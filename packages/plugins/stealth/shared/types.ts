/**
 * @pixsim7/plugins.stealth - Shared Types
 *
 * Canonical type definitions for the stealth plugin.
 * Single source of truth for both frontend and backend.
 *
 * Backend uses these via aligned Pydantic models in backend/models.py
 * Frontend imports directly from this file.
 */

// =============================================================================
// JSON Schema Types (for configSchema)
// =============================================================================

/**
 * JSON Schema property type
 */
export type JsonSchemaPropertyType =
  | 'number'
  | 'integer'
  | 'string'
  | 'boolean'
  | 'array'
  | 'object';

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  type: JsonSchemaPropertyType;
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: (string | number)[];
  items?: JsonSchemaProperty;
}

/**
 * JSON Schema object
 */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// =============================================================================
// Frontend Manifest Types
// =============================================================================

/**
 * Frontend interaction manifest - describes an interaction to the frontend
 * for dynamic registration via createGenericInteraction
 */
export interface FrontendInteractionManifest {
  /** Unique interaction ID (e.g., 'pickpocket') */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Icon (emoji or icon name) */
  icon: string;
  /** Category for grouping (e.g., 'stealth', 'social') */
  category: string;
  /** Version string */
  version: string;
  /** Tags for filtering */
  tags?: string[];
  /** API endpoint path (relative to /api/v1) */
  apiEndpoint: string;
  /** JSON Schema for the configuration */
  configSchema: JsonSchema;
  /** Default configuration values */
  defaultConfig: Record<string, unknown>;
  /** UI mode for the interaction */
  uiMode?: 'dialogue' | 'notification' | 'silent' | 'custom';
  /** Capabilities for UI hints */
  capabilities?: {
    opensDialogue?: boolean;
    modifiesInventory?: boolean;
    affectsRelationship?: boolean;
    triggersEvents?: boolean;
    hasRisk?: boolean;
    requiresItems?: boolean;
    consumesItems?: boolean;
    canBeDetected?: boolean;
  };
}

/**
 * Frontend plugin manifest - describes a plugin's frontend components
 */
export interface FrontendPluginManifest {
  /** Plugin ID */
  pluginId: string;
  /** Plugin name */
  pluginName: string;
  /** Plugin version */
  version: string;
  /** List of interactions this plugin provides */
  interactions: FrontendInteractionManifest[];
}

// =============================================================================
// Pickpocket Types
// =============================================================================

/**
 * Pickpocket interaction configuration (frontend-only, not API request)
 */
export interface PickpocketConfig {
  /** Whether this interaction is enabled */
  enabled: boolean;
  /** Base probability of success (0-1) */
  baseSuccessChance: number;
  /** Probability of being detected (0-1) */
  detectionChance: number;
  /** Flags to set when pickpocket succeeds */
  onSuccessFlags?: string[];
  /** Flags to set when pickpocket fails */
  onFailFlags?: string[];
}

/**
 * Pickpocket API request payload
 */
export interface PickpocketRequest {
  /** Target NPC ID */
  npc_id: number;
  /** Slot ID where the NPC is assigned */
  slot_id: string;
  /** Base success probability (0-1) */
  base_success_chance: number;
  /** Detection probability (0-1) */
  detection_chance: number;
  /** World ID (optional) */
  world_id: number | null;
  /** Session ID */
  session_id: number;
}

/**
 * Pickpocket API response
 */
export interface PickpocketResponse {
  /** Whether the pickpocket attempt succeeded */
  success: boolean;
  /** Whether the player was detected */
  detected: boolean;
  /** Updated session flags */
  updated_flags: Record<string, unknown>;
  /** Human-readable result message */
  message: string;
}

// =============================================================================
// Stealth Component Types (ECS)
// =============================================================================

/**
 * Pickpocket attempt record stored in ECS component
 */
export interface PickpocketAttemptRecord {
  /** Slot ID where attempt was made */
  slot_id: string;
  /** Whether the attempt succeeded */
  success: boolean;
  /** Whether the player was detected */
  detected: boolean;
  /** Timestamp of the attempt */
  timestamp: number;
}

/**
 * Stealth ECS component stored in session flags
 * Path: GameSession.flags.npcs["npc:{id}"].components.stealth
 */
export interface StealthComponent {
  /** Suspicion level (0-1) - affects detection chance */
  suspicion: number;
  /** Timestamp when player was last caught */
  lastCaughtAt: number | null;
  /** History of pickpocket attempts */
  pickpocketAttempts: PickpocketAttemptRecord[];
  /** Number of times player was detected */
  detectionCount: number;
  /** Number of successful thefts */
  successfulThefts: number;
}

// =============================================================================
// Default Values
// =============================================================================

/**
 * Default pickpocket configuration
 */
export const DEFAULT_PICKPOCKET_CONFIG: PickpocketConfig = {
  enabled: true,
  baseSuccessChance: 0.4,
  detectionChance: 0.3,
  onSuccessFlags: [],
  onFailFlags: [],
};

/**
 * Default stealth component state
 */
export const DEFAULT_STEALTH_COMPONENT: StealthComponent = {
  suspicion: 0,
  lastCaughtAt: null,
  pickpocketAttempts: [],
  detectionCount: 0,
  successfulThefts: 0,
};

/**
 * Pickpocket config JSON Schema for dynamic UI generation
 */
export const PICKPOCKET_CONFIG_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    baseSuccessChance: {
      type: 'number',
      description: 'Base probability of successful pickpocket',
      minimum: 0,
      maximum: 1,
      default: 0.4,
    },
    detectionChance: {
      type: 'number',
      description: 'Probability of being caught',
      minimum: 0,
      maximum: 1,
      default: 0.3,
    },
    onSuccessFlags: {
      type: 'array',
      description: 'Flags to set when pickpocket succeeds',
      items: { type: 'string' },
      default: [],
    },
    onFailFlags: {
      type: 'array',
      description: 'Flags to set when pickpocket fails',
      items: { type: 'string' },
      default: [],
    },
  },
  required: ['baseSuccessChance', 'detectionChance'],
};

/**
 * Frontend manifest for the pickpocket interaction
 */
export const PICKPOCKET_FRONTEND_MANIFEST: FrontendInteractionManifest = {
  id: 'pickpocket',
  name: 'Pickpocket',
  description: 'Attempt to steal from the NPC',
  icon: '\uD83E\uDD0F', // pinching hand emoji
  category: 'stealth',
  version: '1.0.0',
  tags: ['stealth', 'theft', 'risky'],
  apiEndpoint: '/game/stealth/pickpocket',
  configSchema: PICKPOCKET_CONFIG_SCHEMA,
  defaultConfig: {
    baseSuccessChance: DEFAULT_PICKPOCKET_CONFIG.baseSuccessChance,
    detectionChance: DEFAULT_PICKPOCKET_CONFIG.detectionChance,
    onSuccessFlags: DEFAULT_PICKPOCKET_CONFIG.onSuccessFlags,
    onFailFlags: DEFAULT_PICKPOCKET_CONFIG.onFailFlags,
  },
  uiMode: 'notification',
  capabilities: {
    modifiesInventory: true,
    affectsRelationship: true,
    hasRisk: true,
    canBeDetected: true,
  },
};

/**
 * Full frontend plugin manifest for the stealth plugin
 */
export const STEALTH_FRONTEND_MANIFEST: FrontendPluginManifest = {
  pluginId: 'game_stealth',
  pluginName: 'Game Stealth & Pickpocket',
  version: '3.0.0',
  interactions: [PICKPOCKET_FRONTEND_MANIFEST],
};
