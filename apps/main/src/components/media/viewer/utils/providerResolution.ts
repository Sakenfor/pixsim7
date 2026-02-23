import type { ViewerAsset } from '@features/assets';
import { useLocalFolderSettingsStore } from '@features/assets/stores/localFolderSettingsStore';

const LEGACY_LOCAL_PROVIDER_STORAGE_KEY = 'ps7_localFolders_providerId';

function normalizeUploadProviderId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Local/library are backend-only save targets, not provider IDs.
  if (trimmed === 'local' || trimmed === 'library') return null;
  return trimmed;
}

function readLegacyLocalProviderId(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_PROVIDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeUploadProviderId(parsed);
  } catch {
    return null;
  }
}

export function resolveViewerAssetProviderId(asset: ViewerAsset): string | null {
  const providerIdFromMetadata = normalizeUploadProviderId(asset.metadata?.providerId);
  if (providerIdFromMetadata) return providerIdFromMetadata;

  if (asset.source !== 'local') {
    return null;
  }

  const providerIdFromStore = normalizeUploadProviderId(
    useLocalFolderSettingsStore.getState().providerId,
  );
  if (providerIdFromStore) return providerIdFromStore;

  return readLegacyLocalProviderId();
}
