/**
 * Delete Asset Confirmation Modal
 *
 * Supports single and multi-asset deletion.
 * Provides explicit choice for deletion scope:
 * - Delete locally only (keeps on provider like Pixverse)
 * - Delete from provider too (removes from provider account)
 */

import { Modal, Button } from '@pixsim7/shared.ui';

import type { AssetModel } from '../hooks/useAssets';

export interface DeleteAssetModalProps {
  assets: AssetModel[];
  onConfirm: (deleteFromProvider: boolean) => void;
  onCancel: () => void;
}

export function DeleteAssetModal({
  assets,
  onConfirm,
  onCancel,
}: DeleteAssetModalProps) {
  if (assets.length === 0) return null;

  const isSingle = assets.length === 1;
  const asset = assets[0];
  const assetName = asset.description || `Asset #${asset.id}`;
  const providerLabel = asset.providerId
    ? asset.providerId.charAt(0).toUpperCase() + asset.providerId.slice(1)
    : 'Provider';

  return (
    <Modal isOpen={true} onClose={onCancel} title={isSingle ? 'Delete Asset' : `Delete ${assets.length} Assets`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          {isSingle ? (
            <>Delete <strong className="font-medium">{assetName}</strong>?</>
          ) : (
            <>Delete <strong className="font-medium">{assets.length} assets</strong>? This cannot be undone.</>
          )}
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
