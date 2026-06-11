/**
 * Standalone asset generation actions.
 *
 * Pure async functions with no React dependency — callable from both
 * context menu actions (assetActions.ts) and React hooks (useMediaGenerationActions).
 */
import { useToastStore } from '@pixsim7/shared.ui';

import { getAsset, getAssetGenerationContext } from '@lib/api/assets';
import { getModelFamily } from '@lib/generation-ui';


import { fromAssetResponse, type AssetModel } from '@features/assets';
import type { GenerationWidgetContext } from '@features/contextHub';
import { providerCapabilityRegistry } from '@features/providers';


import {
  stripSeedFromParams,
  paramsIncludeSeed,
  operationSupportsSeedParam,
} from '@/components/media/mediaCardGeneration.helpers';
import { parseGenerationContext, stripInputParams } from '@/components/media/mediaCardGeneration.utils';
import type { OperationType } from '@/types/operations';

import type { QuickGenIntent } from '../stores/quickGenStagingStore';

import { generateAsset } from './api';
import { createGenerationRunDescriptor, createGenerationRunItemContext } from './runContext';
import { nextRandomGenerationSeed } from './seed';


// ─── Quick Gen target resolution ─────────────────────────────────────────────

/**
 * Where a Quick Gen action writes. A live widget supplies the scope + setters
 * directly; a staged intent (drained by a freshly-opened widget) passes the
 * scope id + setters explicitly. Either form resolves to the same three handles.
 */
export interface QuickGenActionTarget {
  /** Live widget, when one is mounted — supplies scopeId + setters. */
  widget?: GenerationWidgetContext;
  /** Scope id for store resolution (used when no widget). */
  scopeId?: string;
  /** Reveal the surface after applying (defaults to widget.setOpen). */
  setOpen?: (open: boolean) => void;
  /** Update the surface's operation type (defaults to widget.setOperationType). */
  setOperationType?: (operationType: OperationType) => void;
}

interface ResolvedQuickGenTarget {
  scopeId?: string;
  setOpen?: (open: boolean) => void;
  setOperationType?: (operationType: OperationType) => void;
}

function resolveQuickGenTarget(target: QuickGenActionTarget): ResolvedQuickGenTarget {
  return {
    scopeId: target.widget?.scopeId ?? target.scopeId,
    setOpen: target.widget?.setOpen ?? target.setOpen,
    setOperationType: target.widget?.setOperationType ?? target.setOperationType,
  };
}

/** Resolve this scope's three generation stores (dynamic-imported to dodge cycles). */
async function getScopeStores(scopeId: string | undefined) {
  if (!scopeId) return { sessionStore: null, settingsStore: null, inputStore: null };
  const { getGenerationSessionStore, getGenerationSettingsStore, getGenerationInputStore } =
    await import('../stores/generationScopeStores');
  return {
    sessionStore: getGenerationSessionStore(scopeId).getState(),
    settingsStore: getGenerationSettingsStore(scopeId).getState(),
    inputStore: getGenerationInputStore(scopeId).getState(),
  };
}

function parseSeedValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return undefined;
}

// ─── Upgrade Model ───────────────────────────────────────────────────────────

