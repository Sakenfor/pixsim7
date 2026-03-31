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
} from '@pixsim7/shared.api.client/domains';

// Re-export types that don't need mapping (enums, etc.)
export type { OperationType };

// Extend API status with values the backend emits but OpenAPI hasn't regenerated yet.
export type GenerationStatus = ApiGenerationStatus | 'queued' | 'paused';

/**
 * Embedded entity reference in API responses.
 * Used for linked entities like account, asset, user, workspace in API payloads.
 *
 * Note: This is distinct from EntityRef in @pixsim7/shared.types which is a
 * canonical string format (e.g., "asset:123", "npc:456") for inter-system references.
 */
export interface EmbeddedRef {
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
  errorCode: string | null;
  retryCount: number;
  deferredAction: 'pause' | 'cancel' | null;
  attemptCount: number | null;
  priority: number;
  waitReason: string | null;

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
  latestSubmissionPayload: Record<string, unknown> | null;
  latestSubmissionProviderJobId: string | null;
  inputs: readonly Record<string, unknown>[];
  reproducibleHash: string | null;

  // Embedded entity references from API
  account: EmbeddedRef | null;
  accountEmail: string | null;
  asset: EmbeddedRef | null;
  assetId: number | null;
  user: EmbeddedRef | null;
  workspace: EmbeddedRef | null;
  parentGeneration: EmbeddedRef | null;
}

// ============================================================================
// Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asModelName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getModelFromRecord(
  record: Record<string, unknown> | null | undefined,
): string | null {
  if (!record) return null;

  const directModel = asModelName(record.model);
  if (directModel) return directModel;

  const nestedKeys = ['generation_config', 'params', 'options', 'request', 'payload', 'data'];
  for (const key of nestedKeys) {
    const nested = record[key];
    if (!isRecord(nested)) continue;
    const nestedModel = asModelName(nested.model);
    if (nestedModel) return nestedModel;
  }

  const style = record.style;
  if (isRecord(style)) {
    for (const providerStyle of Object.values(style)) {
      if (!isRecord(providerStyle)) continue;
      const styleModel = asModelName(providerStyle.model);
      if (styleModel) return styleModel;
    }
  }

  return null;
}

/**
 * Ensure an ISO timestamp is interpreted as UTC.
 * Backend stores UTC but may omit the 'Z' suffix on older records.
 */
function ensureUtc(ts: string): string;
function ensureUtc(ts: string | null): string | null;
function ensureUtc(ts: string | null | undefined): string | null | undefined;
function ensureUtc(ts: string | null | undefined): string | null | undefined {
  if (!ts) return ts;
  // Already has timezone info
  if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) return ts;
  return ts + 'Z';
}

/**
 * Resolve provider model name from canonical/raw params or latest submission payload.
 */
export function getGenerationModelName(
  generation: Pick<
    GenerationModel,
    'canonicalParams' | 'rawParams' | 'latestSubmissionPayload'
  >,
): string | null {
  return (
    getModelFromRecord(generation.canonicalParams) ??
    getModelFromRecord(generation.rawParams) ??
    getModelFromRecord(generation.latestSubmissionPayload)
  );
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
  const latestSubmissionPayload =
    (response as { latest_submission_payload?: Record<string, unknown> | null })
      .latest_submission_payload ?? null;
  const latestSubmissionProviderJobId =
    (response as { latest_submission_provider_job_id?: string | null })
      .latest_submission_provider_job_id ?? null;
  const attemptCount =
    (response as { attempt_count?: number | null }).attempt_count ?? null;
  const preferredAccountId =
    (response as { preferred_account_id?: number | null }).preferred_account_id ?? null;
  const paramsPreferredAccount =
    preferredAccountId !== null && preferredAccountId !== undefined
      ? { preferred_account_id: preferredAccountId }
      : {};

  return {
    // Identity
    id: response.id,

    // Timestamps (ensure UTC — backend stores UTC but older records may lack 'Z')
    createdAt: ensureUtc(response.created_at),
    updatedAt: ensureUtc(response.updated_at),
    startedAt: ensureUtc(response.started_at),
    completedAt: ensureUtc(response.completed_at),
    scheduledAt: ensureUtc(response.scheduled_at),

    // Status
    status: response.status,
    errorMessage: response.error_message,
    errorCode: response.error_code ?? null,
    retryCount: response.retry_count,
    deferredAction: ((response as { deferred_action?: string | null }).deferred_action as 'pause' | 'cancel' | null) ?? null,
    attemptCount,
    priority: response.priority,
    waitReason: (response as { wait_reason?: string | null }).wait_reason ?? null,

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
    rawParams: { ...response.raw_params, ...paramsPreferredAccount },
    canonicalParams: { ...response.canonical_params, ...paramsPreferredAccount },
    latestSubmissionPayload,
    latestSubmissionProviderJobId,
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
    assetId: response.asset?.id ?? null,
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
    case 'paused':
      return 'Paused';
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
// Granular Status
// ============================================================================

/** Fine-grained status derived from base status + submission/wait metadata. */
export type GranularStatus =
  | 'starting' | 'submitting' | 'polling'           // from processing
  | 'yielding' | 'cooldown' | 'retrying'            // from pending/queued
  | 'accepted' | 'submitted' | 'queued'             // from pending/queued
  | 'paused'                                         // paused (hold)
  | 'completed' | 'failed' | 'cancelled';           // terminal

/**
 * Resolve a generation's fine-grained status from its base status and metadata.
 * Mirrors the activity-badge logic but as a pure function for reuse in filters.
 */
export function resolveGranularStatus(g: Pick<
  GenerationModel,
  'status' | 'retryCount' | 'attemptCount' | 'latestSubmissionPayload' | 'latestSubmissionProviderJobId' | 'waitReason'
>): GranularStatus {
  const hasSubmitEvidence =
    (g.attemptCount != null && g.attemptCount > 0) ||
    g.latestSubmissionPayload != null;
  const hasProviderAcceptance = Boolean(g.latestSubmissionProviderJobId);

  if (g.status === 'processing') {
    if (!hasSubmitEvidence) return 'starting';
    if (!hasProviderAcceptance) return 'submitting';
    return 'polling';
  }

  if (g.status === 'pending' || g.status === 'queued') {
    if (g.waitReason && /yield/i.test(g.waitReason)) return 'yielding';
    if (g.waitReason && /concurrent|capacity|adaptive|cooldown/i.test(g.waitReason)) return 'cooldown';
    if (g.retryCount > 0) return 'retrying';
    if (hasProviderAcceptance) return 'accepted';
    if (hasSubmitEvidence) return 'submitted';
    return 'queued';
  }

  // Paused and terminal statuses pass through
  return g.status as GranularStatus;
}

const GRANULAR_STATUS_LABELS: Record<GranularStatus, string> = {
  starting: 'Starting',
  submitting: 'Submitting',
  polling: 'Polling',
  yielding: 'Yielding',
  cooldown: 'Cooldown',
  retrying: 'Retrying',
  accepted: 'Accepted',
  submitted: 'Submitted',
  queued: 'Queued',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function getGranularStatusLabel(status: GranularStatus): string {
  return GRANULAR_STATUS_LABELS[status] ?? status;
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
    errorCode: null,
    retryCount: 0,
    deferredAction: null,
    attemptCount: null,
    priority: 5,
    waitReason: null,
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
    latestSubmissionPayload: null,
    latestSubmissionProviderJobId: null,
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
