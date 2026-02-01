/**
 * Delete Modal Store
 *
 * Shared state for the asset delete confirmation modal.
 * Allows any component to trigger the modal and the parent route to render it.
 */

import { create } from 'zustand';

import type { AssetModel } from '../hooks/useAssets';

interface DeleteModalState {
  /** Asset to delete (null = modal closed) */
  asset: AssetModel | null;
  /** Open the delete modal for an asset */
  openDeleteModal: (asset: AssetModel) => void;
  /** Close the modal */
  closeDeleteModal: () => void;
}

export const useDeleteModalStore = create<DeleteModalState>()((set) => ({
  asset: null,
  openDeleteModal: (asset) => set({ asset }),
  closeDeleteModal: () => set({ asset: null }),
}));
