/**
 * Prompt Analysis Emphasis Store
 *
 * Remembers the click-to-pin role emphasis in the prompt analysis surface so
 * it survives tab switches and reloads. Keyed by analysis surface id (the same
 * stable id ShadowSidePanel uses for its collapse-state persistence), so each
 * surface keeps its own pin.
 *
 * Hover emphasis stays ephemeral (it's a pure pointer-driven preview). Only the
 * sticky pin is persisted. Consumers must guard a restored pin against the
 * current candidates — a role that no longer appears in the prompt should not
 * dim everything (see PromptAnalysisLayout).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PromptAnalysisEmphasisStore {
  /** Pinned role emphasis, keyed by analysis surface id. */
  pinnedRoleBySurface: Record<string, string | null>;
  setPinnedRole: (surfaceId: string, role: string | null) => void;
}

export const usePromptAnalysisEmphasisStore = create<PromptAnalysisEmphasisStore>()(
  persist(
    (set) => ({
      pinnedRoleBySurface: {},
      setPinnedRole: (surfaceId, role) =>
        set((state) => ({
          pinnedRoleBySurface: { ...state.pinnedRoleBySurface, [surfaceId]: role },
        })),
    }),
    {
      name: 'pixsim7:promptAnalysisEmphasis',
    },
  ),
);
