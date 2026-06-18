import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Local stack mocks ───────────────────────────────────────────────
// Keep the adapter's heavy imports inert; only the store state is controllable.
const localMocks = vi.hoisted(() => ({
  state: { assets: {} as Record<string, { key: string; lastModified?: number }> },
  subscribe: vi.fn((listener: () => void) => {
    void listener;
    return () => {};
  }),
}));

vi.mock('../../stores/localFoldersStore', () => ({
  useLocalFolders: {
    getState: () => localMocks.state,
    subscribe: localMocks.subscribe,
  },
}));
vi.mock('../../stores/localFolderSettingsStore', () => ({
  useLocalFolderSettingsStore: { getState: () => ({ hashChunkSize: 4, providerId: undefined }) },
}));
vi.mock('../../lib/hashWorkerManager', () => ({ setHashWorkerPoolSize: vi.fn() }));
vi.mock('../../lib/localHashing', () => ({
  checkHashesAgainstBackend: vi.fn(async () => []),
  ensureLocalAssetSha256: vi.fn(),
  hasValidStoredHash: vi.fn(() => false),
  scheduleAssetsForHashing: vi.fn((xs: unknown[]) => xs),
}));
vi.mock('../../lib/uploadActions', () => ({ extractUploadError: (e: unknown) => String(e) }));
vi.mock('@lib/api/upload', () => ({ uploadAsset: vi.fn() }));

// ── Remote stack mocks ──────────────────────────────────────────────
const remoteMocks = vi.hoisted(() => ({
  listAssets: vi.fn(),
  getAsset: vi.fn(),
}));
vi.mock('@lib/api/assets', () => ({
  listAssets: (...args: unknown[]) => remoteMocks.listAssets(...args),
  getAsset: (...args: unknown[]) => remoteMocks.getAsset(...args),
}));
vi.mock('@lib/api/client', () => ({ BACKEND_BASE: '' }));
vi.mock('@lib/auth', () => ({ authService: { getStoredToken: () => null } }));
vi.mock('../../models/asset', () => ({
  fromAssetResponse: (r: unknown) => r,
  fromAssetResponses: (r: unknown[]) => r,
  getAssetDisplayUrls: () => ({ mainUrl: '', previewUrl: '', thumbnailUrl: '' }),
}));
vi.mock('../../lib/searchParams', () => ({
  buildAssetSearchRequest: (filters: unknown, opts: unknown) => ({ filters, opts }),
}));

import { createLocalFolderSource } from '../localFolderSource';
import { createRemoteAssetSource } from '../remoteAssetSource';

describe('AssetSource seam parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMocks.state.assets = {};
  });

  describe('LocalFolderSource (client-loaded)', () => {
    it('declares client-loaded capabilities and the matching read path', () => {
      const local = createLocalFolderSource();
      expect(local.identity.typeId).toBe('local-fs');
      expect(local.capabilities).toEqual({
        fetchMode: 'client-loaded',
        canIngest: true,
        canHash: true,
        hasLibraryStatus: true,
        hasFolders: true,
      });
      // client-loaded read path present, server-paged absent
      expect(typeof local.getAll).toBe('function');
      expect(typeof local.subscribe).toBe('function');
      expect(local.list).toBeUndefined();
      // gated capabilities present because their flags are true
      expect(typeof local.ingest).toBe('function');
      expect(typeof local.hash).toBe('function');
      expect(typeof local.libraryStatus).toBe('function');
      expect(local.lifecycle.folders).toBeDefined();
    });

    it('getAll() returns a stable reference until the asset record mutates, newest first', () => {
      const local = createLocalFolderSource();
      localMocks.state.assets = {
        a: { key: 'a', lastModified: 2 },
        b: { key: 'b', lastModified: 1 },
      };

      const first = local.getAll!();
      const second = local.getAll!();
      expect(second).toBe(first); // referentially stable for useSyncExternalStore
      expect((first as Array<{ key: string }>).map((x) => x.key)).toEqual(['a', 'b']);

      // New record reference → new snapshot
      localMocks.state.assets = { c: { key: 'c', lastModified: 5 } };
      const third = local.getAll!();
      expect(third).not.toBe(first);
      expect((third as Array<{ key: string }>).map((x) => x.key)).toEqual(['c']);
    });
  });

  describe('RemoteAssetSource (server-paged)', () => {
    it('declares server-paged capabilities with library-only capability gating', () => {
      const remote = createRemoteAssetSource();
      expect(remote.identity.typeId).toBe('remote-gallery');
      expect(remote.capabilities).toEqual({
        fetchMode: 'server-paged',
        canIngest: false,
        canHash: false,
        hasLibraryStatus: false,
        hasFolders: false,
      });
      // server-paged read path present, client-loaded absent
      expect(typeof remote.list).toBe('function');
      expect(remote.getAll).toBeUndefined();
      expect(remote.subscribe).toBeUndefined();
      // gated capabilities absent because their flags are false
      expect(remote.ingest).toBeUndefined();
      expect(remote.hash).toBeUndefined();
      expect(remote.libraryStatus).toBeUndefined();
      expect(remote.lifecycle.folders).toBeUndefined();
    });

    it('list() maps a backend page into the AssetPage shape', async () => {
      const remote = createRemoteAssetSource();
      remoteMocks.listAssets.mockResolvedValue({ assets: [{ id: 1 }, { id: 2 }], next_cursor: 'c2' });

      const page = await remote.list!({ filters: { media_type: 'image' }, limit: 2 });
      expect(remoteMocks.listAssets).toHaveBeenCalledTimes(1);
      expect(page.assets).toEqual([{ id: 1 }, { id: 2 }]);
      expect(page.nextCursor).toBe('c2');
      expect(page.hasMore).toBe(true);
    });

    it('list() reports no more pages when the cursor is null', async () => {
      const remote = createRemoteAssetSource();
      remoteMocks.listAssets.mockResolvedValue({ assets: [], next_cursor: null });

      const page = await remote.list!({});
      expect(page.assets).toEqual([]);
      expect(page.nextCursor).toBeNull();
      expect(page.hasMore).toBe(false);
    });
  });
});
