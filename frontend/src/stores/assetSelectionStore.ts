import { create } from 'zustand';

export interface SelectedAsset {
  id: number;
  key: string;
  name: string;
  type: 'image' | 'video';
  url: string;
  source: 'gallery' | 'cube' | 'panel';
}

interface AssetSelectionStore {
  selectedAssets: SelectedAsset[];
  lastSelectedAsset?: SelectedAsset;

  // Select an asset
  selectAsset: (asset: SelectedAsset) => void;

  // Toggle selection
  toggleAsset: (asset: SelectedAsset) => void;

  // Clear selection
  clearSelection: () => void;

  // Check if asset is selected
  isSelected: (assetId: number) => boolean;

  // Remove asset from selection
  removeAsset: (assetId: number) => void;
}

export const useAssetSelectionStore = create<AssetSelectionStore>((set, get) => ({
  selectedAssets: [],
  lastSelectedAsset: undefined,

  selectAsset: (asset) => {
    set((state) => {
      // Don't add duplicates
      if (state.selectedAssets.some((a) => a.id === asset.id)) {
        return { lastSelectedAsset: asset };
      }

      return {
        selectedAssets: [...state.selectedAssets, asset],
        lastSelectedAsset: asset,
      };
    });
  },

  toggleAsset: (asset) => {
    set((state) => {
      const exists = state.selectedAssets.some((a) => a.id === asset.id);

      if (exists) {
        return {
          selectedAssets: state.selectedAssets.filter((a) => a.id !== asset.id),
          lastSelectedAsset: asset,
        };
      } else {
        return {
          selectedAssets: [...state.selectedAssets, asset],
          lastSelectedAsset: asset,
        };
      }
    });
  },

  clearSelection: () => {
    set({ selectedAssets: [], lastSelectedAsset: undefined });
  },

  isSelected: (assetId) => {
    return get().selectedAssets.some((a) => a.id === assetId);
  },

  removeAsset: (assetId) => {
    set((state) => ({
      selectedAssets: state.selectedAssets.filter((a) => a.id !== assetId),
    }));
  },
}));
