/**
 * Modular Interaction System
 *
 * Each interaction type is a self-contained module that provides:
 * - Type definitions
 * - UI configuration schema
 * - Handler logic
 * - Backend endpoint info
 */

import type { NpcSlotAssignment } from '../slotAssignment';
import type { GameSessionDTO } from '../../api/game';

/**
 * Base configuration for any interaction type
 */
export interface BaseInteractionConfig {
  enabled: boolean;
}

/**
 * API client interface injected into interaction context.
 * Prevents each plugin from importing and calling APIs directly.
 */
export interface InteractionAPI {
  // Game state
  getSession: (sessionId: number) => Promise<GameSessionDTO>;
  updateSession: (sessionId: number, updates: Partial<GameSessionDTO>) => Promise<GameSessionDTO>;

  // World/NPCs
  getWorld: (worldId: number) => Promise<any>;
  getNpcPresence: (params: any) => Promise<any[]>;

  // Interactions (generic endpoint for future)
  executeInteraction: (payload: any) => Promise<any>;

  // Specific endpoints (backward compat)
  attemptPickpocket: (req: any) => Promise<any>;

  // Scenes
  getScene: (sceneId: number) => Promise<any>;
}

/**
 * Full state snapshot passed to interaction handlers.
 * Includes everything a plugin might need to make decisions.
 */
export interface InteractionState {
  // Current assignment
  assignment: NpcSlotAssignment;

  // Session state (if active)
  gameSession: GameSessionDTO | null;
  sessionFlags: Record<string, any>;
  relationships: Record<string, any>;

  // World state
  worldId: number | null;
  worldTime: { day: number; hour: number };

  // Location context
  locationId: number;
  locationNpcs: any[];

  // Player state (future)
  inventory?: any[];
  stats?: Record<string, number>;
}

/**
 * Context passed to interaction handlers.
 * Provides everything a plugin needs without importing directly.
 */
export interface InteractionContext {
  // Full state snapshot
  state: InteractionState;

  // Typed API client (injected, don't import in plugins)
  api: InteractionAPI;

  // UI callbacks
  onSceneOpen: (sceneId: number, npcId: number) => Promise<void>;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  onSessionUpdate?: (session: GameSessionDTO) => void;
}

/**
 * Result of executing an interaction
 */
export interface InteractionResult {
  success: boolean;
  message?: string;
  triggerScene?: number;
  updateSession?: boolean;
}

/**
 * Form field definition for UI generation
 */
export type FormField =
  | { type: 'number'; key: string; label: string; min?: number; max?: number; step?: number; placeholder?: string }
  | { type: 'text'; key: string; label: string; placeholder?: string }
  | { type: 'array'; key: string; label: string; placeholder?: string; help?: string }
  | { type: 'checkbox'; key: string; label: string };

/**
 * An interaction plugin defines everything needed for an interaction type
 */
export interface InteractionPlugin<TConfig extends BaseInteractionConfig = BaseInteractionConfig> {
  /** Unique identifier for this interaction type */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description: string;

  /** Icon or emoji */
  icon?: string;

  /** Default configuration when enabled */
  defaultConfig: TConfig;

  /** Form fields for configuring this interaction */
  configFields: FormField[];

  /** Execute the interaction (client-side) */
  execute: (config: TConfig, context: InteractionContext) => Promise<InteractionResult>;

  /** Validate configuration */
  validate?: (config: TConfig) => string | null;

  /** Check if interaction is available (optional gates) */
  isAvailable?: (context: InteractionContext) => boolean;
}

/**
 * Registry of all available interaction plugins
 */
export class InteractionRegistry {
  private plugins = new Map<string, InteractionPlugin>();

  register(plugin: InteractionPlugin) {
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): InteractionPlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): InteractionPlugin[] {
    return Array.from(this.plugins.values());
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }
}

// Global registry instance
export const interactionRegistry = new InteractionRegistry();
