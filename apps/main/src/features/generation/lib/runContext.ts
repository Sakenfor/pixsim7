/**
 * Canonical run-context contract for generation orchestration.
 *
 * This shape is persisted by backend manifest tracking from
 * generation_config.run_context. Keep keys snake_case.
 */

import type { GuidancePlanV1 } from '@pixsim7/shared.types';

export type GenerationRunMode =
  | 'quickgen_single'
  | 'quickgen_burst'
  | 'quickgen_each'
  | 'scene_node'
  | 'narrative_runtime'
  | (string & {});

export interface GenerationRunDescriptor {
  mode: GenerationRunMode;
  runId?: string;
  strategy?: string;
  setId?: string;
  metadata?: Record<string, unknown>;
}

export interface ResolvedGenerationRunDescriptor {
  mode: GenerationRunMode;
  runId: string;
  strategy?: string;
  setId?: string;
  metadata: Record<string, unknown>;
}

export interface GenerationRunItemDescriptor {
  itemIndex?: number;
  itemTotal?: number;
  inputAssetIds?: readonly unknown[];
  metadata?: Record<string, unknown>;
}

export interface GenerationRunContext {
  mode: GenerationRunMode;
  run_id: string;
  strategy?: string;
  set_id?: string;
  item_index?: number;
  item_total?: number;
  input_asset_ids?: number[];
  [key: string]: unknown;
}

function createRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return undefined;
  }
  if (value < 0) return undefined;
  return value;
}

function normalizePositiveInt(value: unknown): number | undefined {
  const normalized = normalizeNonNegativeInt(value);
  if (normalized === undefined || normalized < 1) return undefined;
  return normalized;
}

function normalizeInputAssetIds(value: readonly unknown[] | undefined): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const ids = value
    .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
    .filter((entry) => Number.isFinite(entry) && Number.isInteger(entry))
    .map((entry) => Number(entry));
  if (ids.length === 0) return undefined;
  return ids;
}

/**
 * Resolve run-level metadata once, then derive per-item contexts from it.
 */
export function createGenerationRunDescriptor(
  descriptor: GenerationRunDescriptor,
): ResolvedGenerationRunDescriptor {
  return {
    mode: descriptor.mode,
    runId: descriptor.runId || createRunId(),
    strategy: descriptor.strategy,
    setId: descriptor.setId,
    metadata: descriptor.metadata || {},
  };
}

/**
 * Build a canonical run_context payload for one item in a run.
 */
export function createGenerationRunItemContext(
  run: ResolvedGenerationRunDescriptor,
  item: GenerationRunItemDescriptor = {},
): GenerationRunContext {
  const itemIndex = normalizeNonNegativeInt(item.itemIndex);
  const itemTotal = normalizePositiveInt(item.itemTotal);
  const inputAssetIds = normalizeInputAssetIds(item.inputAssetIds);

  const context: GenerationRunContext = {
    ...run.metadata,
    ...(item.metadata || {}),
    mode: run.mode,
    run_id: run.runId,
  };

  if (run.strategy) {
    context.strategy = run.strategy;
  }
  if (run.setId) {
    context.set_id = run.setId;
  }
  if (itemIndex !== undefined) {
    context.item_index = itemIndex;
  }
  if (itemTotal !== undefined) {
    context.item_total = itemTotal;
  }
  if (inputAssetIds) {
    context.input_asset_ids = inputAssetIds;
  }

  return context;
}

/**
 * Build a GuidancePlanV1 from character binding references.
 *
 * This helper converts the per-slot character bindings (typically from
 * the template builder) into a structured guidance plan that the backend
 * can validate and forward to the provider formatter.
 */
export function buildGuidancePlanReferences(
  bindingRefs: Record<string, { assetId: number | string; kind?: string; priority?: number; label?: string }>,
): GuidancePlanV1 {
  const references: Record<string, { asset_id: string | number; kind: string; priority?: number; label?: string }> = {};

  let defaultPriority = 1;
  for (const [key, binding] of Object.entries(bindingRefs)) {
    references[key] = {
      asset_id: typeof binding.assetId === 'number' ? binding.assetId : String(binding.assetId),
      kind: binding.kind || 'identity',
      priority: binding.priority ?? defaultPriority,
      label: binding.label,
    };
    defaultPriority++;
  }

  return {
    version: 1,
    references: Object.keys(references).length > 0 ? references : undefined,
  };
}

