/**
 * Delete Modal Store
 *
 * Shared state for the asset delete confirmation modal.
 * Allows any component to trigger the modal and the parent route to render it.
 * Supports single or multi-asset deletion.
 */

import { create } from 'zustand';

import type { AssetModel } from '../hooks/useAssets';

interface DeleteModalState {
  /** Assets to delete (empty = modal closed) */
  assets: AssetModel[];
  /** Backward-compat convenience getter — first asset or null */
  asset: AssetModel | null;
  /** Open the delete modal for one or more assets */
  openDeleteModal: (input: AssetModel | AssetModel[]) => void;
  /** Close the modal */
  closeDeleteModal: () => void;
}

export const useDeleteModalStore = create<DeleteModalState>()((set) => ({
  assets: [],
  asset: null,
  openDeleteModal: (input) => {
    const assets = Array.isArray(input) ? input : [input];
    set({ assets, asset: assets[0] ?? null });
  },
  closeDeleteModal: () => set({ assets: [], asset: null }),
}));
