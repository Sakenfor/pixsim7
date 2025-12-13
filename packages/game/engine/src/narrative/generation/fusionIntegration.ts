/**
 * Image pool & fusion logic integration
 *
 * Provides fusion-based generation hooks that use multi-image inputs.
 * Integrates with image pool provider and fusion asset resolver.
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
} from './types';

import type {
  GenerateContentRequest,
  ActionBlockNode,
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
      const fusionAssets = await fusionResolver.resolveFromActionBlock(actionBlock, {
        npcId: context.npcId,
        session: context.session,
      });

      if (fusionAssets.fusionUrls.length === 0) {
        return { error: 'No fusion assets resolved', handled: false };
      }

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
        type: 'transition', // Will be routed to fusion
        strategy: 'per_playthrough',
        social_context: context.socialContext,
        style: worldConfig?.defaultStyle,
        constraints: worldConfig?.defaultConstraints,
      };

      // Add fusion-specific params (these get mapped to fusion_assets in backend)
      (request as any).fusion_assets = fusionAssets.fusionUrls;
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
