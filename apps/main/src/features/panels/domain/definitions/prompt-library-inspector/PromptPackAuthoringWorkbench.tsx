import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  compilePromptPackDraft,
  createPromptPackDraft,
  listPromptPackDrafts,
  replacePromptPackDraftSource,
  updatePromptPackDraft,
  validatePromptPackDraft,
  type PromptPackCompileResponse,
  type PromptPackDraft,
} from '@lib/api/promptPacks';
import { isAdminUser } from '@lib/auth/userRoles';
import { Icon } from '@lib/icons';
import {
  DraftsList,
  VersionDetailPanel,
  VersionsList,
  useDraftLifecycle,
} from '@lib/ui/promptPacks';

import { useAuthStore } from '@/stores/authStore';

const DEFAULT_CUE_SOURCE = `pack: {
  package_name: "my_pack"
  blocks: []
}

manifest: {
  id: "my_pack"
  matrix_presets: []
}
`;

type ArtifactTab = 'schema' | 'manifest' | 'blocks';

function normalizePackSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized;
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function errText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export function PromptPackAuthoringWorkbench() {
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = isAdminUser(currentUser);

  const [drafts, setDrafts] = useState<PromptPackDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [newDraftSlug, setNewDraftSlug] = useState('my-pack');
  const [creatingDraft, setCreatingDraft] = useState(false);

  const [namespaceInput, setNamespaceInput] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [cueSource, setCueSource] = useState('');

  const [savingMetadata, setSavingMetadata] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [validatingDraft, setValidatingDraft] = useState(false);
  const [compilingDraft, setCompilingDraft] = useState(false);

  const [compileResult, setCompileResult] = useState<PromptPackCompileResponse | null>(null);
  const [editorActivityMessage, setEditorActivityMessage] = useState<string | null>(null);

  const [artifactTab, setArtifactTab] = useState<ArtifactTab>('schema');

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  );

  // ── Lifecycle (versions + publication workflow) ─────────────────────
  // Owned by the shared `useDraftLifecycle` hook so this surface and
  // Block Authoring's Versions tab share identical action plumbing.
  const lifecycle = useDraftLifecycle(selectedDraftId ?? null);
  const selectedVersion = useMemo(
    () => lifecycle.versions.find((version) => version.id === lifecycle.selectedVersionId) ?? null,
    [lifecycle.versions, lifecycle.selectedVersionId],
  );
  const selectedPublication = selectedVersion?.publication ?? null;
  const activeVersionIds = lifecycle.activeVersionIds;

  // Surface either the editor's local message or the lifecycle hook's,
  // preferring whichever was set most recently (the hook clears its
  // message at the start of each action, so when both exist the editor
  // message is the older one).
  const activityMessage = lifecycle.activityMessage ?? editorActivityMessage;

  const diagnostics = useMemo(() => {
    if (compileResult?.diagnostics?.length) return compileResult.diagnostics;
    return selectedDraft?.last_compile_errors ?? [];
  }, [compileResult, selectedDraft]);

  const schemaArtifact =
    compileResult?.pack_yaml
    ?? selectedVersion?.compiled_schema_yaml
    ?? '';
  const manifestArtifact =
    compileResult?.manifest_yaml
    ?? selectedVersion?.compiled_manifest_yaml
    ?? '';
  const blocksArtifact = useMemo(() => {
    if (compileResult?.blocks_json) return compileResult.blocks_json;
    if (selectedVersion?.compiled_blocks_json) return selectedVersion.compiled_blocks_json;
    return [];
  }, [compileResult?.blocks_json, selectedVersion?.compiled_blocks_json]);

  const refreshDrafts = useCallback(async (preferredDraftId?: string | null) => {
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const rows = await listPromptPackDrafts({ mine: true, limit: 200, offset: 0 });
      setDrafts(rows);
      setSelectedDraftId((current) => {
        const candidate = preferredDraftId ?? current;
        if (candidate && rows.some((row) => row.id === candidate)) return candidate;
        return rows[0]?.id ?? null;
      });
    } catch (error) {
      setDraftsError(errText(error, 'Failed to load drafts'));
      setDrafts([]);
      setSelectedDraftId(null);
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  useEffect(() => {
    if (!selectedDraft) {
      setNamespaceInput('');
      setSlugInput('');
      setCueSource('');
      setCompileResult(null);
      return;
    }
    setNamespaceInput(selectedDraft.namespace);
    setSlugInput(selectedDraft.pack_slug);
    setCueSource(selectedDraft.cue_source);
    setCompileResult(null);
  }, [selectedDraft]);

  // Sync the admin review-notes buffer with the selected publication.
  useEffect(() => {
    lifecycle.setReviewNotes(selectedVersion?.publication?.review_notes ?? '');
    // Only resync when the underlying publication changes — not on every
    // local edit, which is what lifecycle owns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion?.id, selectedVersion?.publication?.review_notes]);

  const upsertDraftInState = useCallback((nextDraft: PromptPackDraft) => {
    setDrafts((current) => {
      const index = current.findIndex((draft) => draft.id === nextDraft.id);
      if (index === -1) return [nextDraft, ...current];
      const copy = [...current];
      copy[index] = nextDraft;
      return copy;
    });
  }, []);

  const onCreateDraft = useCallback(async () => {
    const slug = normalizePackSlug(newDraftSlug) || `pack-${Date.now()}`;
    setCreatingDraft(true);
    setEditorActivityMessage(null);
    try {
      const created = await createPromptPackDraft({
        pack_slug: slug,
        cue_source: DEFAULT_CUE_SOURCE.replaceAll('my_pack', slug.replaceAll('-', '_')),
      });
      await refreshDrafts(created.id);
      setNewDraftSlug(slug);
      setEditorActivityMessage(`Draft created: ${created.namespace}.${created.pack_slug}`);
    } catch (error) {
      setEditorActivityMessage(errText(error, 'Failed to create draft'));
    } finally {
      setCreatingDraft(false);
    }
  }, [newDraftSlug, refreshDrafts]);

  const onSaveMetadata = useCallback(async () => {
    if (!selectedDraft) return;
    setSavingMetadata(true);
    setEditorActivityMessage(null);
    try {
      const updated = await updatePromptPackDraft(selectedDraft.id, {
        namespace: namespaceInput.trim(),
        pack_slug: slugInput.trim(),
      });
      upsertDraftInState(updated);
      setEditorActivityMessage('Metadata saved');
    } catch (error) {
      setEditorActivityMessage(errText(error, 'Failed to save metadata'));
    } finally {
      setSavingMetadata(false);
    }
  }, [namespaceInput, selectedDraft, slugInput, upsertDraftInState]);

  const onSaveSource = useCallback(async () => {
    if (!selectedDraft) return;
    setSavingSource(true);
    setEditorActivityMessage(null);
    try {
      const updated = await replacePromptPackDraftSource(selectedDraft.id, cueSource);
      upsertDraftInState(updated);
      setCompileResult(null);
      setEditorActivityMessage('Source saved and compile state reset');
    } catch (error) {
      setEditorActivityMessage(errText(error, 'Failed to save source'));
    } finally {
      setSavingSource(false);
    }
  }, [cueSource, selectedDraft, upsertDraftInState]);

  const onValidateDraft = useCallback(async () => {
    if (!selectedDraft) return;
    setValidatingDraft(true);
    setEditorActivityMessage(null);
    try {
      const response = await validatePromptPackDraft(selectedDraft.id);
      setCompileResult(response);
      await refreshDrafts(selectedDraft.id);
      setEditorActivityMessage(response.ok ? 'Validation passed' : 'Validation failed');
    } catch (error) {
      setEditorActivityMessage(errText(error, 'Validation failed'));
    } finally {
      setValidatingDraft(false);
    }
  }, [refreshDrafts, selectedDraft]);

  const onCompileDraft = useCallback(async () => {
    if (!selectedDraft) return;
    setCompilingDraft(true);
    setEditorActivityMessage(null);
    try {
      const response = await compilePromptPackDraft(selectedDraft.id);
      setCompileResult(response);
      await refreshDrafts(selectedDraft.id);
      setEditorActivityMessage(response.ok ? 'Compile succeeded' : 'Compile failed');
    } catch (error) {
      setEditorActivityMessage(errText(error, 'Compile failed'));
    } finally {
      setCompilingDraft(false);
    }
  }, [refreshDrafts, selectedDraft]);

  const versionOwnerUserId = selectedVersion?.owner_user_id ?? null;
  const isVersionOwner = (
    versionOwnerUserId !== null
    && String(versionOwnerUserId) === String(currentUser?.id ?? '')
  );
  const canManagePublication = Boolean(isVersionOwner || isAdmin);

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="w-80 shrink-0 border-r border-neutral-200 dark:border-neutral-800 p-3 space-y-3 overflow-y-auto">
        <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/40 p-2 space-y-2">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">New Draft</div>
          <input
            value={newDraftSlug}
            onChange={(event) => setNewDraftSlug(event.target.value)}
            placeholder="pack slug"
            className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => void onCreateDraft()}
            disabled={creatingDraft}
            className="w-full text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300 inline-flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Icon name="plus" size={12} />
            {creatingDraft ? 'Creating...' : 'Create Draft'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Drafts</div>
          <button
            type="button"
            onClick={() => void refreshDrafts(selectedDraftId)}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 inline-flex items-center gap-1"
          >
            <Icon name="refresh" size={11} />
            Refresh
          </button>
        </div>

        <DraftsList
          drafts={drafts}
          selectedId={selectedDraftId}
          onSelect={setSelectedDraftId}
          loading={draftsLoading}
          error={draftsError}
        />
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-3 space-y-3">
        {!selectedDraft && (
          <div className="text-sm text-neutral-500">Select a draft to begin authoring.</div>
        )}

        {selectedDraft && (
          <>
            <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Authoring</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Private-by-default CUE draft workflow
                  </div>
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Updated: {formatDate(selectedDraft.updated_at)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-neutral-600 dark:text-neutral-300">
                  Namespace
                  <input
                    value={namespaceInput}
                    onChange={(event) => setNamespaceInput(event.target.value)}
                    className="mt-1 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
                  />
                </label>
                <label className="text-xs text-neutral-600 dark:text-neutral-300">
                  Pack Slug
                  <input
                    value={slugInput}
                    onChange={(event) => setSlugInput(event.target.value)}
                    className="mt-1 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
                  />
                </label>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void onSaveMetadata()}
                  disabled={savingMetadata}
                  className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="save" size={12} />
                  {savingMetadata ? 'Saving...' : 'Save Metadata'}
                </button>
                <button
                  type="button"
                  onClick={() => void onSaveSource()}
                  disabled={savingSource}
                  className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="file-code" size={12} />
                  {savingSource ? 'Saving...' : 'Save Source'}
                </button>
                <button
                  type="button"
                  onClick={() => void onValidateDraft()}
                  disabled={validatingDraft}
                  className="text-xs px-2 py-1 rounded border border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="check-square" size={12} />
                  {validatingDraft ? 'Validating...' : 'Validate'}
                </button>
                <button
                  type="button"
                  onClick={() => void onCompileDraft()}
                  disabled={compilingDraft}
                  className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="play" size={12} />
                  {compilingDraft ? 'Compiling...' : 'Compile'}
                </button>
                <button
                  type="button"
                  onClick={() => void lifecycle.createVersion()}
                  disabled={lifecycle.workflowBusyAction === 'create-version'}
                  className="text-xs px-2 py-1 rounded border border-purple-200 text-purple-700 dark:border-purple-800/40 dark:text-purple-300 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="plus-square" size={12} />
                  {lifecycle.workflowBusyAction === 'create-version'
                    ? 'Creating...'
                    : 'Create Version'}
                </button>
              </div>

              {activityMessage && (
                <div className="text-xs text-neutral-600 dark:text-neutral-300">{activityMessage}</div>
              )}
            </div>

            <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3 space-y-2">
              <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">CUE Source</div>
              <textarea
                value={cueSource}
                onChange={(event) => setCueSource(event.target.value)}
                className="w-full h-72 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 font-mono text-xs"
                spellCheck={false}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3 space-y-2">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  Diagnostics ({diagnostics.length})
                </div>
                {diagnostics.length === 0 && (
                  <div className="text-xs text-neutral-500">No diagnostics yet.</div>
                )}
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {diagnostics.map((diag, index) => {
                    const row = diag as Record<string, unknown>;
                    const code = typeof row.code === 'string' ? row.code : 'diagnostic';
                    const message = typeof row.message === 'string' ? row.message : toJson(row);
                    const line = typeof row.line === 'number' ? row.line : null;
                    const column = typeof row.column === 'number' ? row.column : null;
                    return (
                      <div
                        key={`${code}:${index}`}
                        className="rounded border border-neutral-200 dark:border-neutral-700 p-2 text-xs"
                      >
                        <div className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">{code}</div>
                        <div className="text-neutral-700 dark:text-neutral-200">{message}</div>
                        {(line !== null || column !== null) && (
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            line {line ?? '-'} col {column ?? '-'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3 space-y-2">
                <div className="flex items-center gap-1">
                  {([
                    ['schema', 'Schema'],
                    ['manifest', 'Manifest'],
                    ['blocks', 'Blocks'],
                  ] as Array<[ArtifactTab, string]>).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setArtifactTab(id)}
                      className={clsx(
                        'text-xs px-2 py-1 rounded border',
                        artifactTab === id
                          ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300'
                          : 'border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {artifactTab === 'schema' && (
                  <pre className="max-h-64 overflow-auto rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px] text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
                    {schemaArtifact || '# No schema artifact yet'}
                  </pre>
                )}
                {artifactTab === 'manifest' && (
                  <pre className="max-h-64 overflow-auto rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px] text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
                    {manifestArtifact || '# No manifest artifact yet'}
                  </pre>
                )}
                {artifactTab === 'blocks' && (
                  <pre className="max-h-64 overflow-auto rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px] text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
                    {toJson(blocksArtifact)}
                  </pre>
                )}
              </div>
            </div>

            <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  Versions & Activation
                </div>
                <button
                  type="button"
                  onClick={() => void lifecycle.refresh()}
                  className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 inline-flex items-center gap-1"
                >
                  <Icon name="refresh" size={11} />
                  Refresh
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div className="max-h-64 overflow-y-auto">
                  <VersionsList
                    versions={lifecycle.versions}
                    selectedId={lifecycle.selectedVersionId}
                    onSelect={lifecycle.selectVersion}
                    activeVersionIds={activeVersionIds}
                    loading={lifecycle.versionsLoading}
                    error={lifecycle.versionsError}
                  />
                </div>

                {selectedVersion ? (
                  <VersionDetailPanel
                    version={selectedVersion}
                    publication={selectedPublication}
                    isActive={activeVersionIds.has(selectedVersion.id)}
                    canManagePublication={canManagePublication}
                    isAdmin={isAdmin}
                    isVersionOwner={isVersionOwner}
                    workflowBusy={lifecycle.workflowBusyAction !== null}
                    activationBusy={lifecycle.activationBusyVersionId === selectedVersion.id}
                    reviewNotes={lifecycle.reviewNotes}
                    onReviewNotesChange={lifecycle.setReviewNotes}
                    onActivate={() => void lifecycle.activate(selectedVersion.id)}
                    onDeactivate={() => void lifecycle.deactivate(selectedVersion.id)}
                    onSubmit={() => void lifecycle.submit(selectedVersion.id)}
                    onPublishPrivate={() => void lifecycle.publishPrivate(selectedVersion.id)}
                    onPublishShared={() => void lifecycle.publishShared(selectedVersion.id)}
                    onApprove={
                      isAdmin ? () => void lifecycle.approve(selectedVersion.id) : undefined
                    }
                    onReject={
                      isAdmin ? () => void lifecycle.reject(selectedVersion.id) : undefined
                    }
                  />
                ) : (
                  <div className="w-56 rounded border border-neutral-200 dark:border-neutral-700 p-2 text-xs text-neutral-500">
                    Select a version
                  </div>
                )}
              </div>
              {lifecycle.catalogLoading && (
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  Refreshing catalog...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
