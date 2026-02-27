/**
 * Analyzer Settings Store
 *
 * Local persisted settings for analyzer defaults that are consumed by
 * frontend analysis helpers.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_ASSET_ANALYZER_ID } from './constants';

export const ASSET_ANALYZER_INTENT_KEYS = [
  'character_ingest_face',
  'character_ingest_sheet',
  'scene_prep_location',
  'scene_prep_style',
] as const;

export type AssetAnalyzerIntentKey = typeof ASSET_ANALYZER_INTENT_KEYS[number];

interface AnalyzerSettingsState {
  defaultImageAnalyzer: string;
  defaultVideoAnalyzer: string;
  intentAssetAnalyzers: Partial<Record<AssetAnalyzerIntentKey, string>>;
  setDefaultImageAnalyzer: (value: string) => void;
  setDefaultVideoAnalyzer: (value: string) => void;
  setIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey, value: string) => void;
  clearIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey) => void;
  getDefaultAssetAnalyzer: (mediaType?: 'image' | 'video') => string;
  getIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey) => string | null;
  getDefaultAssetAnalyzerForIntent: (intent: AssetAnalyzerIntentKey, mediaType?: 'image' | 'video') => string;
  resetAnalyzerSettings: () => void;
}

const STORAGE_KEY = 'pixsim7:analyzerSettings';

const DEFAULT_STATE = {
  defaultImageAnalyzer: DEFAULT_ASSET_ANALYZER_ID,
  defaultVideoAnalyzer: DEFAULT_ASSET_ANALYZER_ID,
  intentAssetAnalyzers: {},
} satisfies Pick<AnalyzerSettingsState, 'defaultImageAnalyzer' | 'defaultVideoAnalyzer' | 'intentAssetAnalyzers'>;

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
      setIntentAssetAnalyzer: (intent, value) =>
        set((state) => {
          const normalized = value?.trim();
          if (!normalized) {
            const next = { ...(state.intentAssetAnalyzers || {}) };
            delete next[intent];
            return { intentAssetAnalyzers: next };
          }
          return {
            intentAssetAnalyzers: {
              ...(state.intentAssetAnalyzers || {}),
              [intent]: normalized,
            },
          };
        }),
      clearIntentAssetAnalyzer: (intent) =>
        set((state) => {
          const next = { ...(state.intentAssetAnalyzers || {}) };
          delete next[intent];
          return { intentAssetAnalyzers: next };
        }),
      getDefaultAssetAnalyzer: (mediaType) =>
        mediaType === 'video'
          ? get().defaultVideoAnalyzer
          : get().defaultImageAnalyzer,
      getIntentAssetAnalyzer: (intent) => {
        const value = get().intentAssetAnalyzers?.[intent];
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized || null;
      },
      getDefaultAssetAnalyzerForIntent: (intent, mediaType) =>
        get().getIntentAssetAnalyzer(intent) || get().getDefaultAssetAnalyzer(mediaType),
      resetAnalyzerSettings: () => set(DEFAULT_STATE),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
