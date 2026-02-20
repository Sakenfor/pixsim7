import { enrichAsset, extractFrame, uploadAssetToProvider } from '@lib/api/assets';

import type { MediaCardActions } from '@/components/media/MediaCard';

import type { AssetModel } from '../models/asset';

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
  return {
    ...baseActions,
    onReuploadDone: () => refresh(),
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
        refresh();
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
        alert(`Failed to extract/upload last frame: ${detail}`);
      }
    },
    onExtractFrame: async (_id: number, timestamp: number) => {
      if (asset.mediaType !== 'video') return;
      try {
        const frameAsset = await extractFrame({
          video_asset_id: asset.id,
          timestamp,
        });
        refresh();
        const uploadStatuses = frameAsset.last_upload_status_by_provider;
        if (uploadStatuses && Object.values(uploadStatuses).some(s => s === 'error')) {
          alert('Frame extracted but upload to provider failed. The frame is saved locally — you can retry the upload later.');
        }
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
        alert(`Failed to extract frame: ${detail}`);
      }
    },
    onExtractLastFrame: async () => {
      if (asset.mediaType !== 'video') return;
      try {
        const frameAsset = await extractFrame({
          video_asset_id: asset.id,
          last_frame: true,
        });
        refresh();
        const uploadStatuses = frameAsset.last_upload_status_by_provider;
        if (uploadStatuses && Object.values(uploadStatuses).some(s => s === 'error')) {
          alert('Frame extracted but upload to provider failed. The frame is saved locally — you can retry the upload later.');
        }
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
        alert(`Failed to extract last frame: ${detail}`);
      }
    },
    onEnrichMetadata: async () => {
      try {
        const result = await enrichAsset(asset.id);
        if (result.enriched) {
          refresh();
        } else {
          alert(result.message || 'No metadata to refresh');
        }
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
        alert(`Failed to refresh metadata: ${detail}`);
      }
    },
  };
}
