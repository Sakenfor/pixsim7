import type { ViewerAsset } from '@features/assets';
import { useLocalFolderSettingsStore } from '@features/assets/stores/localFolderSettingsStore';

const LEGACY_LOCAL_PROVIDER_STORAGE_KEY = 'ps7_localFolders_providerId';

function readLegacyLocalProviderId(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_PROVIDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveViewerAssetProviderId(asset: ViewerAsset): string | null {
  const providerIdFromMetadata = asset.metadata?.providerId;
  if (providerIdFromMetadata) return providerIdFromMetadata;

  if (asset.source !== 'local') {
    return null;
  }

  const providerIdFromStore = useLocalFolderSettingsStore.getState().providerId;
  if (providerIdFromStore) return providerIdFromStore;

  return readLegacyLocalProviderId();
}

