/**
 * GenerationModel - Internal camelCase model for generation data
 *
 * This model is the canonical internal representation for generation data.
 * API responses (GenerationResponse) are mapped to this model at the boundary.
 *
 * Pattern: API boundary mapping
 * - API returns snake_case GenerationResponse from OpenAPI types
 * - Immediately convert to camelCase GenerationModel at fetch boundary
 * - All internal code uses GenerationModel
 */
import type {
  GenerationResponse,
  GenerationStatus as ApiGenerationStatus,
  OperationType,
} from '@pixsim7/api-client/domains';

// Re-export types that don't need mapping (enums, etc.)
export type { OperationType };

// Extend API status with queued (API may emit this even if OpenAPI doesn't).
export type GenerationStatus = ApiGenerationStatus | 'queued';

/**
 * API relationship reference (id + optional metadata).
 * Used for embedded relationships in API responses like account, asset, user, workspace.
 *
 * Note: This is distinct from EntityRef in @pixsim7/shared.types which is a
 * canonical string format (e.g., "asset:123", "npc:456") for inter-system references.
 */
export interface RelationshipRef {
  id: number;
  type?: string;
  meta?: Record<string, unknown> | null;
}

/**
 * Internal generation model with camelCase fields
 *
 * Maps 1:1 with GenerationResponse but uses camelCase for frontend consistency.
 */
export interface GenerationModel {
  // Identity
  id: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  scheduledAt: string | null;

  // Status
  status: GenerationStatus;
  errorMessage: string | null;
  retryCount: number;
  priority: number;

  // Generation metadata
  name: string | null;
  description: string | null;
  operationType: OperationType;
  providerId: string;

  // Prompt data
  finalPrompt: string | null;
  promptSourceType: string | null;
  promptVersionId: string | null;
  promptConfig: Record<string, unknown> | null;

  // Parameters
  rawParams: Record<string, unknown>;
  canonicalParams: Record<string, unknown>;
  inputs: readonly Record<string, unknown>[];
  reproducibleHash: string | null;

  // Relationships (API refs)
  account: RelationshipRef | null;
  accountEmail: string | null;
  asset: RelationshipRef | null;
  assetId: number | null;
  user: RelationshipRef | null;
  workspace: RelationshipRef | null;
  parentGeneration: RelationshipRef | null;
}

// ============================================================================
// Mappers
// ============================================================================

/**
 * Map API GenerationResponse to internal GenerationModel
 *
 * Call this at the API boundary (in hooks, API client wrappers)
 * to convert snake_case API responses to camelCase internal models.
 */
export function fromGenerationResponse(response: GenerationResponse): GenerationModel {
  return {
    // Identity
    id: response.id,

    // Timestamps
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    startedAt: response.started_at,
    completedAt: response.completed_at,
    scheduledAt: response.scheduled_at,

    // Status
    status: response.status,
    errorMessage: response.error_message,
    retryCount: response.retry_count,
    priority: response.priority,

    // Generation metadata
    name: response.name,
    description: response.description,
    operationType: response.operation_type,
    providerId: response.provider_id,

    // Prompt data
    finalPrompt: response.final_prompt,
    promptSourceType: response.prompt_source_type,
    promptVersionId: response.prompt_version_id,
    promptConfig: response.prompt_config,

    // Parameters
    rawParams: response.raw_params,
    canonicalParams: response.canonical_params,
    inputs: response.inputs,
    reproducibleHash: response.reproducible_hash,

    // Relationships
    account: response.account
      ? { id: response.account.id, type: response.account.type, meta: response.account.meta }
      : null,
    accountEmail: response.account_email ?? null,
    asset: response.asset
      ? { id: response.asset.id, type: response.asset.type, meta: response.asset.meta }
      : null,
    assetId: response.asset?.id ?? (response as { asset_id?: number | null }).asset_id ?? null,
    user: response.user
      ? { id: response.user.id, type: response.user.type, meta: response.user.meta }
      : null,
    workspace: response.workspace
      ? { id: response.workspace.id, type: response.workspace.type, meta: response.workspace.meta }
      : null,
    parentGeneration: response.parent_generation
      ? {
          id: response.parent_generation.id,
          type: response.parent_generation.type,
          meta: response.parent_generation.meta,
        }
      : null,
  };
}

/**
 * Map array of GenerationResponse to GenerationModel[]
 */
export function fromGenerationResponses(responses: GenerationResponse[]): GenerationModel[] {
  return responses.map(fromGenerationResponse);
}

// ============================================================================
// Type Guards & Helpers
// ============================================================================

/**
 * Check if a generation is in a terminal state (won't change anymore)
 */
export function isTerminalStatus(status: GenerationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/**
 * Check if a generation is in an active state (still processing)
 */
export function isActiveStatus(status: GenerationStatus): boolean {
  return status === 'pending' || status === 'queued' || status === 'processing';
}

/**
 * Get a display-friendly status label
 */
export function getStatusLabel(status: GenerationStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

// ============================================================================
// Factory Helpers
// ============================================================================

export interface CreatePendingGenerationOptions {
  id: number;
  operationType: OperationType;
  providerId?: string;
  finalPrompt: string;
  params: Record<string, unknown>;
  status?: GenerationStatus;
}

/**
 * Create a pending generation model for seeding the store
 *
 * Use this when starting a new generation to immediately add it to the
 * generations store with a pending status before the API confirms.
 */
export function createPendingGeneration(options: CreatePendingGenerationOptions): GenerationModel {
  const now = new Date().toISOString();

  return {
    id: options.id,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    scheduledAt: null,
    status: options.status ?? 'pending',
    errorMessage: null,
    retryCount: 0,
    priority: 5,
    name: null,
    description: null,
    operationType: options.operationType,
    providerId: options.providerId ?? 'pixverse',
    finalPrompt: options.finalPrompt,
    promptSourceType: 'inline',
    promptVersionId: null,
    promptConfig: null,
    rawParams: options.params,
    canonicalParams: options.params,
    inputs: [],
    reproducibleHash: null,
    account: null,
    accountEmail: null,
    asset: null,
    assetId: null,
    user: null,
    workspace: null,
    parentGeneration: null,
  };
}
