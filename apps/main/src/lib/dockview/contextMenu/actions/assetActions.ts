/**
 * Asset Actions
 *
 * Context menu actions for asset cards.
 *
 * NOTE: This file uses the SNAPSHOT pattern (ctx.capabilities) for simple
 * value access. See types.ts for capability access pattern documentation.
 *
 * Actions leverage capabilities for context-aware behavior:
 * - generationContext: Active generation mode/widget
 * - assetSelection: Currently selected assets
 * - sceneContext: Active scene for "add to scene" actions
 */

import { resolveMediaType } from '@pixsim7/shared.assets-core';

import type { AssetModel } from '@features/assets';
import { toViewerAsset, toSelectedAsset } from '@features/assets';
import { useAssetDetailStore } from '@features/assets/stores/assetDetailStore';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { useAssetViewerStore } from '@features/assets/stores/assetViewerStore';
import {
  CAP_GENERATION_WIDGET,
  type GenerationWidgetContext,
  type AssetSelection,
  type GenerationContextSummary,
} from '@features/contextHub';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';


import { getAllProviders, getCapability, resolveProvider } from '../capabilityHelpers';
import type { MenuAction, MenuActionContext } from '../types';

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

  const mediaType = resolveMediaType(asset) ?? 'image';
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

function resolveGenerationWidget(ctx: MenuActionContext): GenerationWidgetContext | null {
  const provider = resolveProvider<GenerationWidgetContext>(ctx, CAP_GENERATION_WIDGET);
  return provider ? provider.getValue() : null;
}

function buildGeneratorMenuActions(ctx: MenuActionContext): MenuAction[] {
  const assets = resolveAssets(ctx);
  if (!assets.length) {
    return [
      {
        id: 'asset:send-to-generator:none',
        label: 'No assets available',
        availableIn: ['asset', 'asset-card'],
        disabled: () => true,
        execute: () => {},
      },
    ];
  }

  const generationContext = getCapability<GenerationContextSummary>(ctx, 'generationContext');
  const fallbackOperationType = resolveOperationType(generationContext?.mode, 'image_to_video');

  const providers = getAllProviders<GenerationWidgetContext>(ctx, CAP_GENERATION_WIDGET)
    .filter((entry) => entry.provider.exposeToContextMenu !== false);
  const activeProvider = resolveProvider<GenerationWidgetContext>(ctx, CAP_GENERATION_WIDGET);

  const actions: MenuAction[] = [
    {
      id: 'asset:send-to-generator:auto',
      label: 'Auto (nearest)',
      availableIn: ['asset', 'asset-card'],
      divider: providers.length > 0,
      disabled: () => (!activeProvider ? 'No generators available' : false),
      execute: () => {
        if (!activeProvider) return;
        const widget = activeProvider.getValue();
        if (!widget) return;
        const operationType = resolveOperationType(widget.operationType, fallbackOperationType);
        enqueueAssetsToWidget(widget, assets, operationType);
      },
    },
  ];

  if (providers.length === 0) {
    actions.push({
      id: 'asset:send-to-generator:empty',
      label: 'No generators available',
      availableIn: ['asset', 'asset-card'],
      disabled: () => true,
      execute: () => {},
    });
    return actions;
  }

  providers.forEach((entry, index) => {
    const provider = entry.provider;
    const baseLabel = provider.label || `Generator ${index + 1}`;
    const label =
      provider === activeProvider
        ? `${entry.scope} - ${baseLabel} (active)`
        : `${entry.scope} - ${baseLabel}`;

    actions.push({
      id: `asset:send-to-generator:${provider.id ?? index}`,
      label,
      availableIn: ['asset', 'asset-card'],
      disabled: () => (entry.available ? false : 'Unavailable'),
      execute: () => {
        if (!entry.available) return;
        const widget = provider.getValue();
        if (!widget) return;
        const operationType = resolveOperationType(widget.operationType, fallbackOperationType);
        enqueueAssetsToWidget(widget, assets, operationType);
      },
    });
  });

  return actions;
}

