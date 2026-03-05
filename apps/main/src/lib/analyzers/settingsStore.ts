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
  defaultImageAnalyzers: string[];
  defaultVideoAnalyzers: string[];
  intentAssetAnalyzers: Partial<Record<AssetAnalyzerIntentKey, string>>;
  intentAssetAnalyzerChains: Partial<Record<AssetAnalyzerIntentKey, string[]>>;
  setDefaultImageAnalyzer: (value: string) => void;
  setDefaultVideoAnalyzer: (value: string) => void;
  setDefaultImageAnalyzers: (values: string[]) => void;
  setDefaultVideoAnalyzers: (values: string[]) => void;
  setIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey, value: string) => void;
  setIntentAssetAnalyzerChain: (intent: AssetAnalyzerIntentKey, values: string[]) => void;
  clearIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey) => void;
  getDefaultAssetAnalyzer: (mediaType?: 'image' | 'video') => string;
  getDefaultAssetAnalyzers: (mediaType?: 'image' | 'video') => string[];
  getIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey) => string | null;
  getIntentAssetAnalyzerChain: (intent: AssetAnalyzerIntentKey) => string[];
  getDefaultAssetAnalyzerForIntent: (intent: AssetAnalyzerIntentKey, mediaType?: 'image' | 'video') => string;
  getDefaultAssetAnalyzerChainForIntent: (intent: AssetAnalyzerIntentKey, mediaType?: 'image' | 'video') => string[];
  resetAnalyzerSettings: () => void;
}

const STORAGE_KEY = 'pixsim7:analyzerSettings';

function normalizeAnalyzerChain(values: string[] | undefined, fallback: string): string[] {
  if (!Array.isArray(values)) return [fallback];
  const chain = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0);
  return chain.length > 0 ? Array.from(new Set(chain)) : [fallback];
}

function withPrimaryAnalyzer(primary: string, existing: string[] | undefined, fallback: string): string[] {
  const normalizedPrimary = primary.trim() || fallback;
  const normalizedExisting = normalizeAnalyzerChain(existing, fallback);
  return [normalizedPrimary, ...normalizedExisting.filter((value) => value !== normalizedPrimary)];
}

const DEFAULT_STATE = {
  defaultImageAnalyzer: DEFAULT_ASSET_ANALYZER_ID,
  defaultVideoAnalyzer: DEFAULT_ASSET_ANALYZER_ID,
  defaultImageAnalyzers: [DEFAULT_ASSET_ANALYZER_ID],
  defaultVideoAnalyzers: [DEFAULT_ASSET_ANALYZER_ID],
  intentAssetAnalyzers: {},
  intentAssetAnalyzerChains: {},
} satisfies Pick<
  AnalyzerSettingsState,
  | 'defaultImageAnalyzer'
  | 'defaultVideoAnalyzer'
  | 'defaultImageAnalyzers'
  | 'defaultVideoAnalyzers'
  | 'intentAssetAnalyzers'
  | 'intentAssetAnalyzerChains'
>;

