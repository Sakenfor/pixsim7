import { enrichAsset, extractFrame, uploadAssetToProvider } from '@lib/api/assets';

import type { MediaCardActions } from '@/components/media/MediaCard';

import type { AssetModel } from '../models/asset';

import { assetEvents } from './assetEvents';
import { assertBackendAssetId } from './backendAssetId';
import { extractUploadError, notifyGalleryOfUpdatedAsset } from './uploadActions';

/** Refetch a single asset and patch it in the gallery via the event bus. */
async function refreshSingleAsset(assetId: number, fullRefresh: () => void): Promise<void> {
  try {
    await notifyGalleryOfUpdatedAsset(assetId);
  } catch {
    // Fallback to full refresh if single-asset fetch fails
    fullRefresh();
  }
}

interface BuildRemoteAssetActionsOptions {
  baseActions: MediaCardActions;
  providers: Array<{ id: string; name: string }>;
  filterProviderId: string | undefined;
  reuploadAsset: (asset: AssetModel, providerId: string) => Promise<void>;
  refresh: () => void;
}

export function buildRemoteAssetActions(
  asset: AssetModel,
  { baseActions, providers, filterProviderId, reuploadAsset, refresh }: BuildRemoteAssetActionsOptions,
): MediaCardActions {
  assertBackendAssetId(asset.id, `buildRemoteAssetActions for ${asset.providerAssetId ?? '<no providerAssetId>'}`);
  return {
    ...baseActions,
    onReuploadDone: () => refreshSingleAsset(asset.id, refresh),
    onReupload: async () => {
      let targetProviderId = filterProviderId;

      if (!targetProviderId) {
        if (!providers.length) {
          alert('No providers configured.');
          return;
        }
        const options = providers
          .map((p) => `${p.id} (${p.name})`)
          .join('\n');
        const defaultId = asset.providerId || providers[0].id;
        const input = window.prompt(
          `Upload to which provider?\n${options}`,
          defaultId,
        );
        if (!input) return;
        targetProviderId = input.trim();
      }

      await reuploadAsset(asset, targetProviderId);
    },
    onExtractLastFrameAndUpload: async () => {
      if (asset.mediaType !== 'video') return;
      const duration = asset.durationSec || 0;
      const timestamp = Math.max(0, duration - (1 / 30));
      try {
        const frameAsset = await extractFrame({
          video_asset_id: asset.id,
          timestamp,
        });
        const targetProvider = asset.providerId || 'pixverse';
        await uploadAssetToProvider(frameAsset.id, targetProvider);
        assetEvents.emitAssetCreated(frameAsset);
      } catch (err: unknown) {
        alert(`Failed to extract/upload last frame: ${extractUploadError(err, 'Unknown error')}`);
      }
    },
    onExtractFrame: async (_id: number, timestamp: number) => {
      if (asset.mediaType !== 'video') return;
      try {
        const frameAsset = await extractFrame({
          video_asset_id: asset.id,
          timestamp,
        });
        assetEvents.emitAssetCreated(frameAsset);
        const uploadStatuses = frameAsset.last_upload_status_by_provider;
        if (uploadStatuses && Object.values(uploadStatuses).some(s => s === 'error')) {
          alert('Frame extracted but upload to provider failed. The frame is saved locally — you can retry the upload later.');
        }
      } catch (err: unknown) {
        alert(`Failed to extract frame: ${extractUploadError(err, 'Unknown error')}`);
      }
    },
    onExtractLastFrame: async () => {
      if (asset.mediaType !== 'video') return;
      try {
        const frameAsset = await extractFrame({
          video_asset_id: asset.id,
          last_frame: true,
        });
        assetEvents.emitAssetCreated(frameAsset);
        const uploadStatuses = frameAsset.last_upload_status_by_provider;
        if (uploadStatuses && Object.values(uploadStatuses).some(s => s === 'error')) {
          alert('Frame extracted but upload to provider failed. The frame is saved locally — you can retry the upload later.');
        }
      } catch (err: unknown) {
        alert(`Failed to extract last frame: ${extractUploadError(err, 'Unknown error')}`);
      }
    },
    onEnrichMetadata: async () => {
      try {
        const result = await enrichAsset(asset.id);
        if (result.enriched) {
          await refreshSingleAsset(asset.id, refresh);
        } else {
          alert(result.message || 'No metadata to refresh');
        }
      } catch (err: unknown) {
        alert(`Failed to refresh metadata: ${extractUploadError(err, 'Unknown error')}`);
      }
    },
  };
}
