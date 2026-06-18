/**
 * RemoteAssetSource — `AssetSource` adapter over the backend asset query API.
 *
 * The server-paged counterpart to LocalFolderSource. It grounds the
 * `fetchMode: 'server-paged'` half of the seam against a real implementation
 * (`listAssets`/`getAsset`), proving the `AssetSource` contract spans both the
 * backend library and local folders — the same shape MinIO/remote-root browsing
 * will plug into.
 *
 * Backend assets ARE the library, so the ingest/hash/libraryStatus/folder
 * capabilities are all off: there is nothing to bring in, hash, or check
 * membership for. `key` is the stringified backend asset id.
 */

import { listAssets, getAsset } from '@lib/api/assets';
import { BACKEND_BASE } from '@lib/api/client';
import { authService } from '@lib/auth';

import { buildAssetSearchRequest } from '../lib/searchParams';
import {
  fromAssetResponse,
  fromAssetResponses,
  getAssetDisplayUrls,
} from '../models/asset';

import type { AssetListQuery, AssetPage, AssetSource, AssetSourceLifecycle } from './assetSource';

const REMOTE_TYPE_ID = 'remote-gallery';

function resolveBackendBase(): string {
  const base = BACKEND_BASE;
  return base.trim().toLowerCase() === 'relative' ? '' : base.replace(/\/$/, '');
}

async function listPage(query: AssetListQuery): Promise<AssetPage> {
  const request = buildAssetSearchRequest(query.filters ?? {}, {
    limit: query.limit,
    offset: query.offset,
    cursor: query.cursor,
  });
  const data = await listAssets(request);
  return {
    assets: fromAssetResponses(data.assets),
    nextCursor: data.next_cursor ?? null,
    hasMore: Boolean(data.next_cursor),
  };
}

const lifecycle: AssetSourceLifecycle = {
  // The backend source is always "mounted"; there is no client-side hydration.
  load: () => {},
  // Server-paged reads are pull-on-demand via list(); a refresh is just the
  // caller re-issuing the first page, so there is nothing to imperatively do.
  refresh: async () => {},
};

/**
 * Build a RemoteAssetSource adapter. Factory parity with LocalFolderSource; one
 * remote-gallery instance for now.
 */
export function createRemoteAssetSource(instanceId: string = REMOTE_TYPE_ID): AssetSource {
  return {
    identity: {
      typeId: REMOTE_TYPE_ID,
      instanceId,
      label: 'Remote Gallery',
      kind: 'remote',
      icon: 'globe',
    },
    capabilities: {
      fetchMode: 'server-paged',
      canIngest: false,
      canHash: false,
      hasLibraryStatus: false,
      hasFolders: false,
    },
    list: listPage,
    get: async (key) => {
      const id = Number(key);
      if (!Number.isFinite(id)) return undefined;
      const response = await getAsset(id);
      return fromAssetResponse(response);
    },
    file: async (key) => {
      const id = Number(key);
      if (!Number.isFinite(id)) return undefined;
      const response = await getAsset(id);
      const model = fromAssetResponse(response);
      const { mainUrl, previewUrl, thumbnailUrl } = getAssetDisplayUrls(model);
      const relative = mainUrl || previewUrl || thumbnailUrl || `/api/v1/assets/${id}/file`;
      // Resolve backend-relative paths against the API base; absolute provider
      // URLs (http...) pass through unchanged.
      const url = /^https?:\/\//i.test(relative) ? relative : `${resolveBackendBase()}${relative}`;
      const token = authService.getStoredToken();
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return undefined;
      return await res.blob();
    },
    lifecycle,
  };
}

/** Default remote-gallery source instance. */
export const remoteAssetSource: AssetSource = createRemoteAssetSource();
