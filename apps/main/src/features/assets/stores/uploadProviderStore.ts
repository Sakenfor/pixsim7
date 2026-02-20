import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UploadProviderState {
  defaultUploadProviderId: string | null;
  setDefaultUploadProvider: (id: string) => void;
  clearDefaultUploadProvider: () => void;
}

export const useUploadProviderStore = create<UploadProviderState>()(
  persist(
    (set) => ({
      defaultUploadProviderId: null,
      setDefaultUploadProvider: (id) => set({ defaultUploadProviderId: id }),
      clearDefaultUploadProvider: () => set({ defaultUploadProviderId: null }),
    }),
    {
      name: 'ps7_upload_provider_preference',
      partialize: (state) => ({
        defaultUploadProviderId: state.defaultUploadProviderId,
      }),
    },
  ),
);
