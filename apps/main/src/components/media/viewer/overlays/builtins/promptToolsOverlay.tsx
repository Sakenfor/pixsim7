import { useCallback, useMemo } from 'react';

import type { ViewerAsset } from '@features/assets';
import {
  PROMPT_TOOL_RUN_CONTEXT_PATCH_KEY,
  type PromptToolRunContextPatch,
} from '@features/generation/lib/runContext';
import { getGenerationSessionStore } from '@features/generation/stores/generationScopeStores';
import { useAssetRegionStore, useCaptureRegionStore } from '@features/mediaViewer/stores/assetRegionStore';
import {
  GENERATION_SCOPE_ID,
  getInstanceId,
  getScopeMode,
  panelSettingsScopeRegistry,
  resolveScopeInstanceId,
  usePanelInstanceSettingsStore,
} from '@features/panels';
import {
  PromptToolsPanel,
  type PromptToolsApplyPayload,
} from '@features/prompts/components/PromptToolsPanel';

import type { MediaOverlayComponentProps } from '../types';

import { useMaskOverlayStore } from './maskOverlayStore';

const VIEWER_QUICKGEN_PANEL_MANAGER_ID = 'viewerQuickGenerate';
const VIEWER_QUICKGEN_PANEL_ID = 'viewerQuickGenerate';

function getViewerBackendAssetId(asset: ViewerAsset): number | null {
  const metadataAssetId = asset.metadata?.assetId;
  if (typeof metadataAssetId === 'number' && Number.isFinite(metadataAssetId) && metadataAssetId > 0) {
    return metadataAssetId;
  }
  const directId = Number(asset.id);
  if (Number.isFinite(directId) && directId > 0) {
    return directId;
  }
  return null;
}

function joinPromptSections(...sections: Array<string | undefined | null>): string {
  return sections
    .map((section) => (typeof section === 'string' ? section.trim() : ''))
    .filter((section) => section.length > 0)
    .join('\n\n');
}

function composeOverlayBlockText(item: { text: string; primitiveTags?: string[] }): string {
  if (!item.primitiveTags || item.primitiveTags.length === 0) {
    return item.text;
  }
  const tagLine = `[primitive_tags: ${item.primitiveTags.join(', ')}]`;
  return `${tagLine}\n${item.text}`;
}

function composeOverlayText(payload: PromptToolsApplyPayload): string {
  if (!payload.blockOverlay || payload.blockOverlay.length === 0) return '';
  return payload.blockOverlay
    .map((item) => composeOverlayBlockText(item))
    .join('\n\n')
    .trim();
}

function normalizeRunContextPatch(payload: PromptToolsApplyPayload): PromptToolRunContextPatch | null {
  const hasGuidancePatch = !!(payload.guidancePatch && Object.keys(payload.guidancePatch).length > 0);
  const hasCompositionAssetsPatch = !!(
    payload.compositionAssetsPatch && payload.compositionAssetsPatch.length > 0
  );
  if (!hasGuidancePatch && !hasCompositionAssetsPatch) {
    return null;
  }
  return {
    ...(hasGuidancePatch ? { guidance_patch: payload.guidancePatch } : {}),
    ...(hasCompositionAssetsPatch ? { composition_assets_patch: payload.compositionAssetsPatch } : {}),
  };
}

function resolvePromptAfterApply(
  currentPrompt: string,
  payload: PromptToolsApplyPayload,
): string {
  const overlayText = composeOverlayText(payload);
  switch (payload.mode) {
    case 'replace_text':
      return payload.promptText;
    case 'append_text':
      return joinPromptSections(currentPrompt, payload.promptText);
    case 'apply_overlay_only':
      return overlayText ? joinPromptSections(currentPrompt, overlayText) : currentPrompt;
    case 'apply_all':
      return joinPromptSections(payload.promptText, overlayText);
    default:
      return currentPrompt;
  }
}

function useViewerQuickGenScopeId(): string {
  const hostInstanceId = getInstanceId(
    VIEWER_QUICKGEN_PANEL_MANAGER_ID,
    VIEWER_QUICKGEN_PANEL_ID,
  );
  const scopeDefinition = panelSettingsScopeRegistry.get(GENERATION_SCOPE_ID);
  const defaultMode = scopeDefinition?.defaultMode ?? 'local';

  const scopeMode = usePanelInstanceSettingsStore((state) => {
    const hostScopes = state.instances[hostInstanceId]?.scopes;
    const scopeDescriptor = scopeDefinition ?? { id: GENERATION_SCOPE_ID, defaultMode };
    return getScopeMode(
      hostScopes,
      scopeDescriptor,
      defaultMode,
    );
  });

  return useMemo(() => {
    if (scopeDefinition?.resolveScopeId) {
      return resolveScopeInstanceId(scopeDefinition, scopeMode, {
        instanceId: hostInstanceId,
        panelId: VIEWER_QUICKGEN_PANEL_ID,
        dockviewId: VIEWER_QUICKGEN_PANEL_MANAGER_ID,
      });
    }
    return scopeMode === 'global' ? 'global' : hostInstanceId;
  }, [hostInstanceId, scopeDefinition, scopeMode]);
}

