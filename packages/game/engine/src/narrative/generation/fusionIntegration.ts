/**
 * Image pool & fusion logic integration
 *
 * Provides fusion-based generation hooks that use multi-image inputs.
 * Uses dynamic slot-based system for flexible asset composition.
 */

import type {
  GenerationHooks,
  GenerationService,
  WorldGenerationOverrides,
  PlayerGenerationPrefs,
  ImagePoolProvider,
  FusionAssetResolver,
  BlockResolverService,
  FusionGenerationConfig,
  FusionAssetRequest,
  FusionAssetSlot,
} from './types';

import type {
  GenerateContentRequest,
  ActionBlockNode,
  AssetRequest,
} from '@pixsim7/shared.types';

/**
 * Determine if fusion should be used based on node and world config.
 */
export function shouldUseFusion(
  node: ActionBlockNode,
  worldConfig?: WorldGenerationOverrides
): boolean {
  // Check node query for character + location combo
  if (node.query) {
    const hasCharacter = !!node.query.pose || !!node.query.intimacy_level;
    const hasLocation = !!node.query.location;
    // Fusion is useful when we have both character context and environment
    if (hasCharacter && hasLocation) {
      return true;
    }
  }

  // Could also check world config for default fusion preference
  return false;
}

/**
 * Build a dynamic slot-based fusion request from ActionBlockNode.
 * Demonstrates the new extensible slot system.
 *
 * @example
 * ```ts
 * const request = buildFusionRequestFromNode(actionBlock, npcId);
 * // Returns slots like:
 * // { role: 'environment', request: { locationId: '...', tags: [...] } }
 * // { role: 'main_character', request: { characterId: '...', providerParams: {...} } }
 * ```
 */
export function buildFusionRequestFromNode(
  node: ActionBlockNode,
  npcId: number
): FusionAssetRequest {
  const slots: FusionAssetSlot[] = [];

  // Add environment slot if location specified
  if (node.query?.location) {
    slots.push({
      role: 'environment',
      request: {
        locationId: node.query.location,
        providerParams: {
          tags: node.query.requiredTags || [],
        },
      },
      layer: 0, // Background layer
    });
  }

  // Add character slot if character context present
  if (node.query?.pose || node.query?.intimacy_level) {
    const characterRequest: AssetRequest = {
      characterId: `npc:${npcId}`,
      providerParams: {
        poseId: node.query.pose,
        intimacyLevel: node.query.intimacy_level,
        mood: node.query.mood,
      },
    };

    slots.push({
      role: 'main_character',
      request: characterRequest,
      layer: 1, // Foreground layer
      priority: 10, // High priority - main focus
    });
  }

  // Could add more slots dynamically based on tags, metadata, etc.
  // Example: props, lighting, effects
  if (node.query?.requiredTags?.includes('prop')) {
    slots.push({
      role: 'props',
      request: {
        providerParams: {
          tags: ['prop'],
          category: 'prop',
        },
      },
      optional: true, // Props are optional
    });
  }

  return {
    slots,
    strategy: 'best_match',
    assetOrder: slots.map(s => s.role), // Explicit ordering
    useFallbackHierarchy: true,
  };
}

/**
 * Create hooks for fusion-based generation.
 *
 * @example
 * ```ts
 * const hooks = createFusionGenerationHooks({
 *   imagePool: myImagePool,
 *   fusionResolver: myFusionResolver,
 *   generationService: myGenerationService,
 * });
 *
 * executor.addHooks(hooks);
 * ```
 */
export function createFusionGenerationHooks(config: {
  imagePool: ImagePoolProvider;
  fusionResolver: FusionAssetResolver;
  generationService: GenerationService;
  blockResolver?: BlockResolverService;
  worldConfig?: WorldGenerationOverrides;
  playerPrefs?: PlayerGenerationPrefs;
}): GenerationHooks {
  const {
    imagePool,
    fusionResolver,
    generationService,
    blockResolver,
    worldConfig,
    playerPrefs,
  } = config;

  return {
    resolveContent: async (context) => {
      if (context.node.type !== 'action_block') {
        return { handled: false };
      }

      const actionBlock = context.node as ActionBlockNode;

      // Check if fusion is enabled for this node
      const fusionConfig = (actionBlock as any).fusionConfig as FusionGenerationConfig | undefined;
      const useFusion = fusionConfig?.useFusion ?? shouldUseFusion(actionBlock, worldConfig);

      if (!useFusion) {
        // Fall back to standard block generation
        if (blockResolver) {
          const resolved = await blockResolver.resolve(actionBlock, {
            npcId: context.npcId,
            session: context.session,
            socialContext: context.socialContext,
          });
          return {
            content: {
              type: 'video',
              metadata: {
                prompts: resolved.prompts,
                needsGeneration: true,
              } as any,
            },
            handled: true,
          };
        }
        return { handled: false };
      }

      // Resolve fusion assets from the action block
      // Result uses new slot-based structure: fusionAssets.slots[role] → { assets, exactMatch, ... }
      const fusionAssets = await fusionResolver.resolveFromActionBlock(actionBlock, {
        npcId: context.npcId,
        session: context.session,
      });

      // Check if any assets were resolved
      if (fusionAssets.compositionAssets.length === 0) {
        // Could inspect fusionAssets.metadata.failedRoles to see what's missing
        const failedRoles = fusionAssets.metadata.failedRoles.join(', ');
        return {
          error: `No fusion assets resolved. Failed roles: ${failedRoles}`,
          handled: false,
        };
      }

      // Optional: Log slot resolution details
      // for (const [role, slotResult] of Object.entries(fusionAssets.slots)) {
      //   console.log(`Slot ${role}: ${slotResult.exactMatch ? 'exact' : 'fallback'} match`);
      // }

      // Build prompt from block resolver if available
      let prompt = '';
      if (blockResolver) {
        const resolved = await blockResolver.resolve(actionBlock, {
          npcId: context.npcId,
          session: context.session,
          socialContext: context.socialContext,
        });
        prompt = resolved.prompts.join(' ');
      }

      // Generate fusion video
      const request: GenerateContentRequest = {
        type: 'fusion',
        strategy: 'per_playthrough',
        social_context: context.socialContext,
        style: worldConfig?.defaultStyle,
        constraints: worldConfig?.defaultConstraints,
      };

      // Add fusion-specific params (these get mapped to composition_assets in backend)
      (request as any).composition_assets = fusionAssets.compositionAssets;
      (request as any).prompt = prompt;

      try {
        const response = await generationService.generate(request);
        if (response.status === 'complete' && response.content) {
          return {
            content: response.content,
            handled: true,
          };
        }
        if (response.job_id) {
          return {
            jobId: response.job_id,
            handled: false,
          };
        }
      } catch (e) {
        // Return asset info for client-side handling
      }

      return {
        content: {
          type: 'video',
          metadata: {
            fusionAssets: fusionAssets,
            prompt,
            needsGeneration: true,
          } as any,
        },
        handled: true,
      };
    },
  };
}
