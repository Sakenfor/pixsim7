/**
 * Standalone asset generation actions.
 *
 * Pure async functions with no React dependency — callable from both
 * context menu actions (assetActions.ts) and React hooks (useMediaGenerationActions).
 */
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

import { generateAsset } from './api';
import { createGenerationRunDescriptor, createGenerationRunItemContext } from './runContext';
import { nextRandomGenerationSeed } from './seed';

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

export interface PatchAssetOptions {
  /** The generation widget to hydrate. */
  widget: GenerationWidgetContext;
  /** Scope ID for store resolution (from widget or hook context). */
  scopeId?: string;
}

/**
 * Fetch an asset's generation context and hydrate the generation widget
 * with it, ready for the user to edit and re-generate.
 *
 * Accepts explicit store accessors so it works from both React hooks
 * and standalone context menu actions.
 */
export async function patchAssetToWidget(
  asset: AssetModel,
  fallbackOperationType: OperationType,
  options: PatchAssetOptions,
): Promise<void> {
  const { widget, scopeId } = options;

  // Dynamic imports to avoid circular dependency — these are lightweight store getters
  const { getGenerationSessionStore, getGenerationSettingsStore, getGenerationInputStore } =
    await import('../stores/generationScopeStores');

  const ctx = await getAssetGenerationContext(asset.id);
  const parsed = parseGenerationContext(ctx, fallbackOperationType);
  const { params, operationType, providerId, prompt } = parsed;

  const targetScopeId = widget.scopeId ?? scopeId;
  const sessionStore = targetScopeId
    ? getGenerationSessionStore(targetScopeId).getState()
    : null;
  const settingsStore = targetScopeId
    ? getGenerationSettingsStore(targetScopeId).getState()
    : null;
  const inputStore = targetScopeId
    ? getGenerationInputStore(targetScopeId).getState()
    : null;

  if (sessionStore) {
    sessionStore.setOperationType(operationType);
    if (providerId) {
      sessionStore.setProvider(providerId);
    }
    sessionStore.setPrompt(prompt);
  }
  widget.setOperationType?.(operationType);

  if (settingsStore) {
    settingsStore.setActiveOperationType(operationType);
    settingsStore.setDynamicParams(stripInputParams(params));
  }

  if (inputStore) {
    inputStore.clearInputs(operationType);
    inputStore.addInputs({ assets: [asset], operationType });
  }

  widget.setOpen(true);
}

// ─── Load to Quick Gen (restore original generation setup) ───────────────────

export interface LoadAssetToQuickGenOptions {
  /**
   * The generation widget to hydrate. Optional: when absent (e.g. a staged
   * load drained by a freshly-opened widget), pass `scopeId` + `setOpen` +
   * `setOperationType` explicitly instead.
   */
  widget?: GenerationWidgetContext;
  /** Scope ID for store resolution (from widget or hook context). */
  scopeId?: string;
  /** Open/reveal the surface after hydration (defaults to widget.setOpen). */
  setOpen?: (open: boolean) => void;
  /** Update the surface's operation type (defaults to widget.setOperationType). */
  setOperationType?: (operationType: OperationType) => void;
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
  const { widget, withoutSeed = false } = options;
  const setOpen = widget?.setOpen ?? options.setOpen;
  const setOperationType = widget?.setOperationType ?? options.setOperationType;

  const { getGenerationSessionStore, getGenerationSettingsStore, getGenerationInputStore } =
    await import('../stores/generationScopeStores');

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

  const targetScopeId = widget?.scopeId ?? options.scopeId;
  const sessionStore = targetScopeId
    ? getGenerationSessionStore(targetScopeId).getState()
    : null;
  const settingsStore = targetScopeId
    ? getGenerationSettingsStore(targetScopeId).getState()
    : null;
  const inputStore = targetScopeId
    ? getGenerationInputStore(targetScopeId).getState()
    : null;

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
