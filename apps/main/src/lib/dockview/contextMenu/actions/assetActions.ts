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

import { resolveMediaType } from '@pixsim7/shared.assets.core';
import { useToastStore } from '@pixsim7/shared.ui';

import type { AssetModel } from '@features/assets';
import { assetEvents, getAssetDisplayUrls, toViewerAsset, toSelectedAsset } from '@features/assets';
import { useAssetDetailStore } from '@features/assets/stores/assetDetailStore';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { useAssetViewerStore } from '@features/assets/stores/assetViewerStore';
import {
  CAP_ASSET,
  CAP_GENERATION_WIDGET,
  type GenerationWidgetContext,
  type AssetSelection,
  type GenerationContextSummary,
} from '@features/contextHub';
import { useGenerationInputStore } from '@features/generation';
import { useSettingsUiStore } from '@features/settings/stores/settingsUiStore';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { BACKEND_BASE } from '@/lib/api/client';
import { authService } from '@/lib/auth';
import { ensureBackendAbsolute } from '@/lib/media/backendUrl';
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
  const asset =
    ctx.data?.asset ??
    ctx.data?.['viewer-asset'] ??
    ctx.data?.viewerAsset ??
    (ctx.data?.id ? ctx.data : null);
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

function notify(type: 'success' | 'error' | 'warning' | 'info', message: string) {
  useToastStore.getState().addToast({
    type,
    message,
    duration: 4000,
  });
}

function resolveCopyUrl(asset: AssetModel): string | undefined {
  const { mainUrl, previewUrl, thumbnailUrl } = getAssetDisplayUrls(asset);
  const candidate = mainUrl || previewUrl || thumbnailUrl || asset.fileUrl || asset.remoteUrl;
  if (!candidate) return undefined;
  return ensureBackendAbsolute(candidate, BACKEND_BASE) ?? candidate;
}

function getBackendBase(): string {
  return BACKEND_BASE.replace(/\/$/, '');
}

