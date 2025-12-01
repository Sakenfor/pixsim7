/**
 * DeleteConfirmModal Component
 *
 * Confirmation modal for deleting a provider account.
 */

import { useState } from 'react';
import { Modal, Button } from '@pixsim7/shared.ui';
import type { ProviderAccount } from '@/hooks/useProviderAccounts';

interface DeleteConfirmModalProps {
  account: ProviderAccount;
  onClose: () => void;
  onConfirm: (accountId: number) => Promise<void>;
}

export function DeleteConfirmModal({ account, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm(account.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Delete Account" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Are you sure you want to delete this account?
        </p>

        <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg">
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {account.nickname || account.email}
          </div>
          {account.nickname && (
            <div className="text-xs text-neutral-500">{account.email}</div>
          )}
        </div>

        <p className="text-xs text-red-600 dark:text-red-400">
          This action cannot be undone.
        </p>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleDelete}
          disabled={deleting}
          className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </div>
    </Modal>
  );
}
