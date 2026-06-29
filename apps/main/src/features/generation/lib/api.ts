import { createGeneration, type CreateGenerationRequest, type GenerationNodeConfigSchema } from '@lib/api/generations';
import { devValidateParams, devLogParams } from '@lib/utils/validation/devValidation';

import { providerCapabilityRegistry } from '@features/providers';

import type { OperationType } from '@/types/operations';

import type { GenerationRunContext } from './runContext';
import { nextRandomGenerationSeed } from './seed';

export interface GenerateAssetRequest {
  prompt: string;
  providerId?: string;
  operationType?: OperationType;
  extraParams?: Record<string, any>;
  runContext?: GenerationRunContext;
  /** Phase 2b of plan:op-runtime-span-popover. Snapshot of op-derived
   *  span provenance from the composer at submit time. Persisted into
   *  PromptVersion.span_provenance on the new row. Optional — surfaces
   *  that don't track provenance (legacy tools, internal probes) just
   *  omit it. */
  spanProvenance?: Array<Record<string, unknown>>;
  /** Invoked when the pre-flight provider-accept gate begins uploading
   *  local image inputs to the provider (i2v only; skipped when nothing
   *  needs uploading). Optionally returns a cleanup run when the upload
   *  phase ends (success *or* throw) — e.g. to dismiss an interim
   *  "Uploading…" toast. Opt-in; most callers omit it. */
  onInputUploadStart?: (info: { providerId: string; assetCount: number }) => (() => void) | void;
}

export interface GenerateAssetResponse {
  job_id: number;
  status: 'queued' | 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  raw?: any; // backend GenerationResponse for advanced callers
}

export interface PreparedGenerateAssetSubmission {
  providerId: string;
  generationType: OperationType;
  generationConfig: GenerationNodeConfigSchema;
  generationParams: Record<string, any>;
  preferredAccountId?: number;
  name: string;
  priority: number;
}

const acceptedInputUploadCache = new Set<string>();
const pendingInputUploadPreflights = new Map<string, Promise<void>>();

/**
 * Map Control Center operation type to unified generation_type.
 * The backend maps these back to OperationType in api/v1/generations.py.
 */
/**
 * Map Control Center operation type to unified generation_type.
 *
 * Uses canonical aliases (matching OperationType enum names) where possible.
 * The backend maps these to OperationType in api/v1/generations.py.
 */
function mapOperationToGenerationType(operationType?: OperationType): OperationType {
  return operationType || 'text_to_video';
}

/**
 * Build a GenerationNodeConfig-compatible object from Control Center settings.
 *
 * Provider-specific settings convention:
 * - Provider settings (model, quality, off_peak, audio, multi_shot) are placed
 *   in style.<providerId> = { model, quality, off_peak, audio, multi_shot }
 * - This keeps the config schema-compliant while allowing provider extensions.
 * - The backend's _canonicalize_params extracts these to top-level canonical fields.
 */
const CANONICAL_CONFIG_KEYS = new Set([
  'prompt',
  'duration',
  'rating',
  'image_url',
  'image_urls',
  'video_url',
  'original_video_id',
  'source_asset_id',
  'source_asset_ids',
  'sourceAssetId',
  'sourceAssetIds',
  'prompts',
  'composition_assets',
  'pacing',
  'mask_url',
  'mask_source',
  // These should NOT go into style.pixverse - they're handled at the top level
  'operation_type',
  'operationType',
  'artificial_extend',
  'artificialExtend',
]);

