/**
 * Prompt fragment / block system integration
 *
 * Integrates the backend ActionBlockResolver with the generation system.
 * Provides hooks that compose prompts from block fragments and trigger generation.
 */

import type {
  GenerationHooks,
  GenerationService,
  ContentPoolProvider,
  WorldGenerationOverrides,
  PlayerGenerationPrefs,
  BlockResolverService,
  PoolSelectionCriteria,
} from './types';

import type {
  GenerateContentRequest,
  ActionBlockNode,
} from '@pixsim7/shared.types';

/**
 * Create executor hooks that integrate block resolution with generation.
 *
 * This is the key integration point:
 * 1. ActionBlockNode is encountered in narrative
 * 2. Hook intercepts via afterNodeExecute
 * 3. BlockResolver composes prompts from fragments
 * 4. Prompts are sent to GenerationService
 *
 * @example
 * ```ts
 * const hooks = createBlockGenerationHooks({
 *   blockResolver: myBlockResolver,
 *   generationService: myGenerationService,
 *   pool: myContentPool,
 * });
 *
 * executor.addHooks(hooks);
 * ```
 */
export function createBlockGenerationHooks(config: {
  blockResolver: BlockResolverService;
  generationService?: GenerationService;
  pool?: ContentPoolProvider;
  worldConfig?: WorldGenerationOverrides;
  playerPrefs?: PlayerGenerationPrefs;
}): GenerationHooks {
  const { blockResolver, generationService, pool, worldConfig, playerPrefs } = config;

  return {
    /**
     * After an ActionBlockNode executes, resolve blocks and optionally generate.
     */
    resolveContent: async (context) => {
      if (context.node.type !== 'action_block') {
        return { handled: false };
      }

      const actionBlock = context.node as ActionBlockNode;

      // Resolve blocks into prompts
      const resolved = await blockResolver.resolve(actionBlock, {
        npcId: context.npcId,
        session: context.session,
        socialContext: context.socialContext,
      });

      // Check generation strategy
      const strategy = context.generationConfig.strategy;

      // Pool-only: just return block data (assume pre-generated)
      if (strategy === 'pool_only' && pool) {
        const criteria: PoolSelectionCriteria = {
          tags: resolved.blocks.flatMap(b => b.tags || []),
        };
        const poolResults = await pool.find(criteria, 1);
        if (poolResults.length > 0) {
          return {
            content: poolResults[0],
            handled: true,
          };
        }
      }

      // Generate new content from resolved prompts
      if (generationService && strategy !== 'pool_only') {
        const available = await generationService.isAvailable();
        if (available && resolved.prompts.length > 0) {
          // Build generation request from resolved blocks
          const request: GenerateContentRequest = {
            type: 'transition',
            strategy: 'per_playthrough',
            social_context: context.socialContext,
            duration: {
              target: resolved.totalDuration,
            },
            style: worldConfig?.defaultStyle,
            constraints: worldConfig?.defaultConstraints,
            // Include the composed prompt
            template_id: resolved.blocks[0]?.blockId,
          };

          // If we have player quality preference
          if (playerPrefs?.qualityLevel === 'fast') {
            request.duration = { max: resolved.totalDuration * 0.8 };
          }

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
            // Fall through to return block data
          }
        }
      }

      // Return resolved block data for client-side handling
      return {
        content: {
          type: 'video',
          metadata: {
            blocks: resolved.blocks,
            prompts: resolved.prompts,
            totalDuration: resolved.totalDuration,
            composition: resolved.composition,
            needsGeneration: true,
          } as any,
        },
        handled: true,
      };
    },
  };
}
