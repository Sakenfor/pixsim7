/**
 * Analyzer Settings Store
 *
 * Local persisted settings for analyzer defaults that are consumed by
 * frontend analysis helpers.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_ASSET_ANALYZER_ID } from './constants';

interface AnalyzerSettingsState {
  defaultImageAnalyzer: string;
  defaultVideoAnalyzer: string;
  setDefaultImageAnalyzer: (value: string) => void;
  setDefaultVideoAnalyzer: (value: string) => void;
  getDefaultAssetAnalyzer: (mediaType?: 'image' | 'video') => string;
  resetAnalyzerSettings: () => void;
}

const STORAGE_KEY = 'pixsim7:analyzerSettings';

const DEFAULT_STATE = {
  defaultImageAnalyzer: DEFAULT_ASSET_ANALYZER_ID,
  defaultVideoAnalyzer: DEFAULT_ASSET_ANALYZER_ID,
} satisfies Pick<AnalyzerSettingsState, 'defaultImageAnalyzer' | 'defaultVideoAnalyzer'>;

export const useAnalyzerSettingsStore = create<AnalyzerSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      setDefaultImageAnalyzer: (value) =>
        set({
          defaultImageAnalyzer: value?.trim() || DEFAULT_ASSET_ANALYZER_ID,
        }),
      setDefaultVideoAnalyzer: (value) =>
        set({
          defaultVideoAnalyzer: value?.trim() || DEFAULT_ASSET_ANALYZER_ID,
        }),
      getDefaultAssetAnalyzer: (mediaType) =>
        mediaType === 'video'
          ? get().defaultVideoAnalyzer
          : get().defaultImageAnalyzer,
      resetAnalyzerSettings: () => set(DEFAULT_STATE),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
