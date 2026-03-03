import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GalleryApplyTargetState {
  /** Active manual asset set used for quick-add while browsing the gallery. */
  activeManualSetId?: string;
  /** Set IDs whose assets are shown in the gallery (union). Empty = no filter. */
  filterSetIds: string[];
  setActiveManualSetId: (setId?: string) => void;
  clearActiveManualSetId: () => void;
  toggleFilterSet: (setId: string) => void;
  clearFilterSets: () => void;
}

export const useGalleryApplyTargetStore = create<GalleryApplyTargetState>()(
  persist(
    (set, get) => ({
      activeManualSetId: undefined,
      filterSetIds: [],
      setActiveManualSetId: (setId) => set({ activeManualSetId: setId || undefined }),
      clearActiveManualSetId: () => set({ activeManualSetId: undefined }),
      toggleFilterSet: (setId) => {
        const cur = get().filterSetIds;
        const next = cur.includes(setId) ? cur.filter((id) => id !== setId) : [...cur, setId];
        set({ filterSetIds: next });
      },
      clearFilterSets: () => set({ filterSetIds: [] }),
    }),
    {
      name: 'pixsim7-gallery-apply-target',
    },
  ),
);
