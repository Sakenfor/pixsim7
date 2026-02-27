import { create } from 'zustand';

export type MediaCardActionMode = 'generation' | 'character-ingest';

interface MediaCardActionModeStore {
  byAssetId: Record<number, MediaCardActionMode | undefined>;
  setMode: (assetId: number, mode: MediaCardActionMode) => void;
  clearMode: (assetId: number) => void;
}

export const useMediaCardActionModeStore = create<MediaCardActionModeStore>((set) => ({
  byAssetId: {},
  setMode: (assetId, mode) =>
    set((state) => ({
      byAssetId: {
        ...state.byAssetId,
        [assetId]: mode,
      },
    })),
  clearMode: (assetId) =>
    set((state) => {
      const next = { ...state.byAssetId };
      delete next[assetId];
      return { byAssetId: next };
    }),
}));
