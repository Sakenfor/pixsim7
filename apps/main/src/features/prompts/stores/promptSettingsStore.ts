/**
 * Prompt Settings Store
 *
 * Persisted settings for prompt analysis and block extraction.
 */
import { PROMPT_ROLE_COLORS } from '@pixsim7/shared.types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_PROMPT_ANALYZER_ID } from '@lib/analyzers';

export interface PromptSettings {
  // Analysis settings
  autoAnalyze: boolean;
  defaultAnalyzer: string;  // Dynamic - see GET /api/v1/analyzers

  // Block extraction settings
  autoExtractBlocks: boolean;
  extractionThreshold: number;

  // Prompt role appearance
  promptRoleColors: Record<string, string>;

  // Block layout mode
  blocksLayout: 'stacked' | 'inline';

  // Composer view state — remembered across tab switches / reloads so the
  // composer reopens the way the user left it (per-prompt text + history are
  // persisted elsewhere; these are the "how I like the composer arranged"
  // view choices that previously reset on every remount).
  composerMode: 'text' | 'blocks';
  // Structure/Syntax layer: the mini-language decorations (operators +
  // variables + facets + click-to-edit) driven by the client-side tokenizer.
  // Independent of composerShowAnalysis (the heavy role-analysis overlay):
  // structure is cheap/offline and on by default; analysis is opt-in.
  composerShowStructure: boolean;
  composerShowAnalysis: boolean;
  composerShowTools: boolean;

  // Editor engine: 'textarea' (default) or 'codemirror'
  editorEngine: 'textarea' | 'codemirror';

  // Viewer engine for the read-only prompt-box panel: 'inline' (DOM spans,
  // current default) or 'codemirror' (read-only PromptEditor with the same
  // shadow/operator extensions QuickGen uses, for structure parity).
  viewerEngine: 'inline' | 'codemirror';

  // Diff highlight granularity for ghost-diff overlay and side-by-side view.
  // 'coarse' = clause/sentence-level; 'fine' = word-level (inspection-grade).
  ghostDiffPrecision: 'coarse' | 'fine';

  // Semantic action-block suggestions
  semanticEnabled: boolean;
  semanticThreshold: number;
  semanticLimit: number;
  semanticModelId: string | null;
}

interface PromptSettingsStore extends PromptSettings {
  // Actions
  setEditorEngine: (value: PromptSettings['editorEngine']) => void;
  setViewerEngine: (value: PromptSettings['viewerEngine']) => void;
  setGhostDiffPrecision: (value: PromptSettings['ghostDiffPrecision']) => void;
  setAutoAnalyze: (value: boolean) => void;
  setDefaultAnalyzer: (value: string) => void;
  setAutoExtractBlocks: (value: boolean) => void;
  setExtractionThreshold: (value: number) => void;
  setPromptRoleColor: (roleId: string, color: string) => void;
  setPromptRoleColors: (colors: Record<string, string>) => void;
  setBlocksLayout: (value: PromptSettings['blocksLayout']) => void;
  setComposerMode: (value: PromptSettings['composerMode']) => void;
  setComposerShowStructure: (value: boolean) => void;
  setComposerShowAnalysis: (value: boolean) => void;
  setComposerShowTools: (value: boolean) => void;
  setSemanticEnabled: (value: boolean) => void;
  setSemanticThreshold: (value: number) => void;
  setSemanticLimit: (value: number) => void;
  setSemanticModelId: (value: string | null) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: PromptSettings = {
  autoAnalyze: true,
  defaultAnalyzer: DEFAULT_PROMPT_ANALYZER_ID,
  autoExtractBlocks: false,
  extractionThreshold: 2,
  promptRoleColors: { ...PROMPT_ROLE_COLORS },
  editorEngine: 'codemirror',
  viewerEngine: 'inline',
  ghostDiffPrecision: 'coarse',
  blocksLayout: 'stacked',
  composerMode: 'text',
  composerShowStructure: true,
  composerShowAnalysis: false,
  composerShowTools: false,
  semanticEnabled: false,
  semanticThreshold: 0.65,
  semanticLimit: 5,
  semanticModelId: null,
};

export const usePromptSettingsStore = create<PromptSettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setEditorEngine: (value) => set({ editorEngine: value }),
      setViewerEngine: (value) => set({ viewerEngine: value }),
      setGhostDiffPrecision: (value) => set({ ghostDiffPrecision: value }),
      setAutoAnalyze: (value) => set({ autoAnalyze: value }),
      setDefaultAnalyzer: (value) => set({ defaultAnalyzer: value }),
      setAutoExtractBlocks: (value) => set({ autoExtractBlocks: value }),
      setExtractionThreshold: (value) => set({ extractionThreshold: value }),
      setPromptRoleColor: (roleId, color) =>
        set((state) => ({
          promptRoleColors: {
            ...state.promptRoleColors,
            [roleId]: color,
          },
        })),
      setPromptRoleColors: (colors) => set({ promptRoleColors: { ...colors } }),
      setBlocksLayout: (value) => set({ blocksLayout: value }),
      setComposerMode: (value) => set({ composerMode: value }),
      setComposerShowStructure: (value) => set({ composerShowStructure: value }),
      setComposerShowAnalysis: (value) => set({ composerShowAnalysis: value }),
      setComposerShowTools: (value) => set({ composerShowTools: value }),
      setSemanticEnabled: (value) => set({ semanticEnabled: value }),
      setSemanticThreshold: (value) => set({ semanticThreshold: value }),
      setSemanticLimit: (value) => set({ semanticLimit: value }),
      setSemanticModelId: (value) => set({ semanticModelId: value }),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'pixsim7:promptSettings',
    }
  )
);
