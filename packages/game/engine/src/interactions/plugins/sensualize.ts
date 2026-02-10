/**
 * Sensual Touch Interaction Plugin
 *
 * Launches an interactive gizmo-based minigame where the player uses
 * various touch tools on NPC zones. Success depends on NPC preferences,
 * relationship level, and player technique.
 *
 * Moved from apps/main/src/lib/game/interactions/sensualize.ts
 */
import type { IntimacyGatingConfig } from '@pixsim7/shared.types';
import { canAttemptSensualTouch } from '../intimacyGating';

import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
} from '../registry';

/**
 * Sensual Touch interaction config
 */
export interface SensualizeConfig extends BaseInteractionConfig {
  selectedTool: string; // 'touch', 'caress', 'feather', 'silk', etc.
  pattern: 'circular' | 'linear' | 'spiral' | 'wave' | 'pulse';
  baseIntensity: number; // 0-1
  duration: number; // seconds
  minimumAffinity: number; // Required relationship level
  onSuccessFlags?: string[];
  onFailFlags?: string[];
}

/**
 * Sensual Touch interaction plugin
 */
export const sensualizePlugin: InteractionPlugin<SensualizeConfig> = {
  id: 'sensualize',
  name: 'Sensual Touch',
  description: 'Intimate interaction using touch and caresses',
  icon: '💕',
  category: 'romance',
  version: '1.0.0',
  tags: ['romance', 'intimate', 'gizmo', 'minigame'],

  // UI behavior: launches minigame (gizmo interface)
  uiMode: 'minigame',

  // Capabilities for UI hints
  capabilities: {
    modifiesInventory: false,
    affectsRelationship: true,
    hasRisk: true, // Can damage relationship if done wrong
    canBeDetected: false,
    requiresConsent: true, // Important!
    unlockable: true, // Gated by relationship level
  },

  defaultConfig: {
    enabled: true,
    selectedTool: 'touch',
    pattern: 'circular',
    baseIntensity: 0.5,
    duration: 30,
    minimumAffinity: 50,
    onSuccessFlags: [],
    onFailFlags: [],
  },

  configFields: [
    {
      key: 'selectedTool',
      label: 'Touch Tool',
      type: 'select',
      options: [
        { value: 'touch', label: 'Hand (Basic Touch)' },
        { value: 'caress', label: 'Gentle Caress' },
        { value: 'feather', label: 'Feather (Requires Level 20)' },
        { value: 'silk', label: 'Silk Cloth (Requires Level 40)' },
        { value: 'temperature', label: 'Hot/Cold (Requires Level 60)' },
      ],
      description: 'Tool to use for the interaction',
    },
    {
      key: 'pattern',
      label: 'Touch Pattern',
      type: 'select',
      options: [
        { value: 'circular', label: 'Circular' },
        { value: 'linear', label: 'Linear' },
        { value: 'spiral', label: 'Spiral' },
        { value: 'wave', label: 'Wave' },
        { value: 'pulse', label: 'Pulse' },
      ],
      description: 'Movement pattern for the touch',
    },
    {
      key: 'baseIntensity',
      label: 'Base Intensity (0-1)',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      description: 'Starting intensity level',
    },
    {
      key: 'duration',
      label: 'Duration (seconds)',
      type: 'number',
      min: 10,
      max: 120,
      step: 5,
      description: 'How long the minigame lasts',
    },
    {
      key: 'minimumAffinity',
      label: 'Minimum Affinity Required',
      type: 'number',
      min: 0,
      max: 100,
      step: 5,
      description: 'Minimum relationship level to attempt',
    },
    {
      key: 'onSuccessFlags',
      label: 'Success Flags (comma-separated)',
      type: 'tags',
      placeholder: 'e.g., romance:intimate_moment, npc_aroused',
      description: 'Flags to set when interaction succeeds',
    },
    {
      key: 'onFailFlags',
      label: 'Fail Flags (comma-separated)',
      type: 'tags',
      placeholder: 'e.g., romance:rejected, npc_uncomfortable',
      description: 'Flags to set when interaction fails',
    },
  ],

  async execute(config: SensualizeConfig, context: InteractionContext): Promise<InteractionResult> {
    const npcId = context.state.assignment.npcId;
    const gameSession = context.state.gameSession;

    if (!npcId) {
      return { success: false, message: 'No NPC assigned to this slot' };
    }

    if (!gameSession) {
      context.onError('No game session active. Please start a scene first.');
      return { success: false, message: 'No active game session' };
    }

    const { session } = context;

    // Build gating config from interaction config
    const gatingConfig: Partial<IntimacyGatingConfig> = {
      interactions: {
        sensualTouch: {
          minimumAffinity: config.minimumAffinity,
        },
      },
    };

    const touchCheck = canAttemptSensualTouch(
      {
        affinity: session.getRelationshipValue(npcId, 'affinity'),
        levelId: session.getIntimacyLevel(npcId),
      },
      gatingConfig
    );

    if (!touchCheck.allowed) {
      context.onError(touchCheck.reason!);
      return { success: false, message: touchCheck.reason! };
    }

    try {
      // Call backend API
      const result = await context.api.attemptSensualTouch({
        npc_id: npcId,
        slot_id: context.state.assignment.slot.id,
        tool_id: config.selectedTool,
        pattern: config.pattern,
        base_intensity: config.baseIntensity,
        duration: config.duration,
        world_id: context.state.worldId,
        session_id: gameSession.id,
      });

      // Show result to user
      if (result.success) {
        context.onSuccess(result.message);
      } else {
        context.onError(result.message);
      }

      // Update session if handler exists
      if (context.onSessionUpdate) {
        const updatedSession = await context.api.getSession(gameSession.id);
        context.onSessionUpdate(updatedSession);
      }

      return {
        success: result.success,
        message: result.message,
        data: result,
      };
    } catch (e: any) {
      const errorMsg = String(e?.message ?? e);
      context.onError(errorMsg);
      return { success: false, message: errorMsg };
    }
  },

  validate(config: SensualizeConfig): string | null {
    if (config.baseIntensity < 0 || config.baseIntensity > 1) {
      return 'Base intensity must be between 0 and 1';
    }
    if (config.duration < 10) {
      return 'Duration must be at least 10 seconds';
    }
    if (config.minimumAffinity < 0 || config.minimumAffinity > 100) {
      return 'Minimum affinity must be between 0 and 100';
    }
    return null;
  },

  // Gate function - checks if this interaction is available
  isAvailable(context: InteractionContext): boolean {
    const npcId = context.state.assignment.npcId;
    if (!npcId) return false;

    const gameSession = context.state.gameSession;
    if (!gameSession) return false;

    const { session } = context;
    const flags = session.getRelationshipFlags(npcId);

    // Available if consent flag is set
    if (flags.includes('romance:consented')) {
      return true;
    }

    // Or check if relationship meets gating requirements
    const touchCheck = canAttemptSensualTouch({
      affinity: session.getRelationshipValue(npcId, 'affinity'),
      levelId: session.getIntimacyLevel(npcId),
    });

    return touchCheck.allowed;
  },
};
