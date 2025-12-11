/**
 * Generation Preview Service for Intimacy Scenes
 *
 * Provides preview generation capabilities for the intimacy scene composer.
 * Allows designers to test content generation with different social contexts
 * before committing to a full scene implementation.
 *
 * @see docs/INTIMACY_SCENE_COMPOSER.md - Phase 3 documentation
 * @see frontend/src/lib/api/generations.ts - API client
 */

import type {
  IntimacySceneConfig,
  GenerationSocialContext,
  GenerateContentRequest,
  GeneratedContentPayload,
} from '@/types';
import type { SimulatedRelationshipState } from './gateChecking';
import { deriveSocialContext } from './socialContextDerivation';
import { createGeneration, getGeneration, type GenerationResponse } from '../api/generations';
import { normalizeProviderParams } from '@/lib/generation/normalizeProviderParams';

/**
 * Preview generation request for intimacy scenes
 */
export interface IntimacyPreviewRequest {
  /** Scene configuration */
  scene: IntimacySceneConfig;

  /** Simulated relationship state */
  relationshipState: SimulatedRelationshipState;

  /** World max rating (optional) */
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** User max rating (optional) */
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Workspace ID for tracking (optional) */
  workspaceId?: number;

  /** Provider ID for generation (e.g., 'pixverse') */
  providerId?: string;

  /** Generation parameters from shared settings (model, quality, duration, etc.) */
  generationParams?: Record<string, any>;
}

/**
 * Preview generation result
 */
export interface IntimacyPreviewResult {
  /** Generation ID for tracking */
  generationId: number;

  /** Social context used for generation */
  socialContext: GenerationSocialContext;

  /** Generation status */
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

  /** Generated content (when completed) */
  content?: GeneratedContentPayload;

  /** Error message (when failed) */
  error?: string;

  /** Generation metadata */
  metadata?: {
    startedAt?: string;
    completedAt?: string;
    duration?: number; // milliseconds
    provider?: string;
  };
}

/**
 * Preview polling options
 */
export interface PreviewPollingOptions {
  /** Polling interval in milliseconds (default: 2000) */
  interval?: number;

  /** Maximum polling duration in milliseconds (default: 60000) */
  timeout?: number;

  /** Callback for status updates */
  onStatusUpdate?: (result: IntimacyPreviewResult) => void;
}

/**
 * Generate intimacy scene preview
 *
 * Creates a generation request with the derived social context and polls
 * until completion or timeout.
 *
 * @param request - Preview request with scene config and relationship state
 * @param options - Polling options (optional)
 * @returns Promise that resolves with the preview result
 *
 * @example
 * ```ts
 * const result = await generateIntimacyPreview({
 *   scene: mySceneConfig,
 *   relationshipState: simulatedState,
 *   worldMaxRating: 'mature_implied'
 * });
 *
 * if (result.status === 'completed') {
 *   console.log('Generated content:', result.content);
 * }
 * ```
 */
export async function generateIntimacyPreview(
  request: IntimacyPreviewRequest,
  options?: PreviewPollingOptions
): Promise<IntimacyPreviewResult> {
  const { scene, relationshipState, worldMaxRating, userMaxRating, workspaceId, providerId, generationParams } = request;

  // Derive social context from relationship state
  const socialContext = deriveSocialContext(
    relationshipState,
    scene,
    worldMaxRating,
    userMaxRating
  );

  // Build generation request
  const genRequest: any = {
    config: {
      generationType: scene.sceneType || 'dialogue',
      purpose: 'adaptive',
      style: {
        moodFrom: scene.mood,
        pacing: 'medium',
      },
      duration: {
        target: scene.duration || 30,
      },
      constraints: {
        rating: mapContentRatingToConstraint(socialContext.contentRating || 'sfw'),
        contentRules: buildContentRules(scene, socialContext),
      },
      strategy: 'once',
      fallback: {
        mode: 'default_content',
      },
      enabled: true,
      version: 1,
      socialContext,
      // Include shared generation parameters (model, quality, duration, multi_shot, audio, off_peak, etc.)
      provider_params: normalizeProviderParams(generationParams || {}),
    },
    provider_id: providerId || 'pixverse', // Default to Pixverse for video generation
    social_context: socialContext,
    workspace_id: workspaceId,
    name: `Intimacy Preview: ${scene.name || 'Unnamed Scene'}`,
    description: `Preview generation for intimacy scene with ${socialContext.intimacyBand} intimacy`,
  };

  // Create generation
  const generation = await createGeneration(genRequest);

  // Build initial result
  let result: IntimacyPreviewResult = {
    generationId: generation.id,
    socialContext,
    status: generation.status,
    metadata: {
      provider: generation.provider_id,
    },
  };

  // If already completed or failed, return immediately
  if (generation.status === 'completed' || generation.status === 'failed') {
    return mapGenerationToResult(generation, socialContext);
  }

  // Poll for completion
  const interval = options?.interval || 2000;
  const timeout = options?.timeout || 60000;
  const startTime = Date.now();

  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      result.status = 'failed';
      result.error = 'Preview generation timed out';
      break;
    }

    // Wait for polling interval
    await new Promise((resolve) => setTimeout(resolve, interval));

    // Fetch updated status
    const updated = await getGeneration(generation.id);
    result = mapGenerationToResult(updated, socialContext);

    // Notify status update
    if (options?.onStatusUpdate) {
      options.onStatusUpdate(result);
    }

    // Check if done
    if (updated.status === 'completed' || updated.status === 'failed') {
      break;
    }
  }

  return result;
}

