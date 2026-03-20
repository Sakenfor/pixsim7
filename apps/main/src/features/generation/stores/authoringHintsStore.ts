/**
 * Ephemeral store bridging prompt-authoring suggested overrides to generation UI.
 *
 * The authoring editor writes resolved hints here keyed by generation scope ID.
 * GenerationSettingsPanel reads them to show inline suggested-override badges.
 * Not persisted — hints are session-lived and recomputed on mount.
 */
import { create } from 'zustand';

import type { OperationType } from '@/types/operations';

export interface AuthoringHints {
  suggestedOperation: OperationType | null;
  suggestedParams: Record<string, unknown>;
}

interface AuthoringHintsState {
  byScopeId: Record<string, AuthoringHints>;
  set: (scopeId: string, hints: AuthoringHints) => void;
  clear: (scopeId: string) => void;
}

export const useAuthoringHintsStore = create<AuthoringHintsState>()((set) => ({
  byScopeId: {},
  set: (scopeId, hints) =>
    set((state) => ({ byScopeId: { ...state.byScopeId, [scopeId]: hints } })),
  clear: (scopeId) =>
    set((state) => {
      const next = { ...state.byScopeId };
      delete next[scopeId];
      return { byScopeId: next };
    }),
}));
