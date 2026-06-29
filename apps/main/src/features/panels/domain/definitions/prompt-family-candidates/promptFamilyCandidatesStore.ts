/**
 * In-memory store for the Prompt Family Candidates tab.
 *
 * A module-singleton Zustand store so the last scan (controls + results) survives
 * the panel/tab unmounting and remounting — reopening shows the previous scan
 * instantly instead of an empty "Press Scan". NOT persisted to localStorage: the
 * results are a point-in-time snapshot that goes stale after grouping, and can be
 * large, so we keep them session-memory only.
 */
import { create } from 'zustand';

export interface CandidateMember {
  version_id: string;
  prompt_preview: string;
  successful_assets: number;
  generation_count: number;
  family_id: string | null;
  is_representative: boolean;
}

export interface ExistingFamilyRef {
  family_id: string;
  title: string | null;
  count: number;
}

export type CandidateLabel = 'tweak_family' | 'template_cluster';

export interface FamilyCandidate {
  label: CandidateLabel;
  size: number;
  total_successful_assets: number;
  total_generation_count: number;
  suggested_title: string;
  representative_version_id: string;
  existing_families: ExistingFamilyRef[];
  member_version_ids: string[];
  members: CandidateMember[];
  members_truncated: boolean;
}

export interface FamilyCandidatesResponse {
  params: Record<string, unknown>;
  count: number;
  candidates: FamilyCandidate[];
}

export type TemplateSegment =
  | { kind: 'text'; text: string }
  | { kind: 'slot'; index: number; values: string[]; total: number };

export interface InducedTemplate {
  member_count: number;
  stable_pct: number;
  slot_count: number;
  segments: TemplateSegment[];
}

export const LEXICAL_METHODS = ['jaccard', 'combined', 'sequence', 'ngram'] as const;
export type LexicalMethod = (typeof LEXICAL_METHODS)[number];

interface Controls {
  cosineFloor: number;
  lexicalFloor: number;
  lexicalMethod: LexicalMethod;
  seedLimit: number;
  includeGrouped: boolean;
}

interface FamilyCandidatesState extends Controls {
  candidates: FamilyCandidate[] | null;
  loading: boolean;
  error: string | null;
  notice: string | null;

  setControls: (patch: Partial<Controls>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  setCandidates: (candidates: FamilyCandidate[]) => void;
  /** Drop a cluster from the list (after promote / merge / dismiss). */
  removeCandidate: (representativeVersionId: string) => void;
}

export const usePromptFamilyCandidatesStore = create<FamilyCandidatesState>((set) => ({
  cosineFloor: 0.8,
  lexicalFloor: 0.85,
  lexicalMethod: 'jaccard',
  seedLimit: 2000,
  includeGrouped: false,

  candidates: null,
  loading: false,
  error: null,
  notice: null,

  setControls: (patch) => set(patch),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
  setCandidates: (candidates) => set({ candidates }),
  removeCandidate: (representativeVersionId) =>
    set((state) => ({
      candidates:
        state.candidates?.filter(
          (c) => c.representative_version_id !== representativeVersionId,
        ) ?? null,
    })),
}));