export const useAnalyzerSettingsStore = create<AnalyzerSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      setDefaultImageAnalyzer: (value) =>
        set((state) => {
          const chain = withPrimaryAnalyzer(
            value?.trim() || DEFAULT_ASSET_ANALYZER_ID,
            state.defaultImageAnalyzers,
            DEFAULT_ASSET_ANALYZER_ID
          );
          return {
            defaultImageAnalyzer: chain[0],
            defaultImageAnalyzers: chain,
          };
        }),
      setDefaultVideoAnalyzer: (value) =>
        set((state) => {
          const chain = withPrimaryAnalyzer(
            value?.trim() || DEFAULT_ASSET_ANALYZER_ID,
            state.defaultVideoAnalyzers,
            DEFAULT_ASSET_ANALYZER_ID
          );
          return {
            defaultVideoAnalyzer: chain[0],
            defaultVideoAnalyzers: chain,
          };
        }),
      setDefaultImageAnalyzers: (values) =>
        set(() => {
          const chain = normalizeAnalyzerChain(values, DEFAULT_ASSET_ANALYZER_ID);
          return {
            defaultImageAnalyzer: chain[0],
            defaultImageAnalyzers: chain,
          };
        }),
      setDefaultVideoAnalyzers: (values) =>
        set(() => {
          const chain = normalizeAnalyzerChain(values, DEFAULT_ASSET_ANALYZER_ID);
          return {
            defaultVideoAnalyzer: chain[0],
            defaultVideoAnalyzers: chain,
          };
        }),
      setIntentAssetAnalyzer: (intent, value) =>
        set((state) => {
          const normalized = value?.trim();
          if (!normalized) {
            const next = { ...(state.intentAssetAnalyzers || {}) };
            const chainNext = { ...(state.intentAssetAnalyzerChains || {}) };
            delete next[intent];
            delete chainNext[intent];
            return {
              intentAssetAnalyzers: next,
              intentAssetAnalyzerChains: chainNext,
            };
          }
          const existingChain = state.intentAssetAnalyzerChains?.[intent] ?? [];
          const nextChain = withPrimaryAnalyzer(normalized, existingChain, normalized);
          return {
            intentAssetAnalyzers: {
              ...(state.intentAssetAnalyzers || {}),
              [intent]: normalized,
            },
            intentAssetAnalyzerChains: {
              ...(state.intentAssetAnalyzerChains || {}),
              [intent]: nextChain,
            },
          };
        }),
      setIntentAssetAnalyzerChain: (intent, values) =>
        set((state) => {
          const raw = Array.isArray(values)
            ? values
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter((value): value is string => value.length > 0)
            : [];

          const nextScalar = { ...(state.intentAssetAnalyzers || {}) };
          const nextChains = { ...(state.intentAssetAnalyzerChains || {}) };
          if (raw.length === 0) {
            delete nextScalar[intent];
            delete nextChains[intent];
          } else {
            const chain = Array.from(new Set(raw));
            nextScalar[intent] = chain[0];
            nextChains[intent] = chain;
          }
          return {
            intentAssetAnalyzers: nextScalar,
            intentAssetAnalyzerChains: nextChains,
          };
        }),
      clearIntentAssetAnalyzer: (intent) =>
        set((state) => {
          const next = { ...(state.intentAssetAnalyzers || {}) };
          const chainNext = { ...(state.intentAssetAnalyzerChains || {}) };
          delete next[intent];
          delete chainNext[intent];
          return {
            intentAssetAnalyzers: next,
            intentAssetAnalyzerChains: chainNext,
          };
        }),
      getDefaultAssetAnalyzer: (mediaType) =>
        get().getDefaultAssetAnalyzers(mediaType)[0],
      getDefaultAssetAnalyzers: (mediaType) => {
        const state = get();
        if (mediaType === 'video') {
          return normalizeAnalyzerChain(state.defaultVideoAnalyzers, state.defaultVideoAnalyzer || DEFAULT_ASSET_ANALYZER_ID);
        }
        return normalizeAnalyzerChain(state.defaultImageAnalyzers, state.defaultImageAnalyzer || DEFAULT_ASSET_ANALYZER_ID);
      },
      getIntentAssetAnalyzer: (intent) => {
        const chain = get().getIntentAssetAnalyzerChain(intent);
        if (chain.length > 0) return chain[0];

        const value = get().intentAssetAnalyzers?.[intent];
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized || null;
      },
      getIntentAssetAnalyzerChain: (intent) => {
        const chain = get().intentAssetAnalyzerChains?.[intent];
        if (Array.isArray(chain) && chain.length > 0) {
          return chain
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value): value is string => value.length > 0);
        }

        const scalar = get().intentAssetAnalyzers?.[intent];
        const normalizedScalar = typeof scalar === 'string' ? scalar.trim() : '';
        return normalizedScalar ? [normalizedScalar] : [];
      },
      getDefaultAssetAnalyzerForIntent: (intent, mediaType) =>
        get().getDefaultAssetAnalyzerChainForIntent(intent, mediaType)[0],
      getDefaultAssetAnalyzerChainForIntent: (intent, mediaType) => {
        const intentChain = get().getIntentAssetAnalyzerChain(intent);
        return intentChain.length > 0 ? intentChain : get().getDefaultAssetAnalyzers(mediaType);
      },
      resetAnalyzerSettings: () => set(DEFAULT_STATE),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
