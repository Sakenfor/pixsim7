import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  activatePromptPackVersion,
  approvePromptPackVersion,
  compilePromptPackDraft,
  createPromptPackDraft,
  createPromptPackVersion,
  deactivatePromptPackVersion,
  listPromptPackCatalog,
  listPromptPackDrafts,
  listPromptPackVersions,
  publishPromptPackVersionPrivate,
  publishPromptPackVersionShared,
  rejectPromptPackVersion,
  replacePromptPackDraftSource,
  submitPromptPackVersion,
  updatePromptPackDraft,
  validatePromptPackDraft,
  type PromptPackCatalogRow,
  type PromptPackCompileResponse,
  type PromptPackDraft,
  type PromptPackVersion,
} from '@lib/api/promptPacks';
import { isAdminUser } from '@lib/auth/userRoles';
import { Icon } from '@lib/icons';

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
  const [activityMessage, setActivityMessage] = useState<string | null>(null);

  const [versions, setVersions] = useState<PromptPackVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [creatingVersion, setCreatingVersion] = useState(false);

  const [catalogRows, setCatalogRows] = useState<PromptPackCatalogRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [activationBusyVersionId, setActivationBusyVersionId] = useState<string | null>(null);
  const [workflowBusyAction, setWorkflowBusyAction] = useState<string | null>(null);
  const [reviewNotesInput, setReviewNotesInput] = useState('');

  const [artifactTab, setArtifactTab] = useState<ArtifactTab>('schema');

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  );

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  );
  const selectedPublication = selectedVersion?.publication ?? null;

  const activeVersionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of catalogRows) {
      if (row.is_active && row.version_id) ids.add(row.version_id);
    }
    return ids;
  }, [catalogRows]);

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

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const rows = await listPromptPackCatalog('self');
      setCatalogRows(rows);
    } catch {
      setCatalogRows([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

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

  const refreshVersions = useCallback(async (draftId: string | null) => {
    if (!draftId) {
      setVersions([]);
      setSelectedVersionId(null);
      return;
    }
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const rows = await listPromptPackVersions(draftId, { limit: 200, offset: 0 });
      setVersions(rows);
      setSelectedVersionId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    } catch (error) {
      setVersionsError(errText(error, 'Failed to load versions'));
      setVersions([]);
      setSelectedVersionId(null);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDrafts();
    void refreshCatalog();
  }, [refreshCatalog, refreshDrafts]);

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

  useEffect(() => {
    setReviewNotesInput(selectedVersion?.publication?.review_notes ?? '');
  }, [selectedVersion?.id, selectedVersion?.publication?.review_notes]);

  useEffect(() => {
    void refreshVersions(selectedDraftId);
  }, [refreshVersions, selectedDraftId]);

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
    setActivityMessage(null);
    try {
      const created = await createPromptPackDraft({
        pack_slug: slug,
        cue_source: DEFAULT_CUE_SOURCE.replaceAll('my_pack', slug.replaceAll('-', '_')),
      });
      await refreshDrafts(created.id);
      setNewDraftSlug(slug);
      setActivityMessage(`Draft created: ${created.namespace}.${created.pack_slug}`);
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to create draft'));
    } finally {
      setCreatingDraft(false);
    }
  }, [newDraftSlug, refreshDrafts]);

  const onSaveMetadata = useCallback(async () => {
    if (!selectedDraft) return;
    setSavingMetadata(true);
    setActivityMessage(null);
    try {
      const updated = await updatePromptPackDraft(selectedDraft.id, {
        namespace: namespaceInput.trim(),
        pack_slug: slugInput.trim(),
      });
      upsertDraftInState(updated);
      setActivityMessage('Metadata saved');
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to save metadata'));
    } finally {
      setSavingMetadata(false);
    }
  }, [namespaceInput, selectedDraft, slugInput, upsertDraftInState]);

  const onSaveSource = useCallback(async () => {
    if (!selectedDraft) return;
    setSavingSource(true);
    setActivityMessage(null);
    try {
      const updated = await replacePromptPackDraftSource(selectedDraft.id, cueSource);
      upsertDraftInState(updated);
      setCompileResult(null);
      setActivityMessage('Source saved and compile state reset');
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to save source'));
    } finally {
      setSavingSource(false);
    }
  }, [cueSource, selectedDraft, upsertDraftInState]);

  const onValidateDraft = useCallback(async () => {
    if (!selectedDraft) return;
    setValidatingDraft(true);
    setActivityMessage(null);
    try {
      const response = await validatePromptPackDraft(selectedDraft.id);
      setCompileResult(response);
      await refreshDrafts(selectedDraft.id);
      setActivityMessage(response.ok ? 'Validation passed' : 'Validation failed');
    } catch (error) {
      setActivityMessage(errText(error, 'Validation failed'));
    } finally {
      setValidatingDraft(false);
    }
  }, [refreshDrafts, selectedDraft]);

  const onCompileDraft = useCallback(async () => {
    if (!selectedDraft) return;
    setCompilingDraft(true);
    setActivityMessage(null);
    try {
      const response = await compilePromptPackDraft(selectedDraft.id);
      setCompileResult(response);
      await refreshDrafts(selectedDraft.id);
      setActivityMessage(response.ok ? 'Compile succeeded' : 'Compile failed');
    } catch (error) {
      setActivityMessage(errText(error, 'Compile failed'));
    } finally {
      setCompilingDraft(false);
    }
  }, [refreshDrafts, selectedDraft]);

  const onCreateVersion = useCallback(async () => {
    if (!selectedDraft) return;
    setCreatingVersion(true);
    setActivityMessage(null);
    try {
      const created = await createPromptPackVersion(selectedDraft.id);
      await refreshVersions(selectedDraft.id);
      setSelectedVersionId(created.id);
      setActivityMessage(`Version v${created.version} created`);
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to create version'));
    } finally {
      setCreatingVersion(false);
    }
  }, [refreshVersions, selectedDraft]);

  const onActivateVersion = useCallback(async (versionId: string) => {
    setActivationBusyVersionId(versionId);
    setActivityMessage(null);
    try {
      const response = await activatePromptPackVersion(versionId);
      await refreshCatalog();
      setActivityMessage(
        `Activated ${response.source_pack} (created ${response.blocks_created}, updated ${response.blocks_updated})`,
      );
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to activate version'));
    } finally {
      setActivationBusyVersionId(null);
    }
  }, [refreshCatalog]);

  const onDeactivateVersion = useCallback(async (versionId: string) => {
    setActivationBusyVersionId(versionId);
    setActivityMessage(null);
    try {
      const response = await deactivatePromptPackVersion(versionId);
      await refreshCatalog();
      setActivityMessage(`Deactivated ${response.source_pack}`);
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to deactivate version'));
    } finally {
      setActivationBusyVersionId(null);
    }
  }, [refreshCatalog]);

  const refreshAfterWorkflowAction = useCallback(async (draftId: string, versionId: string) => {
    await Promise.all([
      refreshDrafts(draftId),
      refreshVersions(draftId),
      refreshCatalog(),
    ]);
    setSelectedVersionId(versionId);
  }, [refreshCatalog, refreshDrafts, refreshVersions]);

  const onSubmitVersion = useCallback(async (versionId: string) => {
    if (!selectedDraft) return;
    setWorkflowBusyAction(`submit:${versionId}`);
    setActivityMessage(null);
    try {
      await submitPromptPackVersion(versionId);
      await refreshAfterWorkflowAction(selectedDraft.id, versionId);
      setActivityMessage('Version submitted for review');
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to submit version'));
    } finally {
      setWorkflowBusyAction(null);
    }
  }, [refreshAfterWorkflowAction, selectedDraft]);

  const onApproveVersion = useCallback(async (versionId: string) => {
    if (!selectedDraft) return;
    setWorkflowBusyAction(`approve:${versionId}`);
    setActivityMessage(null);
    try {
      await approvePromptPackVersion(versionId);
      await refreshAfterWorkflowAction(selectedDraft.id, versionId);
      setActivityMessage('Version approved');
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to approve version'));
    } finally {
      setWorkflowBusyAction(null);
    }
  }, [refreshAfterWorkflowAction, selectedDraft]);

  const onRejectVersion = useCallback(async (versionId: string) => {
    if (!selectedDraft) return;
    setWorkflowBusyAction(`reject:${versionId}`);
    setActivityMessage(null);
    try {
      await rejectPromptPackVersion(versionId, reviewNotesInput);
      await refreshAfterWorkflowAction(selectedDraft.id, versionId);
      setActivityMessage('Version rejected');
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to reject version'));
    } finally {
      setWorkflowBusyAction(null);
    }
  }, [refreshAfterWorkflowAction, reviewNotesInput, selectedDraft]);

  const onPublishPrivateVersion = useCallback(async (versionId: string) => {
    if (!selectedDraft) return;
    setWorkflowBusyAction(`publish-private:${versionId}`);
    setActivityMessage(null);
    try {
      await publishPromptPackVersionPrivate(versionId);
      await refreshAfterWorkflowAction(selectedDraft.id, versionId);
      setActivityMessage('Version visibility set to private');
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to set private visibility'));
    } finally {
      setWorkflowBusyAction(null);
    }
  }, [refreshAfterWorkflowAction, selectedDraft]);

  const onPublishSharedVersion = useCallback(async (versionId: string) => {
    if (!selectedDraft) return;
    setWorkflowBusyAction(`publish-shared:${versionId}`);
    setActivityMessage(null);
    try {
      await publishPromptPackVersionShared(versionId);
      await refreshAfterWorkflowAction(selectedDraft.id, versionId);
      setActivityMessage('Version published to shared catalog');
    } catch (error) {
      setActivityMessage(errText(error, 'Failed to publish shared version'));
    } finally {
      setWorkflowBusyAction(null);
    }
  }, [refreshAfterWorkflowAction, selectedDraft]);

  const versionOwnerUserId = selectedVersion?.owner_user_id ?? null;
  const isVersionOwner = (
    versionOwnerUserId !== null
    && String(versionOwnerUserId) === String(currentUser?.id ?? '')
  );
  const canManagePublication = Boolean(isVersionOwner || isAdmin);
  const publicationVisibility = selectedPublication?.visibility ?? 'private';
  const publicationReviewStatus = selectedPublication?.review_status ?? 'draft';
  const publicationReviewNotes = selectedPublication?.review_notes ?? null;

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

        {draftsLoading && <div className="text-xs text-neutral-500">Loading drafts...</div>}
        {draftsError && <div className="text-xs text-red-600 dark:text-red-400">{draftsError}</div>}
        {!draftsLoading && !draftsError && drafts.length === 0 && (
          <div className="text-xs text-neutral-500">No drafts yet.</div>
        )}

        <div className="space-y-1">
          {drafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              onClick={() => setSelectedDraftId(draft.id)}
              className={clsx(
                'w-full text-left rounded border p-2',
                draft.id === selectedDraftId
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20'
                  : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800',
              )}
            >
              <div className="text-xs font-medium text-neutral-800 dark:text-neutral-100 truncate">
                {draft.pack_slug}
              </div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{draft.namespace}</div>
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                <span className="text-[10px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">
                  {draft.status}
                </span>
                {draft.last_compile_status && (
                  <span className="text-[10px] px-1 py-0.5 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300">
                    {draft.last_compile_status}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
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
                  onClick={() => void onCreateVersion()}
                  disabled={creatingVersion}
                  className="text-xs px-2 py-1 rounded border border-purple-200 text-purple-700 dark:border-purple-800/40 dark:text-purple-300 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="plus-square" size={12} />
                  {creatingVersion ? 'Creating...' : 'Create Version'}
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
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Versions & Activation</div>
                <button
                  type="button"
                  onClick={() => {
                    void refreshVersions(selectedDraft.id);
                    void refreshCatalog();
                  }}
                  className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 inline-flex items-center gap-1"
                >
                  <Icon name="refresh" size={11} />
                  Refresh
                </button>
              </div>

              {versionsError && <div className="text-xs text-red-600 dark:text-red-400">{versionsError}</div>}
              {versionsLoading && <div className="text-xs text-neutral-500">Loading versions...</div>}
              {!versionsLoading && versions.length === 0 && (
                <div className="text-xs text-neutral-500">No versions yet.</div>
              )}

              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {versions.map((version) => {
                    const isActive = activeVersionIds.has(version.id);
                    return (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => setSelectedVersionId(version.id)}
                        className={clsx(
                          'w-full text-left rounded border p-2',
                          version.id === selectedVersionId
                            ? 'border-blue-300 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20'
                            : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
                            v{version.version}
                          </span>
                          {isActive && (
                            <span className="text-[10px] px-1 py-0.5 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300">
                              active
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          {formatDate(version.created_at)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="w-56 rounded border border-neutral-200 dark:border-neutral-700 p-2 space-y-2">
                  {!selectedVersion && (
                    <div className="text-xs text-neutral-500">Select a version</div>
                  )}
                  {selectedVersion && (
                    <>
                      <div className="text-xs text-neutral-600 dark:text-neutral-300">
                        Version <span className="font-medium">v{selectedVersion.version}</span>
                      </div>
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 break-all">
                        {selectedVersion.id}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300">
                          visibility: {publicationVisibility}
                        </span>
                        <span className="text-[10px] px-1 py-0.5 rounded border border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300">
                          review: {publicationReviewStatus}
                        </span>
                      </div>
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        owner: {selectedVersion.owner_username ?? selectedVersion.owner_ref ?? `user:${selectedVersion.owner_user_id}`}
                      </div>
                      {selectedPublication?.reviewed_at && (
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          reviewed: {formatDate(selectedPublication.reviewed_at)}
                        </div>
                      )}
                      {publicationReviewNotes && (
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          notes: {publicationReviewNotes}
                        </div>
                      )}
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        {activeVersionIds.has(selectedVersion.id) ? 'Currently active' : 'Currently inactive'}
                      </div>
                      <button
                        type="button"
                        onClick={() => void onActivateVersion(selectedVersion.id)}
                        disabled={activationBusyVersionId === selectedVersion.id || activeVersionIds.has(selectedVersion.id)}
                        className="w-full text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                      >
                        <Icon name="play" size={11} />
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeactivateVersion(selectedVersion.id)}
                        disabled={activationBusyVersionId === selectedVersion.id || !activeVersionIds.has(selectedVersion.id)}
                        className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                      >
                        <Icon name="pause" size={11} />
                        Deactivate
                      </button>
                      <button
                        type="button"
                        onClick={() => void onSubmitVersion(selectedVersion.id)}
                        disabled={
                          !isVersionOwner
                          || workflowBusyAction !== null
                          || publicationReviewStatus === 'submitted'
                        }
                        className="w-full text-xs px-2 py-1 rounded border border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                      >
                        <Icon name="upload" size={11} />
                        Submit for Review
                      </button>
                      <button
                        type="button"
                        onClick={() => void onPublishPrivateVersion(selectedVersion.id)}
                        disabled={!canManagePublication || workflowBusyAction !== null || publicationVisibility === 'private'}
                        className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                      >
                        <Icon name="lock" size={11} />
                        Publish Private
                      </button>
                      <button
                        type="button"
                        onClick={() => void onPublishSharedVersion(selectedVersion.id)}
                        disabled={
                          !canManagePublication
                          || workflowBusyAction !== null
                          || publicationReviewStatus !== 'approved'
                          || publicationVisibility === 'shared'
                        }
                        className="w-full text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                      >
                        <Icon name="users" size={11} />
                        Publish Shared
                      </button>
                      {isAdmin && (
                        <>
                          <textarea
                            value={reviewNotesInput}
                            onChange={(event) => setReviewNotesInput(event.target.value)}
                            placeholder="review notes (optional)"
                            className="w-full h-16 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-[10px]"
                          />
                          <button
                            type="button"
                            onClick={() => void onApproveVersion(selectedVersion.id)}
                            disabled={workflowBusyAction !== null || publicationReviewStatus !== 'submitted'}
                            className="w-full text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                          >
                            <Icon name="check-square" size={11} />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void onRejectVersion(selectedVersion.id)}
                            disabled={
                              workflowBusyAction !== null
                              || !['submitted', 'approved'].includes(publicationReviewStatus)
                            }
                            className="w-full text-xs px-2 py-1 rounded border border-red-200 text-red-700 dark:border-red-800/40 dark:text-red-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                          >
                            <Icon name="x" size={11} />
                            Reject
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {catalogLoading && (
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Refreshing catalog...</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
