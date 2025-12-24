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
  GenerationStatus,
  OperationType,
} from '@pixsim7/api-client/domains';

// Re-export types that don't need mapping (enums, etc.)
export type { GenerationStatus, OperationType };

/**
 * Entity reference (id + optional metadata)
 * Used for relationships like account, asset, user, workspace, parent_generation
 */
export interface EntityRef {
  id: number;
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

  // Relationships (entity refs)
  account: EntityRef | null;
  accountEmail: string | null;
  asset: EntityRef | null;
  user: EntityRef | null;
  workspace: EntityRef | null;
  parentGeneration: EntityRef | null;
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
    account: response.account ? { id: response.account.id, meta: response.account.meta } : null,
    accountEmail: response.account_email ?? null,
    asset: response.asset ? { id: response.asset.id, meta: response.asset.meta } : null,
    user: response.user ? { id: response.user.id, meta: response.user.meta } : null,
    workspace: response.workspace ? { id: response.workspace.id, meta: response.workspace.meta } : null,
    parentGeneration: response.parent_generation
      ? { id: response.parent_generation.id, meta: response.parent_generation.meta }
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
