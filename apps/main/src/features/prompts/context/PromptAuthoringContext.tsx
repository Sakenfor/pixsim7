/* eslint-disable react-refresh/only-export-components */
/**
 * PromptAuthoringContext
 *
 * Shared state for the Prompt Authoring sub-panels (Navigator, Editor, Assets).
 * Extracted from the monolithic PromptVersionAuthoringWorkbench so sub-panels
 * can consume state independently via `usePromptAuthoring()`.
 */

import type { AssetResponse } from '@pixsim7/shared.api.client/domains';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  applyPromptEdit,
  createPromptFamily,
  createPromptVersion,
  getPromptAuthoringContract,
  getPromptVersionAssets,
  listPromptFamilies,
  listPromptVersions,
  updatePromptFamily,
  type PromptFamilySummary,
  type PromptAuthoringModeContract,
  type PromptVersionSummary,
} from '@lib/api/prompts';
import { useVersions } from '@lib/ui/versioning';
import { createHmrSafeContext } from '@lib/utils';

import type { AssetModel } from '@features/assets';
import { fromAssetResponse } from '@features/assets/models/asset';
import { useGenerationScopeStores } from '@features/generation';

// ── Types ──

export type AssetScopeMode = 'version' | 'branch' | 'family';

export interface PromptAuthoringState {
  // Families
  families: PromptFamilySummary[];
  familiesLoading: boolean;
  familiesError: string | null;
  selectedFamilyId: string | null;
  setSelectedFamilyId: (id: string | null) => void;

  // Family creation form
  newFamilyTitle: string;
  setNewFamilyTitle: (v: string) => void;
  newFamilyPromptType: 'visual' | 'narrative' | 'hybrid';
  setNewFamilyPromptType: (v: 'visual' | 'narrative' | 'hybrid') => void;
  newFamilyCategory: string;
  setNewFamilyCategory: (v: string) => void;
  newFamilyTagsInput: string;
  setNewFamilyTagsInput: (v: string) => void;
  newFamilyCharacterId: string | null;
  setNewFamilyCharacterId: (v: string | null) => void;

  // Versions
  versions: PromptVersionSummary[];
  versionsLoading: boolean;
  versionsError: string | null;
  selectedVersionId: string | null;
  setSelectedVersionId: (id: string | null) => void;

  // Editor
  editorText: string;
  setEditorText: (v: string) => void;
  instructionInput: string;
  setInstructionInput: (v: string) => void;
  commitMessageInput: string;
  setCommitMessageInput: (v: string) => void;
  versionTagsInput: string;
  setVersionTagsInput: (v: string) => void;

  // Assets
  scopeMode: AssetScopeMode;
  setScopeMode: (v: AssetScopeMode) => void;
  scopeAssets: AssetModel[];
  assetsLoading: boolean;
  assetsError: string | null;

  // Action state
  busyAction: 'family' | 'version' | 'edit' | null;
  statusMessage: string | null;

  // Derived
  authoringModes: PromptAuthoringModeContract[];
  selectedFamily: PromptFamilySummary | null;
  selectedVersion: PromptVersionSummary | null;
  targetVersionIds: string[];
  truncatedVersionCount: number;

  // Actions
  refreshFamilies: (preferredFamilyId?: string | null) => Promise<void>;
  refreshVersions: (familyId: string | null, preferredVersionId?: string | null) => Promise<void>;
  refreshScopeAssets: () => Promise<void>;
  handleCreateFamily: () => Promise<void>;
  handleUpdateFamily: (familyId: string, data: { title?: string; description?: string; category?: string; tags?: string[]; is_active?: boolean; primary_character_id?: string | null }) => Promise<void>;
  handleCreateVersion: () => Promise<void>;
  handleApplyEdit: () => Promise<void>;
  /** Hydrate all editor fields from a version object. */
  hydrateFromVersion: (version: PromptVersionSummary) => void;
}

// ── Utilities ──

const MAX_SCOPE_VERSION_IDS = 16;

export function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function collectBranchVersionIds(
  versionEntries: Array<{ entityId: string | number; parentId: string | number | null }>,
  rootId: string,
): string[] {
  if (!rootId) return [];
  const childMap = new Map<string, string[]>();
  versionEntries.forEach((entry) => {
    const childId = String(entry.entityId);
    if (!entry.parentId) return;
    const parentId = String(entry.parentId);
    const existing = childMap.get(parentId) ?? [];
    existing.push(childId);
    childMap.set(parentId, existing);
  });
  const queue: string[] = [rootId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    const children = childMap.get(next) ?? [];
    children.forEach((childId) => queue.push(childId));
  }
  return Array.from(visited);
}

