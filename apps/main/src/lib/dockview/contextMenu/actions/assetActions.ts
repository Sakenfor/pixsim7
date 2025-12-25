/**
 * Asset Actions
 *
 * Context menu actions for asset cards.
 *
 * NOTE: This file uses the SNAPSHOT pattern (ctx.capabilities) for simple
 * value access. See types.ts for capability access pattern documentation.
 */

import type { MenuAction } from '../types';
import type { AssetModel } from '@features/assets';
import { toViewerAsset, toSelectedAsset } from '@features/assets';
import { resolveAssetMediaType } from '@features/assets/lib/assetMediaType';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { useAssetViewerStore } from '@features/assets/stores/assetViewerStore';
import { useGenerationQueueStore } from '@features/generation/stores/generationQueueStore';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { OPERATION_METADATA, type OperationType } from '@/types/operations';
import type { GenerationContextSummary } from '@features/contextHub';
import { getCapability } from '../capabilityHelpers';

type AssetActionInput = {
  id: number;
  mediaType?: string;
  media_type?: string;
  providerId?: string;
  provider_id?: string;
  providerAssetId?: string;
  provider_asset_id?: string;
  previewUrl?: string;
  preview_url?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  remoteUrl?: string;
  remote_url?: string;
  fileUrl?: string;
  file_url?: string;
  description?: string | null;
  createdAt?: string;
  created_at?: string;
  providerStatus?: AssetModel['providerStatus'];
  provider_status?: AssetModel['providerStatus'];
  syncStatus?: AssetModel['syncStatus'];
  sync_status?: AssetModel['syncStatus'];
  sourceGenerationId?: number | null;
  source_generation_id?: number | null;
  width?: number | null;
  height?: number | null;
  tags?: unknown;
} & Partial<AssetModel>;

function normalizeAsset(asset: AssetActionInput): AssetModel | null {
  if (!asset || typeof asset.id !== 'number') {
    return null;
  }

  if (asset.mediaType) {
    return asset as AssetModel;
  }

  const mediaType = resolveAssetMediaType(asset) ?? 'image';
  const rawTags = asset.tags;
  const tags =
    Array.isArray(rawTags) && rawTags.length > 0 && typeof rawTags[0] === 'object'
      ? (rawTags as AssetModel['tags'])
      : undefined;

  return {
    id: asset.id,
    createdAt: asset.createdAt || asset.created_at || new Date().toISOString(),
    description: asset.description ?? null,
    durationSec: (asset as any).durationSec ?? (asset as any).duration_sec ?? null,
    fileSizeBytes: (asset as any).fileSizeBytes ?? (asset as any).file_size_bytes ?? null,
    fileUrl: asset.fileUrl ?? asset.file_url ?? null,
    height: asset.height ?? null,
    isArchived: (asset as any).isArchived ?? (asset as any).is_archived ?? false,
    lastUploadStatusByProvider:
      (asset as any).lastUploadStatusByProvider ??
      (asset as any).last_upload_status_by_provider ??
      null,
    localPath: (asset as any).localPath ?? (asset as any).local_path ?? null,
    mediaType,
    mimeType: (asset as any).mimeType ?? (asset as any).mime_type ?? null,
    previewKey: (asset as any).previewKey ?? (asset as any).preview_key ?? null,
    previewUrl: asset.previewUrl ?? asset.preview_url ?? null,
    providerAssetId: asset.providerAssetId ?? asset.provider_asset_id ?? String(asset.id),
    providerId: asset.providerId ?? asset.provider_id ?? 'unknown',
    providerStatus: asset.providerStatus ?? asset.provider_status ?? null,
    remoteUrl: asset.remoteUrl ?? asset.remote_url ?? null,
    sourceGenerationId: asset.sourceGenerationId ?? asset.source_generation_id ?? null,
    storedKey: (asset as any).storedKey ?? (asset as any).stored_key ?? null,
    syncStatus: asset.syncStatus ?? asset.sync_status ?? 'remote',
    tags,
    thumbnailKey: (asset as any).thumbnailKey ?? (asset as any).thumbnail_key ?? null,
    thumbnailUrl: asset.thumbnailUrl ?? asset.thumbnail_url ?? null,
    userId: (asset as any).userId ?? (asset as any).user_id ?? 0,
    width: asset.width ?? null,
  };
}

function resolveAssets(ctx: { data?: any }): AssetModel[] {
  const selection = ctx.data?.selection;
  const asset = ctx.data?.asset;
  if (Array.isArray(selection) && selection.length > 0) {
    if (asset?.id && selection.some((item) => item?.id === asset.id)) {
      return selection
        .map((item) => normalizeAsset(item as AssetActionInput))
        .filter((item): item is AssetModel => !!item);
    }
  }
  const normalized = asset ? normalizeAsset(asset as AssetActionInput) : null;
  return normalized ? [normalized] : [];
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

    const generationContext = getCapability<GenerationContextSummary>(ctx, 'generationContext');

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
    selectionStore.selectAsset(toSelectedAsset(first, 'gallery'));

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