/**
 * Quick preview generation (non-blocking)
 *
 * Starts a generation and returns immediately with the generation ID.
 * Caller is responsible for polling the status using getPreviewStatus().
 *
 * @param request - Preview request
 * @returns Generation ID and initial result
 */
export async function startIntimacyPreview(
  request: IntimacyPreviewRequest
): Promise<{ generationId: number; result: IntimacyPreviewResult }> {
  const { scene, relationshipState, worldMaxRating, userMaxRating, workspaceId, providerId, generationParams } = request;

  // Derive social context
  const socialContext = deriveSocialContext(
    relationshipState,
    scene,
    worldMaxRating,
    userMaxRating
  );

  // Build generation request
  const genRequest: any = {
    config: {
      generationType: scene.sceneType || 'dialogue',
      purpose: 'adaptive',
      style: {
        moodFrom: scene.mood,
        pacing: 'medium',
      },
      duration: {
        target: scene.duration || 30,
      },
      constraints: {
        rating: mapContentRatingToConstraint(socialContext.contentRating || 'sfw'),
        contentRules: buildContentRules(scene, socialContext),
      },
      strategy: 'once',
      fallback: {
        mode: 'default_content',
      },
      enabled: true,
      version: 1,
      socialContext,
      // Include shared generation parameters (model, quality, duration, multi_shot, audio, off_peak, etc.)
      provider_params: normalizeProviderParams(generationParams || {}),
    },
    provider_id: providerId || 'pixverse', // Default to Pixverse for video generation
    social_context: socialContext,
    workspace_id: workspaceId,
    name: `Intimacy Preview: ${scene.name || 'Unnamed Scene'}`,
    description: `Preview generation for intimacy scene`,
  };

  // Create generation
  const generation = await createGeneration(genRequest);

  return {
    generationId: generation.id,
    result: mapGenerationToResult(generation, socialContext),
  };
}

/**
 * Get preview generation status
 *
 * Polls a generation by ID and returns the current status.
 *
 * @param generationId - Generation ID from startIntimacyPreview
 * @param socialContext - Social context used (for metadata)
 * @returns Current preview result
 */
export async function getPreviewStatus(
  generationId: number,
  socialContext: GenerationSocialContext
): Promise<IntimacyPreviewResult> {
  const generation = await getGeneration(generationId);
  return mapGenerationToResult(generation, socialContext);
}

/**
 * Map generation response to preview result
 */
function mapGenerationToResult(
  generation: GenerationResponse,
  socialContext: GenerationSocialContext
): IntimacyPreviewResult {
  const result: IntimacyPreviewResult = {
    generationId: generation.id,
    socialContext,
    status: generation.status,
    metadata: {
      startedAt: generation.started_at || undefined,
      completedAt: generation.completed_at || undefined,
      provider: generation.provider_id,
    },
  };

  // Add duration if completed
  if (generation.started_at && generation.completed_at) {
    const start = new Date(generation.started_at).getTime();
    const end = new Date(generation.completed_at).getTime();
    result.metadata!.duration = end - start;
  }

  // Add error if failed
  if (generation.status === 'failed') {
    result.error = generation.error_message || 'Generation failed';
  }

  // Add content if completed (mocked for now)
  if (generation.status === 'completed') {
    // TODO: Fetch actual generated content from asset_id
    result.content = {
      type: 'dialogue',
      dialogue: [
        `[Generated with ${socialContext.intimacyBand} intimacy, ${socialContext.contentRating} rating]`,
        'This is placeholder content. Real generation will be implemented when backend is ready.',
      ],
      metadata: {
        mood: 'preview',
        tags: ['intimacy', socialContext.intimacyBand || 'none'],
      },
    };
  }

  return result;
}

/**
 * Map content rating to constraint rating
 */
function mapContentRatingToConstraint(
  rating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): 'G' | 'PG' | 'PG-13' | 'R' {
  switch (rating) {
    case 'sfw':
      return 'G';
    case 'romantic':
      return 'PG';
    case 'mature_implied':
      return 'PG-13';
    case 'restricted':
      return 'R';
    default:
      return 'G';
  }
}

/**
 * Build content rules from scene config and social context
 */
function buildContentRules(
  scene: IntimacySceneConfig,
  socialContext: GenerationSocialContext
): string[] {
  const rules: string[] = [];

  // Add intimacy band rules
  if (socialContext.intimacyBand) {
    rules.push(`intimacy_band:${socialContext.intimacyBand}`);
  }

  // Add content rating rules
  if (socialContext.contentRating) {
    rules.push(`content_rating:${socialContext.contentRating}`);
  }

  // Add scene type rules
  if (scene.sceneType) {
    rules.push(`scene_type:${scene.sceneType}`);
  }

  // Add intensity rules
  if (scene.intensity) {
    rules.push(`intensity:${scene.intensity}`);
  }

  // Add mood rules
  if (scene.mood) {
    rules.push(`mood:${scene.mood}`);
  }

  // Add NPC rules
  if (socialContext.npcIds && socialContext.npcIds.length > 0) {
    rules.push(`npcs:${socialContext.npcIds.join(',')}`);
  }

  return rules;
}