// ── Context ──

const PromptAuthoringCtx = createHmrSafeContext<PromptAuthoringState | null>(
  'promptAuthoring',
  null,
);

export function usePromptAuthoring(): PromptAuthoringState {
  const ctx = useContext(PromptAuthoringCtx);
  if (!ctx) {
    throw new Error('usePromptAuthoring must be used inside <PromptAuthoringProvider>');
  }
  return ctx;
}

// ── Provider ──

export function PromptAuthoringProvider({ children }: { children: React.ReactNode }) {
  // ── Family state ──
  const [families, setFamilies] = useState<PromptFamilySummary[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [familiesError, setFamiliesError] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  // ── Family creation form ──
  const [newFamilyTitle, setNewFamilyTitle] = useState('');
  const [newFamilyPromptType, setNewFamilyPromptType] = useState<'visual' | 'narrative' | 'hybrid'>('visual');
  const [newFamilyCategory, setNewFamilyCategory] = useState('');
  const [newFamilyTagsInput, setNewFamilyTagsInput] = useState('');
  const [newFamilyCharacterId, setNewFamilyCharacterId] = useState<string | null>(null);

  // ── Version state ──
  const [versions, setVersions] = useState<PromptVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [authoringModes, setAuthoringModes] = useState<PromptAuthoringModeContract[]>([]);

  // ── Editor state ──
  const { useSessionStore } = useGenerationScopeStores();
  const editorText = useSessionStore((s) => s.prompt);
  const setEditorText = useSessionStore((s) => s.setPrompt);
  const [instructionInput, setInstructionInput] = useState('');
  const [commitMessageInput, setCommitMessageInput] = useState('');
  const [versionTagsInput, setVersionTagsInput] = useState('');

  // ── Asset state ──
  const [scopeMode, setScopeMode] = useState<AssetScopeMode>('version');
  const [scopeAssets, setScopeAssets] = useState<AssetModel[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  // ── Action state ──
  const [busyAction, setBusyAction] = useState<'family' | 'version' | 'edit' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const lastLoadedVersionIdRef = useRef<string | null>(null);
  const { versions: versionTimeline } = useVersions('prompt', selectedFamilyId);

  // ── Version hydration ──
  // Single definition of "what it means to load a version into the editor".
  // Called by the auto-sync effect (guarded by lastLoadedVersionIdRef) and
  // exposed to consumers for explicit reloads (e.g. Navigator version click).
  const hydrateFromVersion = useCallback(
    (version: PromptVersionSummary) => {
      setEditorText(version.prompt_text ?? '');
      setCommitMessageInput(version.commit_message ?? '');
      setVersionTagsInput((version.tags ?? []).join(', '));
      setInstructionInput('');
    },
    [setEditorText],
  );

  // ── Derived ──
  const selectedFamily = useMemo(
    () => families.find((f) => f.id === selectedFamilyId) ?? null,
    [families, selectedFamilyId],
  );
  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  // ── Actions ──
  const refreshFamilies = useCallback(async (preferredFamilyId?: string | null) => {
    setFamiliesLoading(true);
    setFamiliesError(null);
    try {
      const rows = await listPromptFamilies({ limit: 200, is_active: true, offset: 0 });
      setFamilies(rows);
      setSelectedFamilyId((current) => {
        const preferred = preferredFamilyId ?? current;
        if (preferred && rows.some((r) => r.id === preferred)) return preferred;
        return rows[0]?.id ?? null;
      });
    } catch (error) {
      setFamiliesError(error instanceof Error ? error.message : 'Failed to load prompt families');
      setFamilies([]);
      setSelectedFamilyId(null);
    } finally {
      setFamiliesLoading(false);
    }
  }, []);

  const refreshVersions = useCallback(
    async (familyId: string | null, preferredVersionId?: string | null) => {
      if (!familyId) {
        setVersions([]);
        setSelectedVersionId(null);
        return;
      }
      setVersionsLoading(true);
      setVersionsError(null);
      try {
        const rows = await listPromptVersions(familyId, { limit: 400, offset: 0 });
        const sorted = [...rows].sort((a, b) => b.version_number - a.version_number);
        setVersions(sorted);
        setSelectedVersionId((current) => {
          const preferred = preferredVersionId ?? current;
          if (preferred && sorted.some((r) => r.id === preferred)) return preferred;
          return sorted[0]?.id ?? null;
        });
      } catch (error) {
        setVersionsError(error instanceof Error ? error.message : 'Failed to load prompt versions');
        setVersions([]);
        setSelectedVersionId(null);
      } finally {
        setVersionsLoading(false);
      }
    },
    [],
  );

  // ── Effects ──

  useEffect(() => {
    void refreshFamilies();
  }, [refreshFamilies]);

  useEffect(() => {
    void refreshVersions(selectedFamilyId);
  }, [refreshVersions, selectedFamilyId]);

  useEffect(() => {
    let cancelled = false;
    void getPromptAuthoringContract('user')
      .then((contract) => {
        if (cancelled) return;
        setAuthoringModes(contract.authoring_modes ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setAuthoringModes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedVersion) {
      lastLoadedVersionIdRef.current = null;
      return;
    }
    if (lastLoadedVersionIdRef.current === selectedVersion.id) return;
    hydrateFromVersion(selectedVersion);
    lastLoadedVersionIdRef.current = selectedVersion.id;
  }, [selectedVersion, hydrateFromVersion]);

  // ── Asset scope ──

  const familyVersionIds = useMemo(
    () => versions.map((v) => v.id),
    [versions],
  );

  const branchVersionIds = useMemo(() => {
    if (!selectedVersionId) return [];
    const ids = collectBranchVersionIds(versionTimeline, selectedVersionId);
    if (ids.length <= 1) return [selectedVersionId];
    const familySet = new Set(familyVersionIds);
    return ids.filter((id) => familySet.has(id));
  }, [familyVersionIds, selectedVersionId, versionTimeline]);

  const targetVersionIds = useMemo(() => {
    if (scopeMode === 'family') return familyVersionIds;
    if (scopeMode === 'branch') return branchVersionIds;
    return selectedVersionId ? [selectedVersionId] : [];
  }, [branchVersionIds, familyVersionIds, scopeMode, selectedVersionId]);

  const scopedVersionIds = useMemo(
    () => targetVersionIds.slice(0, MAX_SCOPE_VERSION_IDS),
    [targetVersionIds],
  );
  const truncatedVersionCount = Math.max(0, targetVersionIds.length - scopedVersionIds.length);

  const refreshScopeAssets = useCallback(async () => {
    if (scopedVersionIds.length === 0) {
      setScopeAssets([]);
      setAssetsError(null);
      return;
    }
    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const responses = await Promise.all(
        scopedVersionIds.map((versionId) =>
          getPromptVersionAssets(versionId, { limit: 80 }),
        ),
      );
      const deduped = new Map<number, AssetModel>();
      responses.forEach((response) => {
        response.assets.forEach((raw) => {
          try {
            const model = fromAssetResponse(raw as AssetResponse);
            if (!deduped.has(model.id)) {
              deduped.set(model.id, model);
            }
          } catch {
            // skip malformed assets
          }
        });
      });
      const rows = Array.from(deduped.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setScopeAssets(rows);
    } catch (error) {
      setAssetsError(error instanceof Error ? error.message : 'Failed to load generated assets');
      setScopeAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, [scopedVersionIds]);

  useEffect(() => {
    void refreshScopeAssets();
  }, [refreshScopeAssets]);

  // ── Mutation actions ──

  const handleCreateFamily = useCallback(async () => {
    if (!newFamilyTitle.trim()) {
      setStatusMessage('Family title is required');
      return;
    }
    setBusyAction('family');
    setStatusMessage(null);
    try {
      const slugBase = newFamilyTitle
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      const created = await createPromptFamily({
        title: newFamilyTitle.trim(),
        prompt_type: newFamilyPromptType,
        slug: slugBase || undefined,
        category: newFamilyCategory.trim() || undefined,
        tags: parseTags(newFamilyTagsInput),
        primary_character_id: newFamilyCharacterId || undefined,
        authoring_mode_id: newFamilyCategory.trim() || undefined,
      });
      await refreshFamilies(created.id);
      setStatusMessage(`Family created: ${created.title}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to create family');
    } finally {
      setBusyAction(null);
    }
  }, [newFamilyCategory, newFamilyCharacterId, newFamilyPromptType, newFamilyTagsInput, newFamilyTitle, refreshFamilies]);

  const handleUpdateFamily = useCallback(async (
    familyId: string,
    data: { title?: string; description?: string; category?: string; tags?: string[]; is_active?: boolean; primary_character_id?: string | null },
  ) => {
    setStatusMessage(null);
    try {
      await updatePromptFamily(familyId, data);
      await refreshFamilies(familyId);
      setStatusMessage('Family updated');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to update family');
    }
  }, [refreshFamilies]);

  const handleCreateVersion = useCallback(async () => {
    if (!selectedFamilyId) {
      setStatusMessage('Select a family first');
      return;
    }
    if (!editorText.trim()) {
      setStatusMessage('Prompt text is required');
      return;
    }
    setBusyAction('version');
    setStatusMessage(null);
    try {
      const created = await createPromptVersion(selectedFamilyId, {
        prompt_text: editorText,
        commit_message: commitMessageInput.trim() || undefined,
        parent_version_id: selectedVersionId ?? undefined,
        tags: parseTags(versionTagsInput),
      });
      await refreshVersions(selectedFamilyId, created.id);
      setStatusMessage(`Version v${created.version_number} created`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to create version');
    } finally {
      setBusyAction(null);
    }
  }, [commitMessageInput, editorText, refreshVersions, selectedFamilyId, selectedVersionId, versionTagsInput]);

  const handleApplyEdit = useCallback(async () => {
    if (!selectedVersionId) {
      setStatusMessage('Select a source version to apply edit');
      return;
    }
    if (!editorText.trim()) {
      setStatusMessage('Prompt text is required');
      return;
    }
    setBusyAction('edit');
    setStatusMessage(null);
    try {
      const instruction = instructionInput.trim();
      const response = await applyPromptEdit(selectedVersionId, {
        prompt_text: editorText,
        instruction: instruction || undefined,
        edit_ops: instruction
          ? [{ intent: 'modify', target: 'prompt', note: instruction }]
          : [],
        commit_message: commitMessageInput.trim() || undefined,
        tags: parseTags(versionTagsInput),
      });
      if (selectedFamilyId) {
        await refreshVersions(selectedFamilyId, response.created_version.id);
      }
      setStatusMessage(
        `Applied edit -> v${response.created_version.version_number}: ${response.applied_edit.commit_message}`,
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to apply edit');
    } finally {
      setBusyAction(null);
    }
  }, [commitMessageInput, editorText, instructionInput, refreshVersions, selectedFamilyId, selectedVersionId, versionTagsInput]);

  // ── Assemble context value ──

  const value = useMemo<PromptAuthoringState>(
    () => ({
      families, familiesLoading, familiesError, selectedFamilyId, setSelectedFamilyId,
      newFamilyTitle, setNewFamilyTitle, newFamilyPromptType, setNewFamilyPromptType,
      newFamilyCategory, setNewFamilyCategory, newFamilyTagsInput, setNewFamilyTagsInput,
      newFamilyCharacterId, setNewFamilyCharacterId,
      versions, versionsLoading, versionsError, selectedVersionId, setSelectedVersionId,
      editorText, setEditorText, instructionInput, setInstructionInput,
      commitMessageInput, setCommitMessageInput, versionTagsInput, setVersionTagsInput,
      scopeMode, setScopeMode, scopeAssets, assetsLoading, assetsError,
      busyAction, statusMessage,
      authoringModes, selectedFamily, selectedVersion, targetVersionIds, truncatedVersionCount,
      refreshFamilies, refreshVersions, refreshScopeAssets,
      handleCreateFamily, handleUpdateFamily, handleCreateVersion, handleApplyEdit,
      hydrateFromVersion,
    }),
    [
      families, familiesLoading, familiesError, selectedFamilyId,
      newFamilyTitle, newFamilyPromptType, newFamilyCategory, newFamilyTagsInput, newFamilyCharacterId,
      versions, versionsLoading, versionsError, selectedVersionId,
      editorText, setEditorText, instructionInput, commitMessageInput, versionTagsInput,
      scopeMode, scopeAssets, assetsLoading, assetsError,
      busyAction, statusMessage,
      authoringModes, selectedFamily, selectedVersion, targetVersionIds, truncatedVersionCount,
      refreshFamilies, refreshVersions, refreshScopeAssets,
      handleCreateFamily, handleUpdateFamily, handleCreateVersion, handleApplyEdit,
      hydrateFromVersion,
    ],
  );

  return (
    <PromptAuthoringCtx.Provider value={value}>
      {children}
    </PromptAuthoringCtx.Provider>
  );
}
