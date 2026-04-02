import { useToastStore } from '@pixsim7/shared.ui';

import { BACKEND_BASE } from '@lib/api';
import { withCorrelationHeaders } from '@lib/api/correlationHeaders';
import { authService } from '@lib/auth';

import { useAssetViewerStore } from '@features/assets';
import {
  getRegisteredInputStoreEntries,
  getRegisteredSettingsStoreEntries,
  useGenerationsStore,
  useGenerationInputStore,
  useGenerationSettingsStore,
} from '@features/generation';
import {
  getScopeMode,
  panelSelectors,
  panelSettingsScopeRegistry,
  resolveScopeInstanceId,
  usePanelInstanceSettingsStore,
} from '@features/panels';

import { getDockviewGroups, getDockviewPanels } from '../../panelAdd';
import { resolveCurrentDockviewApi } from '../resolveCurrentDockview';
import type { MenuAction, MenuActionContext } from '../types';

function notify(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  useToastStore.getState().addToast({
    type,
    message,
    duration: 4500,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getGroupPanelCount(group: unknown): number {
  if (!isRecord(group)) return 0;
  const panels = (group as any).panels;
  if (Array.isArray(panels)) return panels.length;
  if (panels && typeof panels.length === 'number') return panels.length;
  const model = (group as any).model;
  if (typeof model?.size === 'number') return model.size;
  return 0;
}

function buildDockviewSnapshot(ctx: MenuActionContext): Record<string, unknown> | null {
  const api = resolveCurrentDockviewApi(ctx);
  if (!api) return null;

  const groups = getDockviewGroups(api);
  const panels = getDockviewPanels(api);
  const contextData = isRecord(ctx.data) ? ctx.data : undefined;
  const backgroundTarget = isRecord(contextData?.dockviewBackgroundTarget)
    ? contextData?.dockviewBackgroundTarget
    : null;

  const groupSnapshots = groups.map((group: any) => {
    const panelCount = getGroupPanelCount(group);
    const groupPanels = Array.isArray(group?.panels) ? group.panels : [];
    return {
      id: typeof group?.id === 'string' ? group.id : null,
      panelCount,
      activePanelId: typeof group?.activePanel?.id === 'string' ? group.activePanel.id : null,
      panelIds: groupPanels
        .map((panel: any) => (typeof panel?.id === 'string' ? panel.id : null))
        .filter((panelId: string | null): panelId is string => panelId !== null),
      classes: typeof group?.element?.className === 'string' ? group.element.className : null,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    dockviewId: ctx.currentDockviewId ?? null,
    contextType: ctx.contextType,
    position: ctx.position ?? null,
    panelId: ctx.panelId ?? null,
    groupId: ctx.groupId ?? null,
    target: backgroundTarget,
    totals: {
      groups: groups.length,
      panels: panels.length,
      emptyGroups: groupSnapshots.filter((group) => group.panelCount === 0).length,
    },
    groups: groupSnapshots,
  };
}

async function copyJsonToClipboard(value: unknown): Promise<boolean> {
  const text = JSON.stringify(value, null, 2);
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function getEmptyGroups(api: unknown): any[] {
  if (!api) return [];
  return getDockviewGroups(api as any).filter((group) => getGroupPanelCount(group) === 0);
}

function hasMaskData(item: any): boolean {
  const hasLayers = Array.isArray(item?.maskLayers) && item.maskLayers.length > 0;
  const hasUrl = typeof item?.maskUrl === 'string' && item.maskUrl.trim().length > 0;
  return hasLayers || hasUrl;
}

function resolveMaskLayerAssetUrl(layer: any): string | null {
  if (!layer || typeof layer !== 'object') return null;
  if (typeof layer.assetUrl === 'string' && layer.assetUrl.trim().length > 0) {
    return layer.assetUrl.trim();
  }
  if (typeof layer.maskUrl === 'string' && layer.maskUrl.trim().length > 0) {
    return layer.maskUrl.trim();
  }
  const candidateId =
    (typeof layer.savedAssetId === 'number' && Number.isFinite(layer.savedAssetId)
      ? Math.floor(layer.savedAssetId)
      : null)
    ?? (typeof layer.assetId === 'number' && Number.isFinite(layer.assetId)
      ? Math.floor(layer.assetId)
      : null)
    ?? (typeof layer.asset?.id === 'number' && Number.isFinite(layer.asset.id)
      ? Math.floor(layer.asset.id)
      : null);
  if (typeof candidateId === 'number' && candidateId > 0) {
    return `asset:${candidateId}`;
  }
  return null;
}

function deriveInputMaskUrl(item: any): string | null {
  if (typeof item?.maskUrl === 'string' && item.maskUrl.trim().length > 0) {
    return item.maskUrl.trim();
  }
  const layers = Array.isArray(item?.maskLayers) ? item.maskLayers : [];
  if (layers.length === 0) return null;
  const normalized = layers
    .map((layer) => ({ layer, assetUrl: resolveMaskLayerAssetUrl(layer) }))
    .filter((entry): entry is { layer: any; assetUrl: string } => !!entry.assetUrl);
  if (normalized.length === 0) return null;
  const visible = normalized.filter((entry) => entry.layer?.visible !== false);
  const active = visible.length > 0 ? visible : normalized;
  return active[0]?.assetUrl ?? null;
}

function summarizeOperationInputs(operationInputs: any): Record<string, unknown> {
  if (!operationInputs || typeof operationInputs !== 'object') return {};
  const summary: Record<string, unknown> = {};
  for (const [operationType, value] of Object.entries(operationInputs)) {
    const row = value as { items?: any[]; currentIndex?: number };
    const items = Array.isArray(row?.items) ? row.items : [];
    const currentIndex = typeof row?.currentIndex === 'number' ? row.currentIndex : 1;
    const currentItemIndex = Math.max(0, Math.min(currentIndex - 1, Math.max(0, items.length - 1)));
    const currentItem = items[currentItemIndex] ?? null;
    const maskedItems = items
      .filter((item) => hasMaskData(item))
      .map((item) => ({
        inputId: item?.id ?? null,
        assetId: item?.asset?.id ?? null,
        maskLayers: Array.isArray(item?.maskLayers) ? item.maskLayers.length : 0,
        hasMaskUrl: typeof item?.maskUrl === 'string' && item.maskUrl.trim().length > 0,
        resolvedMaskUrl: deriveInputMaskUrl(item),
        layerDetails: (Array.isArray(item?.maskLayers) ? item.maskLayers : []).map((layer: any) => ({
          id: layer?.id ?? null,
          visible: layer?.visible ?? null,
          opacity: layer?.opacity ?? null,
          assetUrl: typeof layer?.assetUrl === 'string' ? layer.assetUrl : null,
          savedAssetId:
            typeof layer?.savedAssetId === 'number' && Number.isFinite(layer.savedAssetId)
              ? Math.floor(layer.savedAssetId)
              : null,
          resolvedMaskUrl: resolveMaskLayerAssetUrl(layer),
        })),
      }));
    summary[operationType] = {
      totalInputs: items.length,
      currentIndex,
      currentInputId: currentItem?.id ?? null,
      currentAssetId: currentItem?.asset?.id ?? null,
      currentHasMaskData: hasMaskData(currentItem),
      currentResolvedMaskUrl: deriveInputMaskUrl(currentItem),
      maskedInputCount: maskedItems.length,
      maskedInputs: maskedItems,
    };
  }
  return summary;
}

function summarizeInputStore(store: unknown, label: string): Record<string, unknown> | null {
  if (typeof store !== 'function' || typeof (store as any).getState !== 'function') return null;
  try {
    const state = (store as any).getState();
    return {
      label,
      operations: summarizeOperationInputs(state?.inputsByOperation),
      hasProviderOpCache:
        !!state?.inputsByProviderOp && Object.keys(state.inputsByProviderOp).length > 0,
    };
  } catch (error) {
    return {
      label,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeSettingsStore(store: unknown, label: string): Record<string, unknown> | null {
  if (typeof store !== 'function' || typeof (store as any).getState !== 'function') return null;
  try {
    const state = (store as any).getState();
    const params = state?.params ?? {};
    return {
      label,
      operationType: state?.operationType ?? null,
      providerId: state?.providerId ?? null,
      model: params?.model ?? null,
      mask_url: params?.mask_url ?? null,
      mask_source: params?.mask_source ?? null,
      source_asset_id: params?.source_asset_id ?? null,
      source_asset_ids: Array.isArray(params?.source_asset_ids) ? params.source_asset_ids : null,
    };
  } catch (error) {
    return {
      label,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readPersistedGenerationSnapshots(): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return { available: false };

  const inputKeys = Object.keys(localStorage).filter(
    (key) => key === 'generation_inputs' || key.startsWith('generation_inputs:'),
  );
  const settingsKeys = Object.keys(localStorage).filter(
    (key) => key === 'generation_settings' || key.startsWith('generation_settings:'),
  );

  const persistedInputs = inputKeys.map((key) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      const state = parsed?.state ?? parsed;
      return {
        key,
        operations: summarizeOperationInputs(state?.inputsByOperation),
      };
    } catch (error) {
      return {
        key,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const persistedSettings = settingsKeys.map((key) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      const state = parsed?.state ?? parsed;
      const params = state?.params ?? {};
      return {
        key,
        operationType: state?.operationType ?? null,
        providerId: state?.providerId ?? null,
        mask_url: params?.mask_url ?? null,
        source_asset_id: params?.source_asset_id ?? null,
      };
    } catch (error) {
      return {
        key,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  return {
    available: true,
    inputs: persistedInputs,
    settings: persistedSettings,
  };
}

function toEpochMs(value: unknown): number {
  if (typeof value !== 'string' || value.trim().length === 0) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function extractMaskUrl(record: unknown): string | null {
  if (!isRecord(record)) return null;
  const direct =
    (typeof (record as any).mask_url === 'string' && (record as any).mask_url.trim().length > 0
      ? (record as any).mask_url.trim()
      : null)
    ?? (typeof (record as any).maskUrl === 'string' && (record as any).maskUrl.trim().length > 0
      ? (record as any).maskUrl.trim()
      : null);
  if (direct) return direct;

  const generationConfig = (record as any).generation_config;
  if (isRecord(generationConfig)) {
    const nested =
      (typeof (generationConfig as any).mask_url === 'string' && (generationConfig as any).mask_url.trim().length > 0
        ? (generationConfig as any).mask_url.trim()
        : null)
      ?? (typeof (generationConfig as any).maskUrl === 'string' && (generationConfig as any).maskUrl.trim().length > 0
        ? (generationConfig as any).maskUrl.trim()
        : null);
    if (nested) return nested;
  }

  return null;
}

function extractCompositionAssetsCount(record: unknown): number {
  if (!isRecord(record)) return 0;
  const direct = (record as any).composition_assets;
  if (Array.isArray(direct)) return direct.length;
  const generationConfig = (record as any).generation_config;
  if (isRecord(generationConfig) && Array.isArray((generationConfig as any).composition_assets)) {
    return ((generationConfig as any).composition_assets as unknown[]).length;
  }
  return 0;
}

function summarizeGenerationTrace(): Record<string, unknown> {
  try {
    const generationsState = useGenerationsStore.getState();
    const allGenerations = Array.from(generationsState.generations.values());
    if (allGenerations.length === 0) {
      return {
        available: false,
        reason: 'no_generations_in_store',
      };
    }

    const sorted = [...allGenerations].sort((a, b) => {
      const byUpdated = toEpochMs((b as any).updatedAt) - toEpochMs((a as any).updatedAt);
      if (byUpdated !== 0) return byUpdated;
      return (b?.id ?? 0) - (a?.id ?? 0);
    });

    const watchingGeneration =
      typeof generationsState.watchingGenerationId === 'number'
        ? generationsState.generations.get(generationsState.watchingGenerationId)
        : undefined;
    const latestGeneration = sorted[0];
    const remakerGeneration = sorted.find((g) => g?.providerId === 'remaker') ?? null;

    const pick = (generation: any) => {
      if (!generation) return null;
      const canonicalMaskUrl = extractMaskUrl(generation.canonicalParams);
      const rawMaskUrl = extractMaskUrl(generation.rawParams);
      const canonicalCompositionCount = extractCompositionAssetsCount(generation.canonicalParams);
      const rawCompositionCount = extractCompositionAssetsCount(generation.rawParams);
      const latestSubmissionPayload = isRecord(generation.latestSubmissionPayload)
        ? generation.latestSubmissionPayload
        : null;
      return {
        id: generation.id,
        status: generation.status,
        operationType: generation.operationType,
        providerId: generation.providerId,
        createdAt: generation.createdAt ?? null,
        updatedAt: generation.updatedAt ?? null,
        latestSubmissionProviderJobId: generation.latestSubmissionProviderJobId ?? null,
        canonicalMaskUrl,
        rawMaskUrl,
        canonicalCompositionAssetsCount: canonicalCompositionCount,
        rawCompositionAssetsCount: rawCompositionCount,
        latestSubmissionPayload: latestSubmissionPayload
          ? {
              mode:
                typeof (latestSubmissionPayload as any).mode === 'string'
                  ? (latestSubmissionPayload as any).mode
                  : null,
              mask_source:
                typeof (latestSubmissionPayload as any).mask_source === 'string'
                  ? (latestSubmissionPayload as any).mask_source
                  : null,
              mask:
                typeof (latestSubmissionPayload as any).mask === 'string'
                  ? (latestSubmissionPayload as any).mask
                  : null,
              original_image_source:
                typeof (latestSubmissionPayload as any).original_image_source === 'string'
                  ? (latestSubmissionPayload as any).original_image_source
                  : null,
              original_image_path:
                typeof (latestSubmissionPayload as any).original_image_path === 'string'
                  ? (latestSubmissionPayload as any).original_image_path
                  : null,
              mask_path:
                typeof (latestSubmissionPayload as any).mask_path === 'string'
                  ? (latestSubmissionPayload as any).mask_path
                  : null,
              debug_original_file:
                isRecord((latestSubmissionPayload as any)._debug_original_file)
                  ? (latestSubmissionPayload as any)._debug_original_file
                  : null,
              debug_mask_file:
                isRecord((latestSubmissionPayload as any)._debug_mask_file)
                  ? (latestSubmissionPayload as any)._debug_mask_file
                  : null,
              keys: Object.keys(latestSubmissionPayload),
            }
          : null,
      };
    };

    return {
      available: true,
      totals: {
        count: allGenerations.length,
      },
      watchingGenerationId: generationsState.watchingGenerationId ?? null,
      candidates: {
        watching: pick(watchingGeneration),
        latest: pick(latestGeneration),
        latestRemaker: pick(remakerGeneration),
      },
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function toNumericAssetId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return null;
}

function normalizeMaskUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAssetRefId(maskUrl: string): number | null {
  const match = maskUrl.match(/^asset:(\d+)$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function resolveViewerStoreAssetId(): number | null {
  try {
    const currentAsset = useAssetViewerStore.getState().currentAsset;
    if (!currentAsset) return null;
    const metadataAssetId = toNumericAssetId(currentAsset.metadata?.assetId);
    if (metadataAssetId) return metadataAssetId;
    return toNumericAssetId(currentAsset.id);
  } catch {
    return null;
  }
}

function resolveContextAssetIdentity(
  ctx: MenuActionContext,
): { assetId: number | null; source: string | null } {
  const data = isRecord(ctx.data) ? ctx.data : null;
  if (!data) {
    const viewerStoreAssetId = resolveViewerStoreAssetId();
    return viewerStoreAssetId
      ? { assetId: viewerStoreAssetId, source: 'viewer-store.currentAsset' }
      : { assetId: null, source: null };
  }
  const directAsset = toNumericAssetId((data as any).asset?.id);
  if (directAsset) return { assetId: directAsset, source: 'context.data.asset.id' };
  const viewerAsset = toNumericAssetId((data as any).viewerAsset?.id);
  if (viewerAsset) return { assetId: viewerAsset, source: 'context.data.viewerAsset.id' };
  const viewerAssetAlt = toNumericAssetId((data as any)['viewer-asset']?.id);
  if (viewerAssetAlt) return { assetId: viewerAssetAlt, source: 'context.data.viewer-asset.id' };
  const byKey = toNumericAssetId((data as any).assetId);
  if (byKey) return { assetId: byKey, source: 'context.data.assetId' };
  const byId = toNumericAssetId((data as any).id);
  if (byId) return { assetId: byId, source: 'context.data.id' };
  const viewerStoreAssetId = resolveViewerStoreAssetId();
  if (viewerStoreAssetId) {
    return { assetId: viewerStoreAssetId, source: 'viewer-store.currentAsset' };
  }
  return { assetId: null, source: null };
}

interface MaskCandidate {
  maskUrl: string;
  source: string;
  score: number;
  operationType: string | null;
  assetId: number | null;
  sourceAssetId: number | null;
  maskAssetId: number | null;
  inputId: string | null;
}

function addMaskCandidate(
  candidates: MaskCandidate[],
  value: unknown,
  options: {
    source: string;
    score: number;
    targetAssetId: number | null;
    operationType?: unknown;
    assetId?: unknown;
    inputId?: unknown;
  },
): void {
  const maskUrl = normalizeMaskUrl(value);
  if (!maskUrl) return;
  const sourceAssetId = toNumericAssetId(options.assetId);
  const maskAssetId = parseAssetRefId(maskUrl);
  const assetId = sourceAssetId ?? maskAssetId;
  const operationType = typeof options.operationType === 'string' ? options.operationType : null;
  const inputId = typeof options.inputId === 'string' && options.inputId.length > 0 ? options.inputId : null;
  const scoreAdjust =
    options.targetAssetId != null && sourceAssetId != null
      ? sourceAssetId === options.targetAssetId
        ? 120
        : -15
      : 0;
  candidates.push({
    maskUrl,
    source: options.source,
    score: options.score + scoreAdjust,
    operationType,
    assetId,
    sourceAssetId,
    maskAssetId,
    inputId,
  });
}

function collectMaskCandidates(
  snapshot: Record<string, unknown>,
  targetAssetId: number | null,
): MaskCandidate[] {
  const candidates: MaskCandidate[] = [];

  const runtime = isRecord((snapshot as any).runtime) ? ((snapshot as any).runtime as Record<string, unknown>) : null;
  const generationStores = isRecord((snapshot as any).generationStores)
    ? ((snapshot as any).generationStores as Record<string, unknown>)
    : null;
  const persisted = isRecord((snapshot as any).persisted)
    ? ((snapshot as any).persisted as Record<string, unknown>)
    : null;

  if (runtime) {
    const lastCreateRequest = isRecord((runtime as any).lastCreateGenerationRequest)
      ? ((runtime as any).lastCreateGenerationRequest as Record<string, unknown>)
      : null;
    const lastPreparedSubmission = isRecord((runtime as any).lastPreparedSubmission)
      ? ((runtime as any).lastPreparedSubmission as Record<string, unknown>)
      : null;
    const lastQuickgenMaskDebug = isRecord((runtime as any).lastQuickgenMaskDebug)
      ? ((runtime as any).lastQuickgenMaskDebug as Record<string, unknown>)
      : null;
    const generationTrace = isRecord((runtime as any).generationTrace)
      ? ((runtime as any).generationTrace as Record<string, unknown>)
      : null;

    if (lastCreateRequest) {
      addMaskCandidate(candidates, (lastCreateRequest as any).requestMaskUrl, {
        source: 'runtime.lastCreateGenerationRequest.requestMaskUrl',
        score: 250,
        targetAssetId,
      });
      addMaskCandidate(candidates, (lastCreateRequest as any).configMaskUrl, {
        source: 'runtime.lastCreateGenerationRequest.configMaskUrl',
        score: 240,
        targetAssetId,
      });
    }

    if (lastPreparedSubmission) {
      addMaskCandidate(candidates, (lastPreparedSubmission as any).mergedMaskUrl, {
        source: 'runtime.lastPreparedSubmission.mergedMaskUrl',
        score: 235,
        targetAssetId,
      });
      addMaskCandidate(candidates, (lastPreparedSubmission as any).configMaskUrl, {
        source: 'runtime.lastPreparedSubmission.configMaskUrl',
        score: 225,
        targetAssetId,
      });
    }

    if (lastQuickgenMaskDebug) {
      addMaskCandidate(candidates, (lastQuickgenMaskDebug as any).resolvedMaskUrl, {
        source: 'runtime.lastQuickgenMaskDebug.resolvedMaskUrl',
        score: 220,
        targetAssetId,
        operationType: (lastQuickgenMaskDebug as any).operationType,
        assetId: (lastQuickgenMaskDebug as any).currentInputAssetId,
        inputId: (lastQuickgenMaskDebug as any).currentInputId,
      });
      addMaskCandidate(candidates, (lastQuickgenMaskDebug as any).fallbackMaskUrlFromCurrentInput, {
        source: 'runtime.lastQuickgenMaskDebug.fallbackMaskUrlFromCurrentInput',
        score: 200,
        targetAssetId,
        operationType: (lastQuickgenMaskDebug as any).operationType,
        assetId: (lastQuickgenMaskDebug as any).currentInputAssetId,
        inputId: (lastQuickgenMaskDebug as any).currentInputId,
      });
      addMaskCandidate(candidates, (lastQuickgenMaskDebug as any).fallbackMaskUrlFromInputs, {
        source: 'runtime.lastQuickgenMaskDebug.fallbackMaskUrlFromInputs',
        score: 195,
        targetAssetId,
        operationType: (lastQuickgenMaskDebug as any).operationType,
        assetId: (lastQuickgenMaskDebug as any).currentInputAssetId,
      });
    }

    if (generationTrace && isRecord((generationTrace as any).candidates)) {
      const traceCandidates = (generationTrace as any).candidates as Record<string, unknown>;
      const traceKeys: Array<[string, number]> = [
        ['watching', 190],
        ['latest', 185],
        ['latestRemaker', 180],
      ];
      for (const [traceKey, baseScore] of traceKeys) {
        const traceRecord = isRecord(traceCandidates[traceKey])
          ? (traceCandidates[traceKey] as Record<string, unknown>)
          : null;
        if (!traceRecord) continue;
        const latestPayload = isRecord((traceRecord as any).latestSubmissionPayload)
          ? ((traceRecord as any).latestSubmissionPayload as Record<string, unknown>)
          : null;
        const traceSourceAssetId = latestPayload
          ? parseAssetRefId(
              typeof (latestPayload as any).original_image_source === 'string'
                ? (latestPayload as any).original_image_source
                : '',
            )
          : null;
        addMaskCandidate(candidates, (traceRecord as any).canonicalMaskUrl, {
          source: `runtime.generationTrace.${traceKey}.canonicalMaskUrl`,
          score: baseScore,
          targetAssetId,
          operationType: (traceRecord as any).operationType,
          assetId: traceSourceAssetId,
        });
        addMaskCandidate(candidates, (traceRecord as any).rawMaskUrl, {
          source: `runtime.generationTrace.${traceKey}.rawMaskUrl`,
          score: baseScore - 3,
          targetAssetId,
          operationType: (traceRecord as any).operationType,
          assetId: traceSourceAssetId,
        });
        if (latestPayload) {
          addMaskCandidate(candidates, (latestPayload as any).mask_source, {
            source: `runtime.generationTrace.${traceKey}.latestSubmissionPayload.mask_source`,
            score: baseScore - 6,
            targetAssetId,
            operationType: (traceRecord as any).operationType,
            assetId: traceSourceAssetId,
          });
          addMaskCandidate(candidates, (latestPayload as any).mask, {
            source: `runtime.generationTrace.${traceKey}.latestSubmissionPayload.mask`,
            score: baseScore - 10,
            targetAssetId,
            operationType: (traceRecord as any).operationType,
            assetId: traceSourceAssetId,
          });
        }
      }
    }
  }

  if (generationStores) {
    const inputStores = Array.isArray((generationStores as any).inputStores)
      ? ((generationStores as any).inputStores as Array<Record<string, unknown>>)
      : [];
    for (const store of inputStores) {
      const storeLabel = typeof (store as any).label === 'string' ? (store as any).label : 'unknown';
      const operations = isRecord((store as any).operations)
        ? ((store as any).operations as Record<string, unknown>)
        : {};
      for (const [operationType, operation] of Object.entries(operations)) {
        if (!isRecord(operation)) continue;
        addMaskCandidate(candidates, (operation as any).currentResolvedMaskUrl, {
          source: `generationStores.inputStores.${storeLabel}.${operationType}.currentResolvedMaskUrl`,
          score: 175,
          targetAssetId,
          operationType,
          assetId: (operation as any).currentAssetId,
          inputId: (operation as any).currentInputId,
        });

        const maskedInputs = Array.isArray((operation as any).maskedInputs)
          ? ((operation as any).maskedInputs as Array<Record<string, unknown>>)
          : [];
        for (const maskedInput of maskedInputs) {
          addMaskCandidate(candidates, (maskedInput as any).resolvedMaskUrl, {
            source: `generationStores.inputStores.${storeLabel}.${operationType}.maskedInputs.resolvedMaskUrl`,
            score: 170,
            targetAssetId,
            operationType,
            assetId: (maskedInput as any).assetId,
            inputId: (maskedInput as any).inputId,
          });
        }
      }
    }

    const settingsStores = Array.isArray((generationStores as any).settingsStores)
      ? ((generationStores as any).settingsStores as Array<Record<string, unknown>>)
      : [];
    for (const settingsStore of settingsStores) {
      const storeLabel =
        typeof (settingsStore as any).label === 'string' ? (settingsStore as any).label : 'unknown';
      addMaskCandidate(candidates, (settingsStore as any).mask_url, {
        source: `generationStores.settingsStores.${storeLabel}.mask_url`,
        score: 145,
        targetAssetId,
        operationType: (settingsStore as any).operationType,
        assetId: (settingsStore as any).source_asset_id,
      });
      addMaskCandidate(candidates, (settingsStore as any).mask_source, {
        source: `generationStores.settingsStores.${storeLabel}.mask_source`,
        score: 142,
        targetAssetId,
        operationType: (settingsStore as any).operationType,
        assetId: (settingsStore as any).source_asset_id,
      });
    }
  }

  if (persisted) {
    const persistedInputRows = Array.isArray((persisted as any).inputs)
      ? ((persisted as any).inputs as Array<Record<string, unknown>>)
      : [];
    for (const persistedRow of persistedInputRows) {
      const storageKey = typeof (persistedRow as any).key === 'string' ? (persistedRow as any).key : 'unknown';
      const operations = isRecord((persistedRow as any).operations)
        ? ((persistedRow as any).operations as Record<string, unknown>)
        : {};
      for (const [operationType, operation] of Object.entries(operations)) {
        if (!isRecord(operation)) continue;
        addMaskCandidate(candidates, (operation as any).currentResolvedMaskUrl, {
          source: `persisted.inputs.${storageKey}.${operationType}.currentResolvedMaskUrl`,
          score: 120,
          targetAssetId,
          operationType,
          assetId: (operation as any).currentAssetId,
          inputId: (operation as any).currentInputId,
        });
      }
    }

    const persistedSettingsRows = Array.isArray((persisted as any).settings)
      ? ((persisted as any).settings as Array<Record<string, unknown>>)
      : [];
    for (const persistedSettings of persistedSettingsRows) {
      const storageKey =
        typeof (persistedSettings as any).key === 'string' ? (persistedSettings as any).key : 'unknown';
      addMaskCandidate(candidates, (persistedSettings as any).mask_url, {
        source: `persisted.settings.${storageKey}.mask_url`,
        score: 95,
        targetAssetId,
        operationType: (persistedSettings as any).operationType,
        assetId: (persistedSettings as any).source_asset_id,
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function resolveMaskFileUrl(maskUrl: string): string | null {
  const normalized = normalizeMaskUrl(maskUrl);
  if (!normalized) return null;
  const assetId = parseAssetRefId(normalized);
  if (assetId != null) {
    return `${BACKEND_BASE.replace(/\/$/, '')}/api/v1/assets/${assetId}/file`;
  }
  if (/^(blob:|data:|https?:\/\/)/i.test(normalized)) {
    return normalized;
  }
  if (normalized.startsWith('/')) {
    return `${BACKEND_BASE.replace(/\/$/, '')}${normalized}`;
  }
  return null;
}

function isBackendUrl(url: string): boolean {
  try {
    const backendOrigin = new URL(BACKEND_BASE).origin;
    const resolvedOrigin = new URL(url, BACKEND_BASE).origin;
    return backendOrigin === resolvedOrigin;
  } catch {
    return false;
  }
}

async function fetchMaskBlob(maskUrl: string): Promise<{ blob: Blob; resolvedFileUrl: string }> {
  const resolvedFileUrl = resolveMaskFileUrl(maskUrl);
  if (!resolvedFileUrl) {
    throw new Error(`Unsupported mask URL format: ${maskUrl}`);
  }

  const token = authService.getStoredToken();
  const headers = isBackendUrl(resolvedFileUrl)
    ? withCorrelationHeaders(
        token ? { Authorization: `Bearer ${token}` } : undefined,
        'context-menu:debug-mask-fetch',
      )
    : (token ? { Authorization: `Bearer ${token}` } : undefined);
  const res = await fetch(resolvedFileUrl, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`Mask fetch failed (${res.status}) for ${resolvedFileUrl}`);
  }

  return { blob: await res.blob(), resolvedFileUrl };
}

async function openMaskPreview(maskUrl: string): Promise<{
  opened: boolean;
  resolvedFileUrl: string;
  usedBlobPreview: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
}> {
  const resolvedFileUrl = resolveMaskFileUrl(maskUrl);
  if (!resolvedFileUrl) {
    throw new Error(`Unsupported mask URL format: ${maskUrl}`);
  }
  if (typeof window === 'undefined') {
    throw new Error('Preview unavailable outside browser context.');
  }

  const shouldUseBlobPreview = parseAssetRefId(maskUrl) != null || isBackendUrl(resolvedFileUrl);
  if (!shouldUseBlobPreview) {
    const openedWindow = window.open(resolvedFileUrl, '_blank', 'noopener,noreferrer');
    return {
      opened: !!openedWindow,
      resolvedFileUrl,
      usedBlobPreview: false,
      mimeType: null,
      sizeBytes: null,
    };
  }

  const { blob } = await fetchMaskBlob(maskUrl);
  const objectUrl = URL.createObjectURL(blob);
  const openedWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!openedWindow) {
    URL.revokeObjectURL(objectUrl);
  } else {
    // Keep alive briefly for tab load, then release memory.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 90_000);
  }
  return {
    opened: !!openedWindow,
    resolvedFileUrl,
    usedBlobPreview: true,
    mimeType: blob.type || null,
    sizeBytes: Number.isFinite(blob.size) ? blob.size : null,
  };
}

async function readImageDataFromBlob(blob: Blob): Promise<ImageData> {
  if (typeof document === 'undefined') {
    throw new Error('Image analysis unavailable outside browser context.');
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode mask image.'));
      img.src = objectUrl;
    });
    const width = Math.max(1, Math.floor(image.naturalWidth || image.width || 1));
    const height = Math.max(1, Math.floor(image.naturalHeight || image.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Could not create 2D canvas context for mask analysis.');
    }
    ctx.drawImage(image, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function toPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(3));
}

async function analyzeMaskUrl(maskUrl: string): Promise<Record<string, unknown>> {
  const { blob, resolvedFileUrl } = await fetchMaskBlob(maskUrl);
  const imageData = await readImageDataFromBlob(blob);
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  let blackPixels = 0;
  let whitePixels = 0;
  let midPixels = 0;
  let lumaSum = 0;
  const lumaSeen = new Uint8Array(256);
  let alphaMin = 255;
  let alphaMax = 0;
  let alphaSum = 0;
  let alphaOpaquePixels = 0;
  let alphaTransparentPixels = 0;

  let whiteMinX = width;
  let whiteMinY = height;
  let whiteMaxX = -1;
  let whiteMaxY = -1;

  for (let idx = 0; idx < data.length; idx += 4) {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    const luma = Math.round((r + g + b) / 3);
    lumaSum += luma;
    lumaSeen[luma] = 1;

    if (luma <= 5) {
      blackPixels += 1;
    } else if (luma >= 250) {
      whitePixels += 1;
      if (a > 0) {
        const pixelIndex = idx / 4;
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        if (x < whiteMinX) whiteMinX = x;
        if (y < whiteMinY) whiteMinY = y;
        if (x > whiteMaxX) whiteMaxX = x;
        if (y > whiteMaxY) whiteMaxY = y;
      }
    } else {
      midPixels += 1;
    }

    if (a < alphaMin) alphaMin = a;
    if (a > alphaMax) alphaMax = a;
    alphaSum += a;
    if (a >= 250) alphaOpaquePixels += 1;
    if (a <= 5) alphaTransparentPixels += 1;
  }

  let lumaUniqueValues = 0;
  for (let i = 0; i < lumaSeen.length; i += 1) {
    if (lumaSeen[i] > 0) lumaUniqueValues += 1;
  }

  const whiteBoundingBox =
    whiteMaxX >= 0 && whiteMaxY >= 0
      ? {
          x: whiteMinX,
          y: whiteMinY,
          width: whiteMaxX - whiteMinX + 1,
          height: whiteMaxY - whiteMinY + 1,
          areaPixels: (whiteMaxX - whiteMinX + 1) * (whiteMaxY - whiteMinY + 1),
          imageCoveragePct: toPercent(
            (whiteMaxX - whiteMinX + 1) * (whiteMaxY - whiteMinY + 1),
            totalPixels,
          ),
        }
      : null;
  const whitePctInsideBoundingBox =
    whiteBoundingBox && whiteBoundingBox.areaPixels > 0
      ? toPercent(whitePixels, whiteBoundingBox.areaPixels)
      : null;
  const shapeHint =
    whitePctInsideBoundingBox != null
      ? whitePctInsideBoundingBox < 15
        ? 'sparse-strokes'
        : whitePctInsideBoundingBox < 45
          ? 'partial-fill'
          : 'dense-fill'
      : 'empty';

  return {
    maskUrl,
    resolvedFileUrl,
    mimeType: blob.type || null,
    sizeBytes: Number.isFinite(blob.size) ? blob.size : null,
    width,
    height,
    totalPixels,
    whitePixels,
    whitePct: toPercent(whitePixels, totalPixels),
    blackPixels,
    blackPct: toPercent(blackPixels, totalPixels),
    midPixels,
    midPct: toPercent(midPixels, totalPixels),
    lumaMean: Number((lumaSum / Math.max(1, totalPixels)).toFixed(3)),
    lumaUniqueValues,
    binaryLike: lumaUniqueValues <= 3 && midPixels === 0,
    alphaMin,
    alphaMax,
    alphaMean: Number((alphaSum / Math.max(1, totalPixels)).toFixed(3)),
    alphaOpaquePct: toPercent(alphaOpaquePixels, totalPixels),
    alphaTransparentPct: toPercent(alphaTransparentPixels, totalPixels),
    hasTransparency: alphaMin < 255,
    whiteBoundingBox,
    whitePctInsideBoundingBox,
    shapeHint,
  };
}

function resolveActiveMask(ctx: MenuActionContext): {
  targetAssetId: number | null;
  targetAssetSource: string | null;
  resolutionConfidence: 'high' | 'medium' | 'low';
  resolutionReason: string;
  selected: MaskCandidate | null;
  candidates: MaskCandidate[];
  snapshot: Record<string, unknown>;
} {
  const snapshot = buildGenerationScopeSnapshot(ctx);
  const contextAsset = resolveContextAssetIdentity(ctx);
  const runtimeFallbackAssetId =
    toNumericAssetId(((snapshot as any).runtime as any)?.lastQuickgenMaskDebug?.currentInputAssetId)
    ?? null;
  const targetAssetId = contextAsset.assetId ?? runtimeFallbackAssetId ?? null;
  const targetAssetSource =
    contextAsset.assetId != null
      ? contextAsset.source
      : runtimeFallbackAssetId != null
        ? 'runtime.lastQuickgenMaskDebug.currentInputAssetId'
        : null;
  const candidates = collectMaskCandidates(snapshot, targetAssetId);
  const selected = candidates[0] ?? null;
  const resolution = (() => {
    if (!selected) {
      return { confidence: 'low' as const, reason: 'no_mask_candidate' };
    }
    if (targetAssetId == null) {
      return { confidence: 'low' as const, reason: 'no_target_asset_context' };
    }
    if (selected.sourceAssetId == null) {
      return { confidence: 'medium' as const, reason: 'selected_mask_not_asset_bound' };
    }
    if (selected.sourceAssetId === targetAssetId) {
      return { confidence: 'high' as const, reason: 'selected_mask_matches_target_asset' };
    }
    return { confidence: 'low' as const, reason: 'selected_mask_asset_mismatch' };
  })();
  return {
    targetAssetId,
    targetAssetSource,
    resolutionConfidence: resolution.confidence,
    resolutionReason: resolution.reason,
    selected,
    candidates,
    snapshot,
  };
}

function buildGenerationScopeSnapshot(ctx: MenuActionContext): Record<string, unknown> {
  const panelId = ctx.panelId ?? undefined;
  const instanceId = ctx.instanceId ?? undefined;
  const dockviewId = ctx.currentDockviewId ?? undefined;

  const panelDefinition = panelId ? panelSelectors.get(panelId) : undefined;
  const declaredScopes = panelDefinition?.settingScopes ?? panelDefinition?.scopes;
  const scopeContext = panelId && instanceId
    ? {
        panelId,
        instanceId,
        dockviewId,
        declaredScopes,
        tags: panelDefinition?.tags,
        category: panelDefinition?.category,
      }
    : null;

  const allScopes = panelSettingsScopeRegistry.getAll();
  const instanceScopes = instanceId
    ? usePanelInstanceSettingsStore.getState().instances?.[instanceId]?.scopes ?? {}
    : {};
  const applicableScopes = scopeContext
    ? allScopes.filter((scope) => scope.shouldApply?.(scopeContext))
    : [];
  const resolvedScopes = applicableScopes.map((scope) => {
    const mode = getScopeMode(instanceScopes, scope);
    const resolvedScopeId = scopeContext
      ? resolveScopeInstanceId(scope, mode, {
          instanceId: scopeContext.instanceId,
          panelId: scopeContext.panelId,
          dockviewId: scopeContext.dockviewId,
        })
      : null;
    return {
      scopeId: scope.id,
      label: scope.label ?? scope.id,
      mode,
      resolvedScopeId,
    };
  });

  const inputStoreEntries = [
    { scopeId: 'global', store: useGenerationInputStore as unknown },
    ...getRegisteredInputStoreEntries().map((entry) => ({
      scopeId: entry.scopeId,
      store: entry.store as unknown,
    })),
  ];
  const settingsStoreEntries = [
    { scopeId: 'global', store: useGenerationSettingsStore as unknown },
    ...getRegisteredSettingsStoreEntries().map((entry) => ({
      scopeId: entry.scopeId,
      store: entry.store as unknown,
    })),
  ];

  const uniqueInputStoreEntries: Array<{ scopeId: string; store: unknown }> = [];
  const seenInput = new Set<unknown>();
  for (const entry of inputStoreEntries) {
    if (seenInput.has(entry.store)) continue;
    seenInput.add(entry.store);
    uniqueInputStoreEntries.push(entry);
  }

  const uniqueSettingsStoreEntries: Array<{ scopeId: string; store: unknown }> = [];
  const seenSettings = new Set<unknown>();
  for (const entry of settingsStoreEntries) {
    if (seenSettings.has(entry.store)) continue;
    seenSettings.add(entry.store);
    uniqueSettingsStoreEntries.push(entry);
  }
  const lastQuickgenMaskDebug = (globalThis as any).__quickgenLastMaskDebug ?? null;
  const lastPreparedSubmission = (globalThis as any).__quickgenLastPreparedSubmission ?? null;
  const lastCreateGenerationRequest = (globalThis as any).__quickgenLastCreateGenerationRequest ?? null;
  const lastMaskPreviewResolution = (globalThis as any).__quickgenLastMaskPreviewResolution ?? null;
  const lastMaskInspection = (globalThis as any).__quickgenLastMaskInspection ?? null;
  const generationTrace = summarizeGenerationTrace();

  return {
    timestamp: new Date().toISOString(),
    context: {
      dockviewId: ctx.currentDockviewId ?? null,
      contextType: ctx.contextType,
      panelId: ctx.panelId ?? null,
      instanceId: ctx.instanceId ?? null,
      groupId: ctx.groupId ?? null,
    },
    panel: panelDefinition
      ? {
          id: panelDefinition.id,
          title: panelDefinition.title,
          settingScopes: declaredScopes ?? [],
          tags: panelDefinition.tags ?? [],
          category: panelDefinition.category ?? null,
        }
      : null,
    scopeResolution: {
      instanceScopes,
      applicable: resolvedScopes,
    },
    generationStores: {
      inputStores: uniqueInputStoreEntries
        .map((entry) => summarizeInputStore(entry.store, entry.scopeId))
        .filter((entry): entry is Record<string, unknown> => !!entry),
      settingsStores: uniqueSettingsStoreEntries
        .map((entry) => summarizeSettingsStore(entry.store, entry.scopeId))
        .filter((entry): entry is Record<string, unknown> => !!entry),
    },
    runtime: {
      lastQuickgenMaskDebug,
      lastPreparedSubmission,
      lastCreateGenerationRequest,
      lastMaskPreviewResolution,
      lastMaskInspection,
      generationTrace,
    },
    persisted: readPersistedGenerationSnapshots(),
  };
}

const debugSnapshotAction: MenuAction = {
  id: 'debug:dockview:snapshot',
  label: 'Log Snapshot',
  icon: 'bug',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => import.meta.env.DEV && !!resolveCurrentDockviewApi(ctx),
  execute: async (ctx) => {
    const snapshot = buildDockviewSnapshot(ctx);
    if (!snapshot) {
      notify('error', 'Dockview debug snapshot failed: no dockview API.');
      return;
    }

    console.groupCollapsed('[Dockview Debug] Snapshot');
    console.log(snapshot);
    console.groupEnd();

    const copied = await copyJsonToClipboard(snapshot);
    const totals = (snapshot.totals as any) ?? {};
    const summary = `groups=${totals.groups ?? '?'} panels=${totals.panels ?? '?'} empty=${totals.emptyGroups ?? '?'}`;
    notify(
      'info',
      copied
        ? `Dockview snapshot logged and copied to clipboard (${summary}).`
        : `Dockview snapshot logged (${summary}). Clipboard unavailable.`,
    );
  },
};

const generationScopeSnapshotAction: MenuAction = {
  id: 'debug:dockview:generation-scope-snapshot',
  label: 'Log Generation Scope Snapshot',
  icon: 'database',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: () => import.meta.env.DEV,
  execute: async (ctx) => {
    const snapshot = buildGenerationScopeSnapshot(ctx);
    console.groupCollapsed('[Dockview Debug] Generation Scope Snapshot');
    console.log(snapshot);
    console.groupEnd();

    const copied = await copyJsonToClipboard(snapshot);
    notify(
      'info',
      copied
        ? 'Generation scope snapshot logged and copied to clipboard.'
        : 'Generation scope snapshot logged. Clipboard unavailable.',
    );
  },
};

const openActiveMaskPreviewAction: MenuAction = {
  id: 'debug:dockview:open-active-mask-preview',
  label: 'Open Active Mask Preview',
  icon: 'image',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: () => import.meta.env.DEV,
  disabled: (ctx) => {
    const resolution = resolveActiveMask(ctx);
    if (resolution.selected) return false;
    return 'No active mask URL found in runtime/store snapshot';
  },
  execute: async (ctx) => {
    const resolution = resolveActiveMask(ctx);
    if (!resolution.selected) {
      notify('warning', 'No active mask URL found for preview.');
      return;
    }

    try {
      const preview = await openMaskPreview(resolution.selected.maskUrl);
      const payload = {
        ts: Date.now(),
        context: {
          dockviewId: ctx.currentDockviewId ?? null,
          panelId: ctx.panelId ?? null,
          instanceId: ctx.instanceId ?? null,
        },
        targetAssetId: resolution.targetAssetId,
        targetAssetSource: resolution.targetAssetSource,
        resolutionConfidence: resolution.resolutionConfidence,
        resolutionReason: resolution.resolutionReason,
        selected: resolution.selected,
        preview,
        candidateCount: resolution.candidates.length,
      };
      (globalThis as any).__quickgenLastMaskPreviewResolution = payload;

      console.groupCollapsed('[Dockview Debug] Active Mask Preview');
      console.log(payload);
      console.groupEnd();

      notify(
        preview.opened ? 'success' : 'warning',
        preview.opened
          ? `Opened active mask preview from ${resolution.selected.source}.`
          : 'Mask preview URL resolved, but popup was blocked.',
      );
    } catch (error) {
      notify(
        'error',
        `Failed to open active mask preview: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const analyzeActiveMaskAction: MenuAction = {
  id: 'debug:dockview:analyze-active-mask',
  label: 'Analyze Active Mask',
  icon: 'flask',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: () => import.meta.env.DEV,
  disabled: (ctx) => {
    const resolution = resolveActiveMask(ctx);
    if (resolution.selected) return false;
    return 'No active mask URL found in runtime/store snapshot';
  },
  execute: async (ctx) => {
    const resolution = resolveActiveMask(ctx);
    if (!resolution.selected) {
      notify('warning', 'No active mask URL found for analysis.');
      return;
    }

    try {
      const analysis = await analyzeMaskUrl(resolution.selected.maskUrl);
      const payload = {
        ts: Date.now(),
        context: {
          dockviewId: ctx.currentDockviewId ?? null,
          panelId: ctx.panelId ?? null,
          instanceId: ctx.instanceId ?? null,
        },
        targetAssetId: resolution.targetAssetId,
        targetAssetSource: resolution.targetAssetSource,
        resolutionConfidence: resolution.resolutionConfidence,
        resolutionReason: resolution.resolutionReason,
        selected: resolution.selected,
        analysis,
      };
      (globalThis as any).__quickgenLastMaskInspection = payload;

      console.groupCollapsed('[Dockview Debug] Active Mask Analysis');
      console.log(payload);
      console.groupEnd();

      const copied = await copyJsonToClipboard(payload);
      const whitePct = typeof (analysis as any).whitePct === 'number' ? (analysis as any).whitePct : null;
      notify(
        'info',
        copied
          ? `Mask analysis logged and copied${whitePct != null ? ` (white=${whitePct}%).` : '.'}`
          : `Mask analysis logged${whitePct != null ? ` (white=${whitePct}%).` : '.'} Clipboard unavailable.`,
      );
    } catch (error) {
      notify(
        'error',
        `Mask analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const pruneEmptyGroupsAction: MenuAction = {
  id: 'debug:dockview:prune-empty-groups',
  label: 'Prune Empty Groups',
  icon: 'trash-2',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => import.meta.env.DEV && !!resolveCurrentDockviewApi(ctx),
  disabled: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api) return true;
    return getEmptyGroups(api).length > 0 ? false : 'No empty groups found';
  },
  execute: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api) {
      notify('error', 'No dockview API found.');
      return;
    }

    const removeGroup = (api as any).removeGroup;
    if (typeof removeGroup !== 'function') {
      notify('error', 'Dockview API does not support removeGroup.');
      return;
    }

    const emptyGroups = getEmptyGroups(api);
    if (emptyGroups.length === 0) {
      notify('info', 'No empty groups to prune.');
      return;
    }

    let removed = 0;
    for (const group of emptyGroups) {
      const remainingGroups = getDockviewGroups(api).length;
      if (remainingGroups <= 1) break;
      try {
        removeGroup.call(api, group);
        removed += 1;
      } catch {
        // best effort; continue pruning remaining groups
      }
    }

    notify(
      removed > 0 ? 'success' : 'warning',
      removed > 0
        ? `Pruned ${removed} empty group${removed === 1 ? '' : 's'}.`
        : 'Empty groups detected but none were removed.',
    );
  },
};

const dockviewDebugSubmenuAction: MenuAction = {
  id: 'debug:dockview',
  label: 'Debug Dockview',
  icon: 'bug',
  category: 'debug',
  hideWhenEmpty: true,
  availableIn: ['background', 'tab', 'panel-content'],
  visible: () => import.meta.env.DEV,
  children: [
    { ...debugSnapshotAction, category: undefined },
    { ...generationScopeSnapshotAction, category: undefined, divider: true },
    { ...openActiveMaskPreviewAction, category: undefined },
    { ...analyzeActiveMaskAction, category: undefined, divider: true },
    { ...pruneEmptyGroupsAction, category: undefined, divider: true },
  ],
  execute: () => {},
};

export const debugActions: MenuAction[] = [dockviewDebugSubmenuAction];
