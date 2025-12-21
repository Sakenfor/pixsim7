/**
 * Asset Detail Modal
 *
 * Shared modal component for displaying asset details.
 * Subscribes to the shared assetDetailStore and displays asset JSON.
 */
import { Modal } from '@pixsim7/shared.ui';
import { useAssetDetailStore } from '../stores/assetDetailStore';
import { useAsset } from '../hooks/useAsset';

/**
 * Asset Detail Modal - subscribes directly to the shared store
 *
 * Include this component in any route/surface that needs to show asset details.
 * The modal is triggered by calling `useAssetDetailStore.getState().setDetailAssetId(id)`.
 */
export function AssetDetailModal() {
  const detailAssetId = useAssetDetailStore((s) => s.detailAssetId);
  const closeDetail = useAssetDetailStore((s) => s.closeDetail);
  const { asset: detailAsset, loading: detailLoading, error: detailError } = useAsset(detailAssetId);

  if (detailAssetId === null) return null;

  return (
    <Modal
      isOpen={true}
      onClose={closeDetail}
      title={`Asset #${detailAssetId}`}
      size="lg"
    >
      <div className="space-y-3 max-h-[70vh] overflow-auto text-xs">
        {detailLoading && <div>Loading...</div>}
        {detailError && (
          <div className="text-red-600 text-sm">{detailError}</div>
        )}
        {detailAsset && (
          <pre className="bg-neutral-100 dark:bg-neutral-900 p-3 rounded whitespace-pre-wrap break-all">
            {JSON.stringify(detailAsset, null, 2)}
          </pre>
        )}
      </div>
    </Modal>
  );
}