function buildGenerationConfig(
  generationType: OperationType,
  params: Record<string, any>,
  providerId: string = 'pixverse',
  runContext?: GenerationRunContext,
): GenerationNodeConfigSchema {
  const merged = { ...params };
  const artificialExtend = merged.artificial_extend ?? merged.artificialExtend;

  // Extract duration settings (only if explicitly provided)
  const durationTarget = merged.duration;

  // Extract rating constraint (optional)
  const rating = merged.rating;

  // Build provider-specific settings (placed in style.<providerId>)
  // The backend will extract these for the provider adapter
  const declaredParams = providerId
    ? new Set(providerCapabilityRegistry.getSupportedControls(providerId, generationType))
    : null;
  const providerSettings: Record<string, any> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue;
    if (CANONICAL_CONFIG_KEYS.has(key)) continue;
    // Skip blank seed values — a random seed is injected below.
    if (
      key === 'seed'
      && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))
    ) {
      continue;
    }
    // Skip 'model' if the provider doesn't declare it — prevents cross-provider
    // leakage (e.g. Pixverse model name ending up in Remaker canonical_params).
    if (key === 'model' && declaredParams && declaredParams.size > 0 && !declaredParams.has('model')) {
      continue;
    }
    providerSettings[key] = value;
  }

  // Always send a random seed when the user hasn't pinned one.
  // This ensures each generation gets unique randomness (0–2 147 483 647).
  if (providerSettings.seed === undefined) {
    providerSettings.seed = nextRandomGenerationSeed();
  }

  // Build style block (generation-level + provider-specific)
  const style: Record<string, any> = {};
  if (merged.pacing !== undefined) {
    style.pacing = merged.pacing;
  }
  if (Object.keys(providerSettings).length > 0) {
    style[providerId] = providerSettings;
  }

  // Build duration constraints object (schema requires the field, but values are optional)
  const duration: Record<string, any> = {};
  if (durationTarget !== undefined) {
    duration.target = durationTarget;
  }

  // Build constraints block
  const constraints: Record<string, any> = {};
  if (rating !== undefined) {
    constraints.rating = rating;
  }

  // Build the config object (matches GenerationNodeConfigSchema).
  //
  // composition_assets is the canonical input list — quickGenerateLogic
  // always assembles it for asset-input operations (i2i, fusion,
  // video_transition, etc.), so legacy spreads (image_url, video_url,
  // image_urls, sourceAssetId, sourceAssetIds) were pure dead weight: the
  // backend prefers composition_assets and only falls back to legacy keys
  // when it's missing — and the camelCase variants weren't even read by the
  // snake_case fallback. They've been dropped here. CANONICAL_CONFIG_KEYS
  // still filters them defensively so they can't leak into style.<provider>.
  const config: GenerationNodeConfigSchema = {
    generationType,
    purpose: 'gap_fill',
    style,
    duration,
    constraints,
    strategy: 'once',
    fallback: {
      mode: 'skip',
    },
    enabled: true,
    version: 1,
    ...(merged.prompt ? { prompt: merged.prompt } : {}),
    ...(merged.prompts ? { prompts: merged.prompts } : {}),
    ...(merged.composition_assets ? { composition_assets: merged.composition_assets } : {}),
    ...(merged.mask_url ? { mask_url: merged.mask_url } : {}),
    ...(artificialExtend !== undefined ? { artificial_extend: artificialExtend } : {}),
  };

  if (runContext && typeof runContext === 'object') {
    // GenerationNodeConfigSchema accepts extra keys; this is consumed by backend
    // tracking/manifests and ignored by provider param mapping.
    (config as Record<string, any>).run_context = runContext;
  }

  return config;
}

/**
 * Pre-flight upload gate: for image→video, push every local image input to
 * the target provider and let the provider accept/reject it *before* a
 * generation job (and its "started" notification) exists.
 *
 * Rationale: the worker uploads i2v input frames to the provider only once
 * it reaches `processing`, so a Pixverse moderation/upload rejection used to
 * surface *after* the user already saw "Extending video…". Gating here makes
 * provider acceptance the first check. `uploadAssetToProvider` →
 * `/reupload` → `get_asset_for_provider` is idempotent and caches into
 * `provider_uploads`, so the subsequent job reuses it (no double upload);
 * cached assets short-circuit cheaply.
 *
 * Throws the provider rejection unchanged so callers' existing catch blocks
 * (e.g. the artificial-extend "Pixverse filtered → use native extend"
 * message, which inspects the error text) keep working.
 */
