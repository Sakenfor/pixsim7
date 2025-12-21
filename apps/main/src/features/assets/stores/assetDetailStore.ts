/**
 * Asset Detail Store
 *
 * Shared state for the asset detail panel/modal.
 * Used to coordinate between gallery components and the detail display.
 */
import { create } from 'zustand';

interface AssetDetailState {
  /** Currently selected asset ID for detail view */
  detailAssetId: number | null;

  /** Set the asset ID to show in detail view */
  setDetailAssetId: (id: number | null) => void;

  /** Close the detail view */
  closeDetail: () => void;
}

export const useAssetDetailStore = create<AssetDetailState>((set) => ({
  detailAssetId: null,

  setDetailAssetId: (id) => {
    console.log('[AssetDetailStore] setDetailAssetId:', id);
    set({ detailAssetId: id });
  },

  closeDetail: () => set({ detailAssetId: null }),
}));
