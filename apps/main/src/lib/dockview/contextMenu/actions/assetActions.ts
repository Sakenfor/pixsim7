/**
 * Asset Actions
 *
 * Context menu actions for asset cards.
 */

import type { MenuAction } from '../types';
import type { AssetResponse, ViewerAsset } from '@features/assets';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { useAssetViewerStore } from '@features/assets/stores/assetViewerStore';
import { useGenerationQueueStore } from '@features/generation/stores/generationQueueStore';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { OPERATION_METADATA, type OperationType } from '@/types/operations';
import type { GenerationContextSummary } from '@features/contextHub';

function resolveAssets(ctx: { data?: any }): AssetResponse[] {
  const selection = ctx.data?.selection;
  const asset = ctx.data?.asset;
  if (Array.isArray(selection) && selection.length > 0) {
    if (asset?.id && selection.some((item) => item?.id === asset.id)) {
      return selection as AssetResponse[];
    }
  }
  return asset ? [asset as AssetResponse] : [];
}

function resolveOperationType(
  candidate: string | undefined,
  fallback: OperationType,
): OperationType {
  if (candidate && candidate in OPERATION_METADATA) {
    return candidate as OperationType;
  }
  return fallback;
}

function toViewerAsset(asset: AssetResponse): ViewerAsset {
  return {
    id: asset.id,
    name: asset.description || asset.original_filename || `Asset ${asset.id}`,
    type: asset.media_type === 'video' ? 'video' : 'image',
    url: asset.thumbnail_url || asset.remote_url || asset.file_url || '',
    fullUrl: asset.remote_url || undefined,
    source: 'gallery',
    sourceGenerationId: asset.source_generation_id ?? undefined,
    metadata: {
      description: asset.description || undefined,
      tags: asset.tags,
      createdAt: asset.created_at,
      providerId: asset.provider_id,
      duration: asset.duration_sec || undefined,
    },
  };
}

const openAssetInViewerAction: MenuAction = {
  id: 'asset:open-viewer',
  label: 'Open in Viewer',
  icon: 'image',
  category: 'asset',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => resolveAssets(ctx).length > 0,
  execute: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;

    const viewerAsset = toViewerAsset(assets[0]);
    useAssetViewerStore.getState().openViewer(viewerAsset, [viewerAsset]);
  },
};

const sendToActiveGeneratorAction: MenuAction = {
  id: 'asset:send-to-generator',
  label: 'Send to Active Generator',
  icon: 'sparkles',
  category: 'generation',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => resolveAssets(ctx).length > 0,
  execute: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;

    const generationContext = ctx.capabilities?.generationContext as
      | GenerationContextSummary
      | null
      | undefined;

    if (generationContext?.id === 'assetViewer') {
      const viewerAsset = toViewerAsset(assets[0]);
      useAssetViewerStore.getState().openViewer(viewerAsset, [viewerAsset]);
      return;
    }

    const queueStore = useGenerationQueueStore.getState();
    const controlCenterStore = useControlCenterStore.getState();
    const selectionStore = useAssetSelectionStore.getState();
    const operationType = resolveOperationType(
      generationContext?.mode,
      controlCenterStore.operationType,
    );
    const forceMulti = assets.length > 1;

    assets.forEach((asset) => {
      queueStore.enqueueAsset({ asset, operationType, forceMulti });
    });

    const first = assets[0];
    selectionStore.selectAsset({
      id: first.id,
      key: `asset-${first.id}`,
      name: first.original_filename || first.description || `Asset ${first.id}`,
      type: first.media_type === 'video' ? 'video' : 'image',
      url: first.remote_url,
      source: 'gallery',
    });

    if (controlCenterStore.operationType !== operationType) {
      controlCenterStore.setOperationType(operationType);
    }
    controlCenterStore.setActiveModule('quickGenerate');
    controlCenterStore.setOpen(true);
  },
};

export const assetActions: MenuAction[] = [
  openAssetInViewerAction,
  sendToActiveGeneratorAction,
];