function getCompositionAssetUploadHint(entry: Record<string, unknown>, providerId: string): unknown {
  const nativeProviderId = entry.provider_id ?? entry.providerId;
  if (nativeProviderId === providerId) {
    return true;
  }

  const providerUploads = entry.provider_uploads ?? entry.providerUploads;
  if (!providerUploads || typeof providerUploads !== 'object') {
    return undefined;
  }

  return (providerUploads as Record<string, unknown>)[providerId];
}

function hasMeaningfulProviderUploadValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(Boolean);
  }
  return Boolean(value);
}

function hasAcceptedProviderUploadHint(entry: Record<string, unknown>, providerId: string): boolean {
  return hasMeaningfulProviderUploadValue(getCompositionAssetUploadHint(entry, providerId));
}

async function ensureInputUploadPreflight(assetId: number, providerId: string): Promise<void> {
  const cacheKey = `${providerId}:${assetId}`;
  if (acceptedInputUploadCache.has(cacheKey)) {
    return;
  }

  const pending = pendingInputUploadPreflights.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = import('@lib/api/assets')
    .then(({ uploadAssetToProvider }) => uploadAssetToProvider(assetId, providerId))
    .then(() => {
      acceptedInputUploadCache.add(cacheKey);
    })
    .finally(() => {
      pendingInputUploadPreflights.delete(cacheKey);
    });

  pendingInputUploadPreflights.set(cacheKey, promise);
  return promise;
}

async function ensureImageInputsAcceptedByProvider(
  operationType: OperationType,
  providerId: string,
  config: GenerationNodeConfigSchema,
  onUploadStart?: GenerateAssetRequest['onInputUploadStart'],
): Promise<void> {
  if (operationType !== 'image_to_video') return;
  if (!providerId || providerId === 'local') return;

  const compositionAssets = (config as Record<string, unknown>).composition_assets;
  if (!Array.isArray(compositionAssets)) return;

  const assetIds: number[] = [];
  for (const entry of compositionAssets) {
    if (!entry || typeof entry !== 'object') continue;
    const compositionEntry = entry as Record<string, unknown>;
    const { asset, media_type: mediaType } = compositionEntry as { asset?: unknown; media_type?: unknown };
    if (mediaType !== 'image' || typeof asset !== 'string') continue;
    const match = /^asset:(\d+)$/.exec(asset);
    if (!match) continue;
    if (hasAcceptedProviderUploadHint(compositionEntry, providerId)) continue;
    const id = Number(match[1]);
    if (Number.isFinite(id) && id > 0 && !assetIds.includes(id)) {
      assetIds.push(id);
    }
  }

  if (assetIds.length === 0) return;

  // Defer the "uploading…" toast behind a short delay. When the input was
  // already pushed to this provider by an earlier generation — the common case
  // on *regenerate*, where we reuse the cached provider upload rather than
  // re-uploading anything — `uploadAssetToProvider` short-circuits on the
  // cached `provider_uploads` entry in a few ms, the timer never fires, and the
  // user correctly sees nothing. Only a genuine first-time upload is slow
  // enough to trip the timer and warrant interim feedback.
  const UPLOAD_TOAST_DELAY_MS = 500;
  let cleanup: (() => void) | void;
  const timer = setTimeout(() => {
    cleanup = onUploadStart?.({ providerId, assetCount: assetIds.length });
  }, UPLOAD_TOAST_DELAY_MS);
  try {
    for (const assetId of assetIds) {
      await ensureInputUploadPreflight(assetId, providerId);
    }
  } finally {
    clearTimeout(timer);
    cleanup?.();
  }
}

/**
 * Trigger quick generation of an asset via the control center.
 *
 * This function builds a proper GenerationNodeConfig from Control Center
 * settings and sends it through the unified generations API.
 *
 * Returns a job ID that can be tracked via polling.
 */
