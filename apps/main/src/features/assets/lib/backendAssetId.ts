/**
 * Backend asset IDs are positive integers issued by the library backend.
 * Local-only assets carry a synthetic negative ID (see `hashStringToStableNegativeId`
 * in `localFolderMeta.ts`) which is meaningful only client-side. Passing such an
 * ID to a backend route (`/api/v1/assets/{id}/...`) will 404 silently.
 *
 * Use `isBackendAssetId` for control flow and `assertBackendAssetId` at backend
 * call entry points to fail fast instead of producing a confusing 404.
 */

export function isBackendAssetId(id: number | null | undefined): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

export function assertBackendAssetId(id: number | null | undefined, context?: string): asserts id is number {
  if (!isBackendAssetId(id)) {
    const where = context ? ` (${context})` : '';
    throw new Error(
      `Expected a backend asset id (positive integer) but received ${id}${where}. ` +
      `This usually means a local-only asset reached a backend-bound code path before being uploaded.`,
    );
  }
}
