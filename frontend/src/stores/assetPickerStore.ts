import { create } from 'zustand';

export interface SelectedAsset {
  id: string;
  mediaType: string;
  providerId: string;
  providerAssetId: string;
  remoteUrl?: string;
  thumbnailUrl?: string;
}

interface AssetPickerState {
  isSelectionMode: boolean;
  onAssetSelected: ((asset: SelectedAsset) => void) | null;

  // Enter selection mode with a callback
  enterSelectionMode: (callback: (asset: SelectedAsset) => void) => void;

  // Exit selection mode
  exitSelectionMode: () => void;

  // Select an asset (triggers callback and exits)
  selectAsset: (asset: SelectedAsset) => void;
}

export const useAssetPickerStore = create<AssetPickerState>((set, get) => ({
  isSelectionMode: false,
  onAssetSelected: null,

  enterSelectionMode: (callback) => {
    set({
      isSelectionMode: true,
      onAssetSelected: callback,
    });
  },

  exitSelectionMode: () => {
    set({
      isSelectionMode: false,
      onAssetSelected: null,
    });
  },

  selectAsset: (asset) => {
    const { onAssetSelected } = get();
    if (onAssetSelected) {
      onAssetSelected(asset);
    }
    // Exit selection mode after selecting
    set({
      isSelectionMode: false,
      onAssetSelected: null,
    });
  },
}));