export function PromptToolsOverlayMain({ asset }: MediaOverlayComponentProps) {
  const sessionScopeId = useViewerQuickGenScopeId();
  const useSessionStore = useMemo(
    () => getGenerationSessionStore(sessionScopeId),
    [sessionScopeId],
  );

  const promptText = useSessionStore((state) => state.prompt);
  const generating = useSessionStore((state) => state.generating);
  const setPrompt = useSessionStore((state) => state.setPrompt);
  const setUiState = useSessionStore((state) => state.setUiState);

  const maskRegionsByAsset = useAssetRegionStore((state) => state.regionsByAsset);
  const maskLayersByAsset = useAssetRegionStore((state) => state.layersByAsset);
  const captureRegionsByAsset = useCaptureRegionStore((state) => state.regionsByAsset);
  const captureLayersByAsset = useCaptureRegionStore((state) => state.layersByAsset);
  const maskOverlayLayers = useMaskOverlayStore((state) => state.layers);
  const maskOverlayActiveLayerId = useMaskOverlayStore((state) => state.activeLayerId);

  const runContextSeed = useMemo<Record<string, unknown>>(() => {
    const seed: Record<string, unknown> = {};
    const primaryAssetId = getViewerBackendAssetId(asset);
    const assetKey = String(asset.id);

    if (primaryAssetId !== null) {
      seed.primary_asset_id = primaryAssetId;
      const description = typeof asset.metadata?.description === 'string'
        ? asset.metadata.description.trim()
        : '';
      seed.composition_assets = [
        {
          asset_id: primaryAssetId,
          role: 'primary',
          label: description || asset.name || 'Asset 1',
          media_type: asset.type,
          ...(description ? { description } : {}),
        },
      ];
    }

    const visibleMaskLayerIds = new Set(
      (maskLayersByAsset.get(assetKey) ?? [])
        .filter((layer) => layer.visible)
        .map((layer) => layer.id),
    );
    const maskRegions = visibleMaskLayerIds.size === 0
      ? []
      : (maskRegionsByAsset.get(assetKey) ?? [])
        .map((region) => ({
          id: region.id,
          layerId: region.layerId,
          type: region.type,
          bounds: region.bounds,
          points: region.points,
          pointWidths: region.pointWidths,
          label: region.label,
          note: region.note,
        }))
        .filter((region) => visibleMaskLayerIds.has(region.layerId));
    if (maskRegions.length > 0) {
      seed.mask_regions = maskRegions;
    }

    const visibleCaptureLayerIds = new Set(
      (captureLayersByAsset.get(assetKey) ?? [])
        .filter((layer) => layer.visible)
        .map((layer) => layer.id),
    );
    const captureRegions = visibleCaptureLayerIds.size === 0
      ? []
      : (captureRegionsByAsset.get(assetKey) ?? [])
        .map((region) => ({
          id: region.id,
          layerId: region.layerId,
          type: region.type,
          bounds: region.bounds,
          points: region.points,
          pointWidths: region.pointWidths,
          label: region.label,
          note: region.note,
        }))
        .filter((region) => visibleCaptureLayerIds.has(region.layerId));
    if (captureRegions.length > 0) {
      seed.capture_regions = captureRegions;
    }

    const activeLayer = maskOverlayLayers.find((layer) => layer.id === maskOverlayActiveLayerId);
    const activeMaskAssetId = (
      activeLayer?.visible && typeof activeLayer.savedAssetId === 'number'
        ? activeLayer.savedAssetId
        : null
    );
    const fallbackMaskAssetId = maskOverlayLayers.find(
      (layer) => layer.visible && typeof layer.savedAssetId === 'number',
    )?.savedAssetId ?? null;
    const preferredMaskAssetId = activeMaskAssetId ?? fallbackMaskAssetId;
    if (preferredMaskAssetId !== null) {
      seed.mask_asset = { asset_id: preferredMaskAssetId };
    }

    return seed;
  }, [
    asset,
    captureLayersByAsset,
    captureRegionsByAsset,
    maskLayersByAsset,
    maskOverlayActiveLayerId,
    maskOverlayLayers,
    maskRegionsByAsset,
  ]);

  const handleApply = useCallback((payload: PromptToolsApplyPayload) => {
    const nextPrompt = resolvePromptAfterApply(promptText, payload);
    if (nextPrompt !== promptText) {
      setPrompt(nextPrompt);
    }

    const runContextPatch = normalizeRunContextPatch(payload);
    setUiState(PROMPT_TOOL_RUN_CONTEXT_PATCH_KEY, runContextPatch);
  }, [promptText, setPrompt, setUiState]);

  return (
    <div className="absolute inset-0 pointer-events-none flex">
      <div className="pointer-events-auto h-full w-[460px] border-r border-th/10 bg-surface-inset overflow-y-auto thin-scrollbar">
        <PromptToolsPanel
          promptText={promptText}
          disabled={generating}
          runContextSeed={runContextSeed}
          onApply={handleApply}
        />
      </div>
      <div className="flex-1" />
    </div>
  );
}

export function PromptToolsOverlaySidebar() {
  return null;
}
