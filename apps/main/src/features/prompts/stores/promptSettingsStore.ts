/**
 * Prompt Settings Store
 *
 * Persisted settings for prompt analysis and block extraction.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PROMPT_ANALYZER_ID } from '@lib/analyzers/constants';

export interface PromptSettings {
  // Analysis settings
  autoAnalyze: boolean;
  defaultAnalyzer: string;  // Dynamic - see GET /api/v1/analyzers

  // Block extraction settings
  autoExtractBlocks: boolean;
  extractionThreshold: number;
  defaultCurationStatus: 'raw' | 'reviewed' | 'curated';
}

interface PromptSettingsStore extends PromptSettings {
  // Actions
  setAutoAnalyze: (value: boolean) => void;
  setDefaultAnalyzer: (value: string) => void;
  setAutoExtractBlocks: (value: boolean) => void;
  setExtractionThreshold: (value: number) => void;
  setDefaultCurationStatus: (value: PromptSettings['defaultCurationStatus']) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: PromptSettings = {
  autoAnalyze: true,
  defaultAnalyzer: DEFAULT_PROMPT_ANALYZER_ID,
  autoExtractBlocks: false,
  extractionThreshold: 2,
  defaultCurationStatus: 'raw',
};

export const usePromptSettingsStore = create<PromptSettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setAutoAnalyze: (value) => set({ autoAnalyze: value }),
      setDefaultAnalyzer: (value) => set({ defaultAnalyzer: value }),
      setAutoExtractBlocks: (value) => set({ autoExtractBlocks: value }),
      setExtractionThreshold: (value) => set({ extractionThreshold: value }),
      setDefaultCurationStatus: (value) => set({ defaultCurationStatus: value }),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'pixsim7:promptSettings',
    }
  )
);
