/**
 * Delete Asset Confirmation Modal
 *
 * Provides explicit choice for deletion scope:
 * - Delete locally only (keeps on provider like Pixverse)
 * - Delete from provider too (removes from provider account)
 */

import { Modal, Button } from '@pixsim7/shared.ui';

import type { AssetModel } from '../hooks/useAssets';

export interface DeleteAssetModalProps {
  asset: AssetModel;
  onConfirm: (deleteFromProvider: boolean) => void;
  onCancel: () => void;
}

export function DeleteAssetModal({
  asset,
  onConfirm,
  onCancel,
}: DeleteAssetModalProps) {
  const assetName = asset.description || `Asset #${asset.id}`;
  const providerLabel = asset.providerId
    ? asset.providerId.charAt(0).toUpperCase() + asset.providerId.slice(1)
    : 'Provider';

  return (
    <Modal isOpen={true} onClose={onCancel} title="Delete Asset" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Delete <strong className="font-medium">{assetName}</strong>?
        </p>

        <div className="flex flex-col gap-2">
          <Button
            onClick={() => onConfirm(false)}
            variant="danger"
            className="w-full justify-center"
          >
            Yes
          </Button>

          <Button
            onClick={() => onConfirm(true)}
            variant="danger"
            className="w-full justify-center"
          >
            Yes + {providerLabel} too
          </Button>

          <Button
            onClick={onCancel}
            variant="ghost"
            className="w-full justify-center"
          >
            Cancel
          </Button>
        </div>

        <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
          "+ {providerLabel}" also removes from your {providerLabel} account
        </p>
      </div>
    </Modal>
  );
}
