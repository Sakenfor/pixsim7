/**
 * Prompt Authoring Draft Store
 *
 * Remembers in-progress authoring inputs so they survive panel/tab switches
 * and full reloads (silent restore). Two concerns:
 *
 *   1. Last selection — which family/version was open, so reopening the
 *      workbench lands where the user left off.
 *   2. Per-version field drafts — the instruction / commit-message / tags the
 *      user typed but hasn't committed, keyed by version id so switching
 *      versions never clobbers a draft sitting on another version.
 *
 * Drafts are written only on user edits (see PromptAuthoringContext's wrapped
 * setters); loading a version into the editor uses raw setters so it never
 * fabricates a draft equal to the version's saved values. A successful
 * commit/apply clears the source version's draft.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PromptAuthoringDraft {
  instruction: string;
  commitMessage: string;
  tags: string;
}

export type PromptAuthoringDraftField = keyof PromptAuthoringDraft;

const EMPTY_DRAFT: PromptAuthoringDraft = {
  instruction: '',
  commitMessage: '',
  tags: '',
};

interface PromptAuthoringDraftStore {
  /** Last family opened in the authoring workbench. */
  lastFamilyId: string | null;
  /** Last version opened in the authoring workbench. */
  lastVersionId: string | null;
  /** In-progress field edits, keyed by version id. */
  drafts: Record<string, PromptAuthoringDraft>;

  rememberSelection: (familyId: string | null, versionId: string | null) => void;
  setDraftField: (versionId: string, field: PromptAuthoringDraftField, value: string) => void;
  clearDraft: (versionId: string) => void;
}

export const usePromptAuthoringDraftStore = create<PromptAuthoringDraftStore>()(
  persist(
    (set) => ({
      lastFamilyId: null,
      lastVersionId: null,
      drafts: {},

      rememberSelection: (familyId, versionId) =>
        set({ lastFamilyId: familyId, lastVersionId: versionId }),

      setDraftField: (versionId, field, value) =>
        set((state) => {
          const current = state.drafts[versionId] ?? EMPTY_DRAFT;
          return {
            drafts: {
              ...state.drafts,
              [versionId]: { ...current, [field]: value },
            },
          };
        }),

      clearDraft: (versionId) =>
        set((state) => {
          if (!(versionId in state.drafts)) return state;
          const next = { ...state.drafts };
          delete next[versionId];
          return { drafts: next };
        }),
    }),
    {
      name: 'pixsim7:promptAuthoringDrafts',
    },
  ),
);