function enqueueAssetsToWidget(
  widget: GenerationWidgetContext,
  assets: AssetModel[],
  operationType: OperationType,
) {
  const forceMulti = assets.length > 1;
  if (widget.setOperationType && widget.operationType !== operationType) {
    widget.setOperationType(operationType);
  }
  if (widget.enqueueAssets) {
    widget.enqueueAssets({ assets, operationType, forceMulti });
  } else {
    if (forceMulti) {
      widget.setOperationInputMode(operationType, 'multi');
    }
    assets.forEach((asset) => {
      widget.enqueueAsset({ asset, operationType, forceMulti });
    });
  }
  widget.setOpen(true);
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

const sendToGeneratorAction: MenuAction = {
  id: 'asset:send-to-generator-list',
  label: 'Send to Generator',
  icon: 'sparkles',
  category: 'generation',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => resolveAssets(ctx).length > 0,
  children: (ctx) => buildGeneratorMenuActions(ctx),
  execute: () => {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Generation Actions - Context-aware operation shortcuts
// ─────────────────────────────────────────────────────────────────────────────

function createGenerationAction(
  id: string,
  label: string,
  icon: string,
  operationType: OperationType,
  mediaTypeFilter?: 'image' | 'video',
): MenuAction {
  return {
    id,
    label,
    icon,
    category: 'generation',
    availableIn: ['asset', 'asset-card'],
    visible: (ctx) => {
      const assets = resolveAssets(ctx);
      if (!assets.length) return false;
      if (mediaTypeFilter) {
        return assets.every((a) => a.mediaType === mediaTypeFilter);
      }
      return true;
    },
    disabled: (ctx) => (resolveGenerationWidget(ctx) ? false : 'No generator available'),
    execute: (ctx) => {
      const assets = resolveAssets(ctx);
      if (!assets.length) return;

      const generationWidget = resolveGenerationWidget(ctx);
      if (!generationWidget) return;
      enqueueAssetsToWidget(generationWidget, assets, operationType);
    },
  };
}

const imageToVideoAction = createGenerationAction(
  'asset:image-to-video',
  'Image → Video',
  'video',
  'image_to_video',
  'image',
);

const videoExtendAction = createGenerationAction(
  'asset:video-extend',
  'Extend Video',
  'fast-forward',
  'video_extend',
  'video',
);

const addToTransitionAction = createGenerationAction(
  'asset:add-to-transition',
  'Add to Transition',
  'git-merge',
  'video_transition',
);

// ─────────────────────────────────────────────────────────────────────────────
// Queue Management Actions
// ─────────────────────────────────────────────────────────────────────────────

const removeFromQueueAction: MenuAction = {
  id: 'asset:remove-from-queue',
  label: 'Remove from Queue',
  icon: 'x-circle',
  iconColor: 'text-orange-500',
  category: 'queue',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return false;
    const queueStore = useGenerationQueueStore.getState();
    // Check if any asset is in either queue
    return assets.some(
      (a) =>
        queueStore.mainQueue.some((q) => q.asset.id === a.id) ||
        queueStore.multiAssetQueue.some((q) => q.asset.id === a.id),
    );
  },
  execute: (ctx) => {
    const assets = resolveAssets(ctx);
    const queueStore = useGenerationQueueStore.getState();
    assets.forEach((asset) => {
      queueStore.removeFromQueue(asset.id, 'main');
      queueStore.removeFromQueue(asset.id, 'multi');
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Selection Actions - Multi-asset workflows
// ─────────────────────────────────────────────────────────────────────────────

const selectAssetAction: MenuAction = {
  id: 'asset:select',
  label: 'Select Asset',
  icon: 'check-square',
  category: 'selection',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => {
    const assets = resolveAssets(ctx);
    if (assets.length !== 1) return false;
    const selectionStore = useAssetSelectionStore.getState();
    return selectionStore.selectedAsset?.id !== assets[0].id;
  },
  execute: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;
    const selectionStore = useAssetSelectionStore.getState();
    selectionStore.selectAsset(toSelectedAsset(assets[0], 'gallery'));
  },
};

const compareWithSelectedAction: MenuAction = {
  id: 'asset:compare-with-selected',
  label: 'Compare with Selected',
  icon: 'columns',
  category: 'view',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => {
    const assets = resolveAssets(ctx);
    if (assets.length !== 1) return false;
    // Check if there's a different asset currently selected
    const assetSelection = getCapability<AssetSelection>(ctx, 'assetSelection');
    if (!assetSelection?.asset) return false;
    return assetSelection.asset.id !== assets[0].id;
  },
  execute: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;
    const assetSelection = getCapability<AssetSelection>(ctx, 'assetSelection');
    if (!assetSelection?.asset) return;

    // Open both in viewer for comparison
    const viewerAsset = toViewerAsset(assets[0]);
    const selectedAsset = toViewerAsset(assetSelection.asset as AssetModel);
    useAssetViewerStore.getState().openViewer(viewerAsset, [selectedAsset, viewerAsset]);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Clipboard Actions
// ─────────────────────────────────────────────────────────────────────────────

const copyAssetUrlAction: MenuAction = {
  id: 'asset:copy-url',
  label: 'Copy URL',
  icon: 'link',
  category: 'clipboard',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => {
    const assets = resolveAssets(ctx);
    return assets.length === 1 && !!(assets[0].remoteUrl || assets[0].fileUrl);
  },
  execute: async (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;
    const url = assets[0].remoteUrl || assets[0].fileUrl;
    if (url) {
      await navigator.clipboard.writeText(url);
    }
  },
};

const copyAssetIdAction: MenuAction = {
  id: 'asset:copy-id',
  label: 'Copy Asset ID',
  icon: 'hash',
  category: 'clipboard',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => resolveAssets(ctx).length === 1,
  execute: async (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;
    await navigator.clipboard.writeText(String(assets[0].id));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Info Actions
// ─────────────────────────────────────────────────────────────────────────────

const viewAssetDetailsAction: MenuAction = {
  id: 'asset:view-details',
  label: 'View Details',
  icon: 'info',
  category: 'info',
  availableIn: ['asset', 'asset-card'],
  visible: (ctx) => resolveAssets(ctx).length === 1,
  execute: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;
    // Use the asset detail modal via store
    useAssetDetailStore.getState().setDetailAssetId(assets[0].id);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Export All Actions
// ─────────────────────────────────────────────────────────────────────────────

export const assetActions: MenuAction[] = [
  // Primary actions
  openAssetInViewerAction,
  sendToGeneratorAction,
  // Generation shortcuts
  imageToVideoAction,
  videoExtendAction,
  addToTransitionAction,
  // Queue management
  removeFromQueueAction,
  // Selection & comparison
  selectAssetAction,
  compareWithSelectedAction,
  // Info
  viewAssetDetailsAction,
  // Clipboard
  copyAssetUrlAction,
  copyAssetIdAction,
];