async function postWithAuth(path: string): Promise<Response> {
  const token = authService.getStoredToken();
  const res = await fetch(`${getBackendBase()}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText || `HTTP ${res.status}`);
  }
  return res;
}

async function triggerIngestionForAssets(
  assets: AssetModel[],
  query: string,
  label: string,
): Promise<void> {
  if (!assets.length) return;
  const eligible = assets
    .map((asset) => Number(asset.id))
    .filter((id) => Number.isFinite(id));
  if (!eligible.length) {
    notify('warning', `${label}: no gallery assets available for this action.`);
    return;
  }
  const results = await Promise.allSettled(
    eligible.map((id) => postWithAuth(`/api/v1/media/ingestion/trigger/${id}${query}`)),
  );
  const successCount = results.filter((result) => result.status === 'fulfilled').length;
  const errorCount = results.length - successCount;
  if (successCount > 0) {
    notify('success', `${label}: queued for ${successCount} asset${successCount === 1 ? '' : 's'}.`);
  }
  if (errorCount > 0) {
    notify('error', `${label}: ${errorCount} failed. Check auth or backend logs.`);
  }
}

async function backfillThumbnails(limit = 100): Promise<void> {
  const res = await postWithAuth(
    `/api/v1/assets_maintenance/backfill-thumbnails?limit=${limit}&include_missing_keys=true`,
  );
  const data = await res.json().catch(() => null);
  if (data?.generated !== undefined) {
    notify(
      'success',
      `Backfill complete: generated ${data.generated} (processed ${data.processed}, errors ${data.errors}).`,
    );
  } else {
    notify('success', 'Thumbnail backfill queued.');
  }
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
        requiredCapabilities: [CAP_ASSET],
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
      requiredCapabilities: [CAP_ASSET],
      divider: providers.length > 0,
      disabled: () => (!activeProvider ? 'No generators available' : false),
      execute: () => {
        if (!activeProvider) return;
        const widget = activeProvider.getValue();
        if (!widget) return;
        const operationType = resolveOperationType(widget.operationType, fallbackOperationType);
        addInputsToWidget(widget, assets, operationType);
      },
    },
  ];

  if (providers.length === 0) {
    actions.push({
      id: 'asset:send-to-generator:empty',
      label: 'No generators available',
      requiredCapabilities: [CAP_ASSET],
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
      requiredCapabilities: [CAP_ASSET],
      disabled: () => (entry.available ? false : 'Unavailable'),
      execute: () => {
        if (!entry.available) return;
        const widget = provider.getValue();
        if (!widget) return;
        const operationType = resolveOperationType(widget.operationType, fallbackOperationType);
        addInputsToWidget(widget, assets, operationType);
      },
    });
  });

  return actions;
}

function addInputsToWidget(
  widget: GenerationWidgetContext,
  assets: AssetModel[],
  operationType: OperationType,
) {
  if (widget.setOperationType && widget.operationType !== operationType) {
    widget.setOperationType(operationType);
  }
  if (widget.addInputs) {
    widget.addInputs({ assets, operationType });
  } else if (widget.addInput) {
    assets.forEach((asset) => {
      widget.addInput({ asset, operationType });
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
  // Note: No requiredCapabilities - we don't want this in viewer context
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
  // Require both asset and generation widget - only show where generators are available
  requiredCapabilities: [CAP_ASSET, CAP_GENERATION_WIDGET],
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
    // Require both asset and generation widget - only show where both are available
    requiredCapabilities: [CAP_ASSET, CAP_GENERATION_WIDGET],
    visible: (ctx) => {
      const assets = resolveAssets(ctx);
      if (!assets.length) return false;
      if (mediaTypeFilter) {
        return assets.every((a) => a.mediaType === mediaTypeFilter);
      }
      return true;
    },
    execute: (ctx) => {
      const assets = resolveAssets(ctx);
      if (!assets.length) return;

      const generationWidget = resolveGenerationWidget(ctx);
      if (!generationWidget) return;
      addInputsToWidget(generationWidget, assets, operationType);
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
  label: 'Remove from Inputs',
  icon: 'x-circle',
  iconColor: 'text-orange-500',
  category: 'queue',
  requiredCapabilities: [CAP_ASSET],
  visible: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return false;
    const inputStore = useGenerationInputStore.getState();
    const allInputs = inputStore.getAllInputs();
    return assets.some((a) => allInputs.some((item) => item.asset.id === a.id));
  },
  execute: (ctx) => {
    const assets = resolveAssets(ctx);
    const inputStore = useGenerationInputStore.getState();
    assets.forEach((asset) => {
      inputStore.removeAssetEverywhere(asset.id);
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
  requiredCapabilities: [CAP_ASSET],
  visible: (ctx) => {
    const assets = resolveAssets(ctx);
    if (assets.length !== 1) return false;
    const selectionStore = useAssetSelectionStore.getState();
    return !selectionStore.isSelected(assets[0].id);
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
  category: 'selection',
  requiredCapabilities: [CAP_ASSET],
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
    const selectedAsset = assetSelection.asset;
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
  requiredCapabilities: [CAP_ASSET],
  visible: (ctx) => {
    const assets = resolveAssets(ctx);
    return assets.length === 1 && !!resolveCopyUrl(assets[0]);
  },
  execute: async (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;
    const url = resolveCopyUrl(assets[0]);
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
  requiredCapabilities: [CAP_ASSET],
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
  category: 'asset',
  requiredCapabilities: [CAP_ASSET],
  visible: (ctx) => resolveAssets(ctx).length === 1,
  execute: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return;
    // Use the asset detail modal via store
    useAssetDetailStore.getState().setDetailAssetId(assets[0].id);
  },
};

const debugFixAction: MenuAction = {
  id: 'asset:debug-fix-menu',
  label: 'Debug / Fix',
  icon: 'wrench',
  category: 'debug',
  requiredCapabilities: [CAP_ASSET],
  visible: (ctx) => resolveAssets(ctx).length > 0,
  children: (ctx) => {
    const assets = resolveAssets(ctx);
    const count = assets.length;
    const labelSuffix = count === 1 ? '' : ` (${count} assets)`;
    return [
      {
        id: 'asset:debug:ingest',
        label: `Start ingestion${labelSuffix}`,
        icon: 'play',
        requiredCapabilities: [CAP_ASSET],
        execute: () => triggerIngestionForAssets(assets, '', 'Ingestion'),
      },
      {
        id: 'asset:debug:regen-thumbs',
        label: `Regenerate thumbnails${labelSuffix}`,
        icon: 'image',
        requiredCapabilities: [CAP_ASSET],
        execute: () => triggerIngestionForAssets(assets, '?regenerate_thumbnails=true', 'Thumbnail rebuild'),
      },
      {
        id: 'asset:debug:retry-thumbs',
        label: 'Retry thumbnail loads (UI)',
        icon: 'refresh-cw',
        requiredCapabilities: [CAP_ASSET],
        execute: () => {
          assetEvents.emitRetryAllThumbnails();
          notify('info', 'Retrying thumbnail loads in the UI.');
        },
      },
      {
        id: 'asset:debug:backfill-thumbs',
        label: 'Backfill thumbnails (bulk)',
        icon: 'layers',
        requiredCapabilities: [CAP_ASSET],
        execute: () => backfillThumbnails(),
      },
      {
        id: 'asset:debug:open-library-settings',
        label: 'Open Library Settings',
        icon: 'settings',
        requiredCapabilities: [CAP_ASSET],
        execute: () => {
          useSettingsUiStore.getState().setActiveTabId('library');
          useWorkspaceStore.getState().openFloatingPanel('settings', { width: 900, height: 700 });
        },
      },
    ];
  },
  execute: () => {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Composite Submenus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate submenu - groups all generation shortcuts, send-to-generator,
 * and queue management into a single submenu.
 */
const generateSubmenuAction: MenuAction = {
  id: 'asset:generate',
  label: 'Generate',
  icon: 'sparkles',
  category: 'generation',
  hideWhenEmpty: true,
  requiredCapabilities: [CAP_ASSET],
  visible: (ctx) => {
    const assets = resolveAssets(ctx);
    if (!assets.length) return false;
    const hasGenWidget = ctx.capabilities?.[CAP_GENERATION_WIDGET] !== undefined;
    return hasGenWidget || removeFromQueueAction.visible?.(ctx) === true;
  },
  children: (ctx) => {
    const items: MenuAction[] = [];
    const hasGenWidget = ctx.capabilities?.[CAP_GENERATION_WIDGET] !== undefined;

    // Send to Generator (nested submenu)
    if (hasGenWidget && sendToGeneratorAction.visible?.(ctx) !== false) {
      items.push({ ...sendToGeneratorAction, category: undefined, requiredCapabilities: undefined });
    }

    // Generation shortcuts (Image→Video, Extend, Transition)
    const shortcuts = [imageToVideoAction, videoExtendAction, addToTransitionAction]
      .filter(a => hasGenWidget && a.visible?.(ctx) !== false)
      .map(a => ({ ...a, category: undefined, requiredCapabilities: undefined }));
    if (shortcuts.length > 0) {
      if (items.length > 0) {
        items[items.length - 1] = { ...items[items.length - 1], divider: true, sectionLabel: 'Shortcuts' };
      }
      items.push(...shortcuts);
    }

    // Remove from Inputs
    if (removeFromQueueAction.visible?.(ctx) !== false) {
      if (items.length > 0) {
        items[items.length - 1] = { ...items[items.length - 1], divider: true, sectionLabel: 'Queue' };
      }
      items.push({ ...removeFromQueueAction, category: undefined, requiredCapabilities: undefined });
    }

    if (items.length === 0) {
      return [{
        id: 'asset:generate:empty',
        label: 'No generation actions',
        disabled: () => true,
        execute: () => {},
      }];
    }

    return items;
  },
  execute: () => {},
};

/**
 * Copy submenu - groups clipboard actions.
 */
const copySubmenuAction: MenuAction = {
  id: 'asset:copy',
  label: 'Copy',
  icon: 'copy',
  category: 'clipboard',
  hideWhenEmpty: true,
  requiredCapabilities: [CAP_ASSET],
  visible: (ctx) => resolveAssets(ctx).length === 1,
  children: (ctx) => {
    const items: MenuAction[] = [];
    if (copyAssetUrlAction.visible?.(ctx) !== false) {
      items.push({ ...copyAssetUrlAction, category: undefined, requiredCapabilities: undefined });
    }
    if (copyAssetIdAction.visible?.(ctx) !== false) {
      items.push({ ...copyAssetIdAction, category: undefined, requiredCapabilities: undefined });
    }
    return items;
  },
  execute: () => {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Export All Actions
// ─────────────────────────────────────────────────────────────────────────────

export const assetActions: MenuAction[] = [
  // Primary actions
  openAssetInViewerAction,
  viewAssetDetailsAction,
  // Selection & comparison
  selectAssetAction,
  compareWithSelectedAction,
  // Generate submenu
  generateSubmenuAction,
  // Copy submenu
  copySubmenuAction,
  // Debug & fixes
  debugFixAction,
];
