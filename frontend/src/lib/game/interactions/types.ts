import type { GameSessionDTO, NpcPresenceDTO } from '../../api/game';

/**
 * Base config interface all interaction plugins extend
 */
export interface BaseInteractionConfig {
  enabled: boolean;
}

/**
 * Form field types for auto-generating UI
 */
export type FormFieldType = 'number' | 'text' | 'boolean' | 'select' | 'tags';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  options?: Array<{ value: string | number; label: string }>;
}

/**
 * Interaction execution context - everything a plugin needs
 */
export interface InteractionContext {
  state: InteractionState;
  api: InteractionAPI;
  onSceneOpen: (sceneId: number, npcId: number) => Promise<void>;
  onSessionUpdate?: (session: GameSessionDTO) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

/**
 * Complete world/session/NPC state injected into plugins
 */
export interface InteractionState {
  assignment: NpcSlotAssignment;
  gameSession: GameSessionDTO | null;
  sessionFlags: Record<string, unknown>;
  relationships: Record<string, unknown>;
  worldId: number | null;
  worldTime: { day: number; hour: number };
  locationId: number;
  locationNpcs: NpcPresenceDTO[];
}

/**
 * Typed API client for plugins (NO imports needed in plugins!)
 */
export interface InteractionAPI {
  getSession: (id: number) => Promise<GameSessionDTO>;
  updateSession: (id: number, updates: Partial<GameSessionDTO>) => Promise<GameSessionDTO>;
  attemptPickpocket: (req: PickpocketRequest) => Promise<PickpocketResult>;
  getScene: (id: number) => Promise<any>;
  // Add more API methods as needed
}

export interface NpcSlotAssignment {
  slot: any; // NpcSlot2d
  npcId: number | null;
  matchedRoles: string[];
}

export interface PickpocketRequest {
  npc_id: number;
  slot_id: string;
  base_success_chance: number;
  detection_chance: number;
  world_id: number | null;
  session_id: number;
}

export interface PickpocketResult {
  success: boolean;
  detected: boolean;
  message: string;
}

/**
 * Interaction execution result
 */
export interface InteractionResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

/**
 * Core plugin interface
 */
export interface InteractionPlugin<TConfig extends BaseInteractionConfig> {
  id: string; // Unique ID (e.g., 'pickpocket')
  name: string; // Display name
  description: string; // Short description
  icon?: string; // Emoji or icon
  defaultConfig: TConfig; // Default values when enabled
  configFields: FormField[]; // Auto-generates UI forms
  execute: (config: TConfig, context: InteractionContext) => Promise<InteractionResult>;
  validate?: (config: TConfig) => string | null;
  isAvailable?: (context: InteractionContext) => boolean;
}

/**
 * Plugin registry
 */
export class InteractionRegistry {
  private plugins = new Map<string, InteractionPlugin<any>>();

  register<TConfig extends BaseInteractionConfig>(plugin: InteractionPlugin<TConfig>) {
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): InteractionPlugin<any> | undefined {
    return this.plugins.get(id);
  }

  getAll(): InteractionPlugin<any>[] {
    return Array.from(this.plugins.values());
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }
}

/**
 * Global registry instance
 */
export const interactionRegistry = new InteractionRegistry();

/**
 * Execute an interaction by ID
 */
export async function executeInteraction(
  interactionId: string,
  config: BaseInteractionConfig,
  context: InteractionContext
): Promise<InteractionResult> {
  const plugin = interactionRegistry.get(interactionId);
  if (!plugin) {
    throw new Error(`Unknown interaction plugin: ${interactionId}`);
  }

  // Validate config
  if (plugin.validate) {
    const error = plugin.validate(config);
    if (error) {
      return { success: false, message: error };
    }
  }

  // Check availability
  if (plugin.isAvailable && !plugin.isAvailable(context)) {
    return { success: false, message: `${plugin.name} is not available` };
  }

  // Execute
  return plugin.execute(config, context);
}
