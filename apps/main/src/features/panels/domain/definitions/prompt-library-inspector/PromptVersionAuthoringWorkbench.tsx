import { DisclosureSection } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import {
  applyPromptEdit,
  createPromptFamily,
  createPromptVersion,
  getPromptVersionAssets,
  listPromptFamilies,
  listPromptVersions,
  type PromptFamilySummary,
  type PromptVersionAsset,
  type PromptVersionSummary,
} from '@lib/api/prompts';
import { Icon } from '@lib/icons';
import { useVersions } from '@lib/ui/versioning';

import { PromptComposer } from '@features/prompts';

type AssetScopeMode = 'version' | 'branch' | 'family';

interface ScopedAssetItem extends PromptVersionAsset {
  version_id: string;
}

const MAX_SCOPE_VERSION_IDS = 16;

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function collectBranchVersionIds(versionEntries: Array<{ entityId: string | number; parentId: string | number | null }>, rootId: string): string[] {
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

export function PromptVersionAuthoringWorkbench() {
  const [families, setFamilies] = useState<PromptFamilySummary[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [familiesError, setFamiliesError] = useState<string | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  const [versions, setVersions] = useState<PromptVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [editorText, setEditorText] = useState('');
  const [instructionInput, setInstructionInput] = useState('');
  const [commitMessageInput, setCommitMessageInput] = useState('');
  const [versionTagsInput, setVersionTagsInput] = useState('');

  const [newFamilyTitle, setNewFamilyTitle] = useState('');
  const [newFamilyPromptType, setNewFamilyPromptType] = useState<'visual' | 'narrative' | 'hybrid'>('visual');
  const [newFamilyCategory, setNewFamilyCategory] = useState('');
  const [newFamilyTagsInput, setNewFamilyTagsInput] = useState('');

  const [scopeMode, setScopeMode] = useState<AssetScopeMode>('version');
  const [scopeAssets, setScopeAssets] = useState<ScopedAssetItem[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState<'family' | 'version' | 'edit' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const lastLoadedVersionIdRef = useRef<string | null>(null);
  const { versions: versionTimeline } = useVersions('prompt', selectedFamilyId);

  const selectedFamily = useMemo(
    () => families.find((family) => family.id === selectedFamilyId) ?? null,
    [families, selectedFamilyId],
  );
  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  const refreshFamilies = useCallback(async (preferredFamilyId?: string | null) => {
    setFamiliesLoading(true);
    setFamiliesError(null);
    try {
      const rows = await listPromptFamilies({ limit: 200, is_active: true, offset: 0 });
      setFamilies(rows);
      setSelectedFamilyId((current) => {
        const preferred = preferredFamilyId ?? current;
        if (preferred && rows.some((row) => row.id === preferred)) return preferred;
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
          if (preferred && sorted.some((row) => row.id === preferred)) return preferred;
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

  useEffect(() => {
    void refreshFamilies();
  }, [refreshFamilies]);

  useEffect(() => {
    void refreshVersions(selectedFamilyId);
  }, [refreshVersions, selectedFamilyId]);

  useEffect(() => {
    if (!selectedVersion) {
      lastLoadedVersionIdRef.current = null;
      return;
    }
    if (lastLoadedVersionIdRef.current === selectedVersion.id) {
      return;
    }
    setEditorText(selectedVersion.prompt_text ?? '');
    setCommitMessageInput(selectedVersion.commit_message ?? '');
    setVersionTagsInput((selectedVersion.tags ?? []).join(', '));
    setInstructionInput('');
    lastLoadedVersionIdRef.current = selectedVersion.id;
  }, [selectedVersion]);

  const familyVersionIds = useMemo(
    () => versions.map((version) => version.id),
    [versions],
  );
  const branchVersionIds = useMemo(() => {
    if (!selectedVersionId) return [];
    const ids = collectBranchVersionIds(versionTimeline, selectedVersionId);
    if (ids.length <= 1) {
      return [selectedVersionId];
    }
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
      const deduped = new Map<number, ScopedAssetItem>();
      responses.forEach((response) => {
        response.assets.forEach((asset) => {
          const existing = deduped.get(asset.id);
          const next: ScopedAssetItem = { ...asset, version_id: response.version_id };
          if (!existing) {
            deduped.set(asset.id, next);
            return;
          }
          const existingDate = new Date(existing.created_at).getTime();
          const nextDate = new Date(next.created_at).getTime();
          if (nextDate > existingDate) {
            deduped.set(asset.id, next);
          }
        });
      });
      const rows = Array.from(deduped.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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
      });
      await refreshFamilies(created.id);
      setStatusMessage(`Family created: ${created.title}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to create family');
    } finally {
      setBusyAction(null);
    }
  }, [newFamilyCategory, newFamilyPromptType, newFamilyTagsInput, newFamilyTitle, refreshFamilies]);

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

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_360px] gap-3 p-3 bg-neutral-50 dark:bg-neutral-900">
      <section className="min-h-0 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 flex flex-col">
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Prompt Families</div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Select a family, then select a version branch source.
          </div>
        </div>
        <div className="p-3 space-y-2 border-b border-neutral-200 dark:border-neutral-800">
          <input
            value={newFamilyTitle}
            onChange={(event) => setNewFamilyTitle(event.target.value)}
            placeholder="New family title..."
            className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newFamilyPromptType}
              onChange={(event) => setNewFamilyPromptType(event.target.value as 'visual' | 'narrative' | 'hybrid')}
              className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            >
              <option value="visual">visual</option>
              <option value="narrative">narrative</option>
              <option value="hybrid">hybrid</option>
            </select>
            <input
              value={newFamilyCategory}
              onChange={(event) => setNewFamilyCategory(event.target.value)}
              placeholder="Category"
              className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            />
          </div>
          <input
            value={newFamilyTagsInput}
            onChange={(event) => setNewFamilyTagsInput(event.target.value)}
            placeholder="family tags (comma separated)"
            className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCreateFamily()}
              disabled={busyAction === 'family'}
              className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 disabled:opacity-60"
            >
              {busyAction === 'family' ? 'Creating...' : 'Create family'}
            </button>
            <button
              type="button"
              onClick={() => void refreshFamilies(selectedFamilyId)}
              disabled={familiesLoading}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
            >
              <Icon name="refresh" size={12} />
            </button>
          </div>
          {familiesError && (
            <div className="text-[11px] text-red-600 dark:text-red-300">{familiesError}</div>
          )}
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <DisclosureSection
            label="Families"
            defaultOpen
            fillHeight
            badge={families.length > 0 ? <span className="text-[10px] text-neutral-500 dark:text-neutral-400">({families.length})</span> : undefined}
            className="border-b border-neutral-200 dark:border-neutral-800"
            headerClassName="px-3"
            contentClassName="!mt-0"
          >
            {families.length === 0 && !familiesLoading ? (
              <div className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                No prompt families found.
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {families.map((family) => (
                  <button
                    key={family.id}
                    type="button"
                    onClick={() => setSelectedFamilyId(family.id)}
                    className={clsx(
                      'w-full text-left px-2 py-1.5 rounded border text-xs',
                      selectedFamilyId === family.id
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200',
                    )}
                  >
                    <div className="font-medium truncate">{family.title}</div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                      {family.slug} | {family.prompt_type}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DisclosureSection>

          <DisclosureSection
            label="Versions"
            defaultOpen
            fillHeight
            badge={versions.length > 0 ? <span className="text-[10px] text-neutral-500 dark:text-neutral-400">({versions.length})</span> : undefined}
            headerClassName="px-3"
            contentClassName="!mt-0"
          >
            {versionsError && (
              <div className="px-3 py-2 text-[11px] text-red-600 dark:text-red-300">{versionsError}</div>
            )}
            {versions.length === 0 && !versionsLoading ? (
              <div className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                Select a family to view versions.
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setSelectedVersionId(version.id)}
                    className={clsx(
                      'w-full text-left px-2 py-1.5 rounded border text-xs',
                      selectedVersionId === version.id
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200',
                    )}
                  >
                    <div className="font-medium truncate">
                      v{version.version_number}
                      <span className="ml-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                        {version.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                      {version.commit_message || 'No commit message'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DisclosureSection>
        </div>
      </section>

      <section className="min-h-0 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 flex flex-col">
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Prompt Authoring</div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {selectedFamily
              ? `${selectedFamily.title} (${selectedFamily.prompt_type})`
              : 'Create or select a family to start authoring.'}
          </div>
        </div>
        <div className="p-3 space-y-2 border-b border-neutral-200 dark:border-neutral-800">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={instructionInput}
              onChange={(event) => setInstructionInput(event.target.value)}
              placeholder="Instruction (optional)"
              className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            />
            <input
              value={commitMessageInput}
              onChange={(event) => setCommitMessageInput(event.target.value)}
              placeholder="Commit message"
              className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            />
            <input
              value={versionTagsInput}
              onChange={(event) => setVersionTagsInput(event.target.value)}
              placeholder="version tags (comma separated)"
              className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCreateVersion()}
              disabled={busyAction === 'version' || !selectedFamilyId}
              className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 disabled:opacity-60"
            >
              {busyAction === 'version' ? 'Saving...' : 'Create version'}
            </button>
            <button
              type="button"
              onClick={() => void handleApplyEdit()}
              disabled={busyAction === 'edit' || !selectedVersionId}
              className="text-xs px-2 py-1 rounded border border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800/60 dark:bg-violet-900/20 dark:text-violet-300 disabled:opacity-60"
            >
              {busyAction === 'edit' ? 'Applying...' : 'Apply edit as child'}
            </button>
            <button
              type="button"
              onClick={() => void refreshVersions(selectedFamilyId, selectedVersionId)}
              disabled={!selectedFamilyId || versionsLoading}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
            >
              Refresh versions
            </button>
            {selectedVersion && (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Selected: v{selectedVersion.version_number} | {selectedVersion.id.slice(0, 8)} | {formatDate(selectedVersion.created_at)}
              </span>
            )}
          </div>
          {statusMessage && (
            <div className="text-[11px] text-neutral-600 dark:text-neutral-300">{statusMessage}</div>
          )}
        </div>
        <div className="flex-1 min-h-0 p-3">
          <PromptComposer
            value={editorText}
            onChange={setEditorText}
            maxChars={12000}
            placeholder="Write or revise prompt prose..."
            className="h-full"
            variant="default"
            showCounter
            resizable
            minHeight={260}
          />
        </div>
      </section>

      <section className="min-h-0 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 flex flex-col">
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Generated Assets</div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Branch-aware scope filters for prompt outputs.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refreshScopeAssets()}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
            >
              <Icon name="refresh" size={12} />
            </button>
          </div>
          <div className="flex items-center gap-1 mt-2">
            {([
              ['version', 'This version'],
              ['branch', 'This branch'],
              ['family', 'Whole family'],
            ] as Array<[AssetScopeMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setScopeMode(mode)}
                className={clsx(
                  'text-[11px] px-2 py-1 rounded border',
                  scopeMode === mode
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
            Scope versions: {targetVersionIds.length}
            {truncatedVersionCount > 0 ? ` (showing latest ${MAX_SCOPE_VERSION_IDS})` : ''}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {assetsError && (
            <div className="text-[11px] text-red-600 dark:text-red-300 mb-2">{assetsError}</div>
          )}
          {assetsLoading && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Loading assets...</div>
          )}
          {!assetsLoading && scopeAssets.length === 0 && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              No assets found for the current scope.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {scopeAssets.map((asset) => {
              const src = asset.thumbnail_url || asset.remote_url || null;
              return (
                <div
                  key={`${asset.id}:${asset.version_id}`}
                  className="rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-100 dark:bg-neutral-800"
                  title={`Asset ${asset.id} | version ${asset.version_id}`}
                >
                  <div className="aspect-square bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
                    {src ? (
                      <img
                        src={src}
                        alt={`Asset ${asset.id}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        no preview
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-300 space-y-0.5">
                    <div className="font-medium text-neutral-700 dark:text-neutral-200">
                      #{asset.id} | {asset.media_type}
                    </div>
                    <div className="truncate">v:{asset.version_id.slice(0, 8)}</div>
                    <div>{formatDate(asset.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
