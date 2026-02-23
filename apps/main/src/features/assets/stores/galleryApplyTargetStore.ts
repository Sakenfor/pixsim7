import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GalleryApplyTargetState {
  /** Active manual asset set used for quick-add while browsing the gallery. */
  activeManualSetId?: string;
  setActiveManualSetId: (setId?: string) => void;
  clearActiveManualSetId: () => void;
}

export const useGalleryApplyTargetStore = create<GalleryApplyTargetState>()(
  persist(
    (set) => ({
      activeManualSetId: undefined,
      setActiveManualSetId: (setId) => set({ activeManualSetId: setId || undefined }),
      clearActiveManualSetId: () => set({ activeManualSetId: undefined }),
    }),
    {
      name: 'pixsim7-gallery-apply-target',
    },
  ),
);
