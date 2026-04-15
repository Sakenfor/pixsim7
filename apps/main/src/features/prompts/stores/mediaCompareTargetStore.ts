import { create } from 'zustand';

export type CompareTargetMediaType = 'image' | 'video' | 'audio' | '3d_model';

export interface MediaCompareTarget {
  assetId: number;
  prompt: string;
  mediaType: CompareTargetMediaType;
}

interface MediaCompareTargetStore {
  target: MediaCompareTarget | null;
  pinTarget: (target: MediaCompareTarget) => void;
  clearTarget: () => void;
}

export const useMediaCompareTargetStore = create<MediaCompareTargetStore>((set) => ({
  target: null,
  pinTarget: (target) => set({ target }),
  clearTarget: () => set({ target: null }),
}));