export async function generateAsset(req: GenerateAssetRequest): Promise<GenerateAssetResponse> {
  const prepared = prepareGenerateAssetSubmission(req);

  // Provider-accept gate (i2v): fail before a job/notification exists if the
  // provider rejects the uploaded input image.
  await ensureImageInputsAcceptedByProvider(
    prepared.generationType,
    prepared.providerId,
    prepared.generationConfig,
    req.onInputUploadStart,
  );

  // Create generation request
  // Use force_new to bypass deduplication (avoids getting stuck on pending generations)
  // Cast widens the type so we can include span_provenance — the OpenAPI
  // codegen lags one server-restart behind backend schema edits, so the
  // generated CreateGenerationRequest may not yet declare the field. Once
  // the codegen catches up this cast can be dropped.
  const generationRequest: CreateGenerationRequest & {
    preferred_account_id?: number;
    span_provenance?: Array<Record<string, unknown>>;
  } = {
    config: prepared.generationConfig,
    provider_id: prepared.providerId,
    name: prepared.name,
    priority: prepared.priority,
    version_intent: 'new',
    force_new: true,
    ...(prepared.preferredAccountId ? { preferred_account_id: prepared.preferredAccountId } : {}),
    ...(req.spanProvenance && req.spanProvenance.length > 0
      ? { span_provenance: req.spanProvenance }
      : {}),
  };
  if (import.meta.env.DEV) {
    (globalThis as any).__quickgenLastCreateGenerationRequest = {
      ts: Date.now(),
      providerId: prepared.providerId,
      generationType: prepared.generationType,
      configMaskUrl: (prepared.generationConfig as any)?.mask_url ?? null,
      hasCompositionAssets:
        Array.isArray((prepared.generationConfig as any)?.composition_assets)
        && (prepared.generationConfig as any).composition_assets.length > 0,
      requestMaskUrl: (generationRequest.config as any)?.mask_url ?? null,
    };
  }

  // Call new unified generations API
  const generation = await createGeneration(generationRequest);

  // Return in legacy format
  return {
    job_id: generation.id,
    status: generation.status as GenerateAssetResponse['status'],
    raw: generation,
  };
}

export function prepareGenerateAssetSubmission(req: GenerateAssetRequest): PreparedGenerateAssetSubmission {
  const restExtra = { ...((req.extraParams || {}) as Record<string, any>) };
  const preferred_account_id = restExtra.preferred_account_id;
  delete restExtra.preferred_account_id;
  // Prevent stale param state from overriding the canonical prompt argument.
  delete restExtra.prompt;

  const mergedParams = {
    ...restExtra,
    prompt: req.prompt,
  };

  // Optional dev validation (warnings only, doesn't block)
  devValidateParams(
    { kind: req.operationType || 'text_to_video', ...mergedParams },
    'generateAsset'
  );
  devLogParams(mergedParams, `generateAsset(${req.operationType})`);

  // Map control center operation type to unified generation_type
  const generationType = mapOperationToGenerationType(req.operationType);
  const providerId = req.providerId || 'pixverse';

  // Build proper GenerationNodeConfig from Control Center settings
  const config = buildGenerationConfig(
    generationType,
    mergedParams,
    providerId,
    req.runContext,
  );
  if (import.meta.env.DEV) {
    (globalThis as any).__quickgenLastPreparedSubmission = {
      ts: Date.now(),
      providerId,
      generationType,
      mergedMaskUrl: mergedParams.mask_url ?? null,
      configMaskUrl: (config as any)?.mask_url ?? null,
      hasCompositionAssets:
        Array.isArray((config as any)?.composition_assets)
        && (config as any).composition_assets.length > 0,
    };
  }
  return {
    providerId,
    generationType,
    generationConfig: config,
    generationParams: {
      generation_config: config,
    },
    preferredAccountId: preferred_account_id,
    name: `Quick generation: ${req.prompt.slice(0, 50)}`,
    priority: 5,
  };
}