export interface UpgradeModelResult {
  ok: boolean;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

/**
 * Re-queue a generation for the given asset with one model tier up.
 * Returns a result object — callers decide how to surface the message (toast, etc.).
 */
export async function upgradeModelForAsset(
  asset: AssetModel,
  fallbackOperationType: OperationType,
): Promise<UpgradeModelResult> {
  const ctx = await getAssetGenerationContext(asset.id);
  const parsed = parseGenerationContext(ctx, fallbackOperationType);
  const { params, operationType, providerId, prompt } = parsed;

  const model = typeof params.model === 'string' ? params.model : undefined;
  if (!model) {
    return { ok: false, message: 'No model found in generation context', type: 'warning' };
  }

  // Ensure capabilities are loaded, then look up param specs
  try {
    await providerCapabilityRegistry.fetchCapabilities();
  } catch {
    // best effort
  }
  const opSpec = providerCapabilityRegistry.getOperationSpec(providerId, operationType);
  const paramSpecs = Array.isArray((opSpec as any)?.parameters)
    ? (opSpec as any).parameters
    : [];

  const familyInfo = getModelFamily(model, paramSpecs);
  if (!familyInfo?.upgrade) {
    return { ok: false, message: 'Already on highest model tier', type: 'info' };
  }

  const upgradeModelId = familyInfo.upgrade;
  const upgradeFamilyInfo = getModelFamily(upgradeModelId, paramSpecs);
  const upgradeLabel = upgradeFamilyInfo?.label ?? upgradeModelId;

  // Strip seed and randomize
  const cleanedParams = stripSeedFromParams(params);
  cleanedParams.model = upgradeModelId;

  const shouldRandomizeSeed =
    paramsIncludeSeed(params) ||
    (await operationSupportsSeedParam(providerId, operationType));
  if (shouldRandomizeSeed) {
    cleanedParams.seed = nextRandomGenerationSeed();
  }

  const run = createGenerationRunDescriptor({
    mode: 'gesture_upgrade',
    metadata: {
      source: 'upgradeModelForAsset',
      source_asset_id: asset.id,
      original_model: model,
      upgrade_model: upgradeModelId,
    },
  });

  await generateAsset({
    prompt,
    providerId,
    operationType,
    extraParams: cleanedParams,
    runContext: createGenerationRunItemContext(run, {
      itemIndex: 0,
      itemTotal: 1,
    }),
  });

  return { ok: true, message: `Upgrading to ${upgradeLabel}...`, type: 'success' };
}

// ─── Patch Asset (hydrate widget) ────────────────────────────────────────────

/** @deprecated use QuickGenActionTarget. Kept as an alias for existing callers. */
export type PatchAssetOptions = QuickGenActionTarget;

/**
 * Fetch an asset's generation context and hydrate the generation widget
 * with it, ready for the user to edit and re-generate.
 *
 * Accepts a resolvable target (live widget OR scope + setters) so it works from
 * React hooks, standalone context menu actions, and the staged-intent drain.
 */
export async function patchAssetToWidget(
  asset: AssetModel,
  fallbackOperationType: OperationType,
  target: QuickGenActionTarget,
): Promise<void> {
  const { scopeId, setOpen, setOperationType } = resolveQuickGenTarget(target);

  const ctx = await getAssetGenerationContext(asset.id);
  const parsed = parseGenerationContext(ctx, fallbackOperationType);
  const { params, operationType, providerId, prompt } = parsed;

  const { sessionStore, settingsStore, inputStore } = await getScopeStores(scopeId);

  if (sessionStore) {
    sessionStore.setOperationType(operationType);
    if (providerId) {
      sessionStore.setProvider(providerId);
    }
    sessionStore.setPrompt(prompt);
  }
  setOperationType?.(operationType);

  if (settingsStore) {
    settingsStore.setActiveOperationType(operationType);
    settingsStore.setDynamicParams(stripInputParams(params));
  }

  if (inputStore) {
    inputStore.clearInputs(operationType);
    inputStore.addInputs({ assets: [asset], operationType });
  }

  setOpen?.(true);
}

// ─── Load to Quick Gen (restore original generation setup) ───────────────────

export interface LoadAssetToQuickGenOptions extends QuickGenActionTarget {
  /** Strip seed from params before hydration. */
  withoutSeed?: boolean;
}

/**
 * Restore the original generation setup that produced this asset:
 * load its gen context (op type, prompt, params) and resolve its
 * source assets back into the widget's input slots. Unlike
 * `patchAssetToWidget`, the asset itself is NOT used as input —
 * the inputs are the source assets that originally produced it.
 *
 * Works both against a live widget context and, when none is available, a
 * plain scope id + setters (used to drain a staged "Load to Quick Gen" into a
 * widget that has just mounted/opened).
 */
export async function loadAssetToQuickGen(
  asset: AssetModel,
  fallbackOperationType: OperationType,
  options: LoadAssetToQuickGenOptions,
): Promise<void> {
  const { withoutSeed = false } = options;
  const { scopeId, setOpen, setOperationType } = resolveQuickGenTarget(options);

  const ctx = await getAssetGenerationContext(asset.id);
  const parsed = parseGenerationContext(ctx, fallbackOperationType);
  const { params, operationType, providerId, prompt, sourceAssetIds } = parsed;

  const paramsForWidget = withoutSeed ? stripSeedFromParams(params) : params;

  let assets: AssetModel[] = [];
  if (sourceAssetIds.length > 0) {
    const results = await Promise.allSettled(sourceAssetIds.map((id) => getAsset(id)));
    assets = results
      .map((result) => (result.status === 'fulfilled' ? fromAssetResponse(result.value) : null))
      .filter((a): a is AssetModel => !!a);
  }

  const { sessionStore, settingsStore, inputStore } = await getScopeStores(scopeId);

  if (sessionStore) {
    sessionStore.setOperationType(operationType);
    if (providerId) {
      sessionStore.setProvider(providerId);
    }
    sessionStore.setPrompt(prompt);
  }
  setOperationType?.(operationType);

  if (settingsStore) {
    settingsStore.setActiveOperationType(operationType);
    settingsStore.setDynamicParams(stripInputParams(paramsForWidget));
  }

  if (inputStore) {
    inputStore.clearInputs(operationType);
    if (assets.length > 0) {
      inputStore.addInputs({ assets, operationType });
    }
  }

  setOpen?.(true);
}

// ─── Insert-only actions (prompt / seed / assets) ────────────────────────────
//
// "Insert" variants mutate just one facet of the target, leaving the rest as-is
// — unlike load/patch which replace the whole setup. Each works against a live
// widget or a staged-intent target. Soft no-ops (no seed / no source assets in
// the context) surface their own info toast; hard failures throw to the caller.

/** Insert the asset's source prompt into the target, replacing the current one. */
export async function insertPromptToQuickGen(
  asset: AssetModel,
  fallbackOperationType: OperationType,
  target: QuickGenActionTarget,
): Promise<void> {
  const { scopeId, setOpen } = resolveQuickGenTarget(target);
  const ctx = await getAssetGenerationContext(asset.id);
  const { prompt } = parseGenerationContext(ctx, fallbackOperationType);

  const { sessionStore } = await getScopeStores(scopeId);
  sessionStore?.setPrompt(prompt);
  setOpen?.(true);
}

/** Insert the asset's source seed into the target's params. */
export async function insertSeedToQuickGen(
  asset: AssetModel,
  fallbackOperationType: OperationType,
  target: QuickGenActionTarget,
): Promise<void> {
  const { scopeId, setOpen } = resolveQuickGenTarget(target);
  const ctx = await getAssetGenerationContext(asset.id);
  const { params } = parseGenerationContext(ctx, fallbackOperationType);
  const seed = parseSeedValue((params as Record<string, unknown>)?.seed);

  if (seed === undefined) {
    useToastStore.getState().addToast({
      type: 'info',
      message: 'No seed found for this generation.',
      duration: 2500,
    });
    return;
  }

  const { settingsStore } = await getScopeStores(scopeId);
  settingsStore?.setDynamicParams((prev: Record<string, unknown>) => ({ ...prev, seed }));
  setOpen?.(true);
}

/**
 * Replace the target's inputs (for the card's operation) with the asset's
 * source assets, so the widget mirrors the source generation's inputs.
 */
export async function insertAssetsToQuickGen(
  asset: AssetModel,
  fallbackOperationType: OperationType,
  target: QuickGenActionTarget,
): Promise<void> {
  const { scopeId, setOpen } = resolveQuickGenTarget(target);
  const ctx = await getAssetGenerationContext(asset.id);
  const { sourceAssetIds } = parseGenerationContext(ctx, fallbackOperationType);

  if (!sourceAssetIds || sourceAssetIds.length === 0) {
    useToastStore.getState().addToast({
      type: 'info',
      message: 'No source assets found for this generation.',
      duration: 2500,
    });
    return;
  }

  const results = await Promise.allSettled(sourceAssetIds.map((id) => getAsset(id)));
  const assets = results
    .map((result) => (result.status === 'fulfilled' ? fromAssetResponse(result.value) : null))
    .filter((a): a is AssetModel => !!a);

  if (assets.length === 0) {
    throw new Error('Failed to load source assets.');
  }

  const { inputStore } = await getScopeStores(scopeId);
  if (inputStore) {
    inputStore.clearInputs(fallbackOperationType);
    inputStore.addInputs({ assets, operationType: fallbackOperationType });
  }
  setOpen?.(true);
}

// ─── Staged-intent dispatch ──────────────────────────────────────────────────

/**
 * Run a staged Quick Gen intent against a freshly-opened widget's target.
 * Used by QuickGenWidget's drain effect — see quickGenStagingStore.
 */
export async function runQuickGenIntent(
  intent: QuickGenIntent,
  target: QuickGenActionTarget,
): Promise<void> {
  const { asset, fallbackOperationType } = intent;
  switch (intent.kind) {
    case 'load':
      return loadAssetToQuickGen(asset, fallbackOperationType, {
        ...target,
        withoutSeed: intent.withoutSeed,
      });
    case 'patch':
      return patchAssetToWidget(asset, fallbackOperationType, target);
    case 'insert-prompt':
      return insertPromptToQuickGen(asset, fallbackOperationType, target);
    case 'insert-seed':
      return insertSeedToQuickGen(asset, fallbackOperationType, target);
    case 'insert-assets':
      return insertAssetsToQuickGen(asset, fallbackOperationType, target);
  }
}
