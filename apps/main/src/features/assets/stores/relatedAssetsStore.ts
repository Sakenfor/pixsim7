/**
 * Related Assets Store
 *
 * Controls the "More from..." modal that shows assets
 * filtered by a shared source (folder, site, source video, etc.).
 */
import { create } from 'zustand';

import type { AssetFilters } from '../hooks/useAssets';

interface RelatedAssetsState {
  isOpen: boolean;
  title: string;
  filters: AssetFilters;
  open: (title: string, filters: AssetFilters) => void;
  close: () => void;
}

export const useRelatedAssetsStore = create<RelatedAssetsState>((set) => ({
  isOpen: false,
  title: '',
  filters: {},
  open: (title, filters) => set({ isOpen: true, title, filters }),
  close: () => set({ isOpen: false, title: '', filters: {} }),
}));
