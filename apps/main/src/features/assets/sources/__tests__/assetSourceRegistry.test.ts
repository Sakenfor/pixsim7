import { describe, it, expect, vi } from 'vitest';

// Keep the local adapter's heavy imports inert (store, hashing workers, upload).
vi.mock('../../stores/localFoldersStore', () => ({
  useLocalFolders: { getState: () => ({ assets: {} }), subscribe: () => () => {} },
}));
vi.mock('../../stores/localFolderSettingsStore', () => ({
  useLocalFolderSettingsStore: { getState: () => ({ hashChunkSize: 4, providerId: undefined }) },
}));
vi.mock('../../lib/hashWorkerManager', () => ({ setHashWorkerPoolSize: () => {} }));
vi.mock('../../lib/localHashing', () => ({
  checkHashesAgainstBackend: async () => [],
  ensureLocalAssetSha256: () => {},
  hasValidStoredHash: () => false,
  scheduleAssetsForHashing: (xs: unknown[]) => xs,
}));
vi.mock('../../lib/uploadActions', () => ({ extractUploadError: (e: unknown) => String(e) }));
vi.mock('@lib/api/upload', () => ({ uploadAsset: () => {} }));
vi.mock('@lib/api/assets', () => ({ listAssets: () => {}, getAsset: () => {} }));
vi.mock('@lib/api/client', () => ({ BACKEND_BASE: '' }));
vi.mock('@lib/auth', () => ({ authService: { getStoredToken: () => null } }));
vi.mock('../../models/asset', () => ({
  fromAssetResponse: (r: unknown) => r,
  fromAssetResponses: (r: unknown[]) => r,
  getAssetDisplayUrls: () => ({ mainUrl: '', previewUrl: '', thumbnailUrl: '' }),
}));
vi.mock('../../lib/searchParams', () => ({ buildAssetSearchRequest: (f: unknown) => f }));

import type { AssetSource } from '../assetSource';
import {
  getAllAssetSourceAdapters,
  getAssetSourceAdapter,
  registerAssetSourceAdapter,
} from '../assetSourceRegistry';

describe('assetSourceRegistry', () => {
  it('seeds the built-in local + remote adapters', () => {
    const typeIds = getAllAssetSourceAdapters().map((s) => s.identity.typeId);
    expect(typeIds).toContain('local-fs');
    expect(typeIds).toContain('remote-gallery');

    expect(getAssetSourceAdapter('local-fs')?.capabilities.fetchMode).toBe('client-loaded');
    expect(getAssetSourceAdapter('remote-gallery')?.capabilities.fetchMode).toBe('server-paged');
  });

  it('registers and resolves a custom adapter, replacing by typeId', () => {
    const fake: AssetSource = {
      identity: { typeId: 'fake', instanceId: 'fake', label: 'Fake', kind: 'cloud', icon: 'cloud' },
      capabilities: {
        fetchMode: 'server-paged',
        canIngest: false,
        canHash: false,
        hasLibraryStatus: false,
        hasFolders: false,
      },
      get: () => undefined,
      file: async () => undefined,
      lifecycle: { load: () => {}, refresh: async () => {} },
    };

    registerAssetSourceAdapter(fake);
    expect(getAssetSourceAdapter('fake')).toBe(fake);

    const replacement: AssetSource = { ...fake, identity: { ...fake.identity, label: 'Fake 2' } };
    registerAssetSourceAdapter(replacement);
    expect(getAssetSourceAdapter('fake')?.identity.label).toBe('Fake 2');
  });

  it('returns undefined for unknown type ids', () => {
    expect(getAssetSourceAdapter('does-not-exist')).toBeUndefined();
  });
});
