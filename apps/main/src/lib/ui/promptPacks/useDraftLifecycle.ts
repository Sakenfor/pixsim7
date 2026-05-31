/**
 * useDraftLifecycle — versions + workflow state for a single draft.
 *
 * Owns:
 *   - the version list for the draft (loaded on mount + on refresh)
 *   - the catalog (so the hook can tell which versions are active)
 *   - selection of "the currently focused version"
 *   - busy flags for workflow vs activation actions (these are mutually
 *     exclusive in the workbench's UX and we preserve that here)
 *   - a `reviewNotes` text buffer for admin reject
 *   - one-line `activityMessage` surfaced to the parent for an inline log
 *
 * Returns named action handlers that wrap the prompt-pack API calls
 * and trigger a refresh on success. The parent renders the surface
 * (VersionsList + VersionDetailPanel) without owning any of the
 * boilerplate.
 *
 * Consumers:
 *   - features/panels/domain/definitions/authoring (Versions tab)
 *   - features/panels/domain/definitions/prompt-library-inspector
 *     workbench (planned refactor in a follow-up commit)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  activatePromptPackVersion,
  approvePromptPackVersion,
  createPromptPackVersion,
  deactivatePromptPackVersion,
  listPromptPackCatalog,
  listPromptPackVersions,
  publishPromptPackVersionPrivate,
  publishPromptPackVersionShared,
  rejectPromptPackVersion,
  submitPromptPackVersion,
  type PromptPackVersion,
} from '@lib/api/promptPacks';

function errText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export type WorkflowAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'publish-private'
  | 'publish-shared'
  | 'create-version';

export interface UseDraftLifecycleResult {
  versions: PromptPackVersion[];
  versionsLoading: boolean;
  versionsError: string | null;
  selectedVersionId: string | null;
  selectVersion: (id: string | null) => void;
  activeVersionIds: Set<string>;
  catalogLoading: boolean;
  workflowBusyAction: WorkflowAction | null;
  activationBusyVersionId: string | null;
  reviewNotes: string;
  setReviewNotes: (value: string) => void;
  activityMessage: string | null;

  refresh: () => Promise<void>;
  createVersion: () => Promise<PromptPackVersion | null>;
  activate: (versionId: string) => Promise<void>;
  deactivate: (versionId: string) => Promise<void>;
  submit: (versionId: string) => Promise<void>;
  publishPrivate: (versionId: string) => Promise<void>;
  publishShared: (versionId: string) => Promise<void>;
  approve: (versionId: string) => Promise<void>;
  reject: (versionId: string) => Promise<void>;
}

export function useDraftLifecycle(draftId: string | null): UseDraftLifecycleResult {
  const [versions, setVersions] = useState<PromptPackVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [activeVersionIds, setActiveVersionIds] = useState<Set<string>>(new Set());
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [workflowBusyAction, setWorkflowBusyAction] = useState<WorkflowAction | null>(null);
  const [activationBusyVersionId, setActivationBusyVersionId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [activityMessage, setActivityMessage] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── Loaders ────────────────────────────────────────────────────────
  const loadVersions = useCallback(async () => {
    if (!draftId) {
      setVersions([]);
      setSelectedVersionId(null);
      return;
    }
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const list = await listPromptPackVersions(draftId);
      if (!mounted.current) return;
      setVersions(list);
      // Keep current selection if still valid; otherwise default to first.
      setSelectedVersionId((prev) => {
        if (prev && list.some((v) => v.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (error) {
      if (mounted.current) {
        setVersionsError(errText(error, 'Failed to load versions'));
      }
    } finally {
      if (mounted.current) setVersionsLoading(false);
    }
  }, [draftId]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      // Self scope covers what we need for activation status of our drafts.
      const rows = await listPromptPackCatalog('self');
      if (!mounted.current) return;
      const ids = new Set<string>();
      for (const row of rows) {
        if (row.is_active && row.version_id) ids.add(row.version_id);
      }
      setActiveVersionIds(ids);
    } catch {
      // Catalog failure is non-fatal — leave previous activation state.
    } finally {
      if (mounted.current) setCatalogLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadVersions(), loadCatalog()]);
  }, [loadVersions, loadCatalog]);

  // Initial load whenever the draft changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Action plumbing ────────────────────────────────────────────────
  const runWorkflow = useCallback(
    async (
      action: WorkflowAction,
      task: () => Promise<unknown>,
      successMessage: string,
      failureFallback: string,
    ) => {
      setWorkflowBusyAction(action);
      setActivityMessage(null);
      try {
        await task();
        await refresh();
        if (mounted.current) setActivityMessage(successMessage);
      } catch (error) {
        if (mounted.current) {
          setActivityMessage(errText(error, failureFallback));
        }
      } finally {
        if (mounted.current) setWorkflowBusyAction(null);
      }
    },
    [refresh],
  );

  const runActivation = useCallback(
    async (
      versionId: string,
      task: () => Promise<unknown>,
      successMessage: string,
      failureFallback: string,
    ) => {
      setActivationBusyVersionId(versionId);
      setActivityMessage(null);
      try {
        await task();
        await loadCatalog();
        if (mounted.current) setActivityMessage(successMessage);
      } catch (error) {
        if (mounted.current) {
          setActivityMessage(errText(error, failureFallback));
        }
      } finally {
        if (mounted.current) setActivationBusyVersionId(null);
      }
    },
    [loadCatalog],
  );

  // ── Public actions ─────────────────────────────────────────────────
  const createVersion = useCallback(async (): Promise<PromptPackVersion | null> => {
    if (!draftId) return null;
    setWorkflowBusyAction('create-version');
    setActivityMessage(null);
    try {
      const created = await createPromptPackVersion(draftId);
      await refresh();
      if (mounted.current) {
        setSelectedVersionId(created.id);
        setActivityMessage(`Created v${created.version}`);
      }
      return created;
    } catch (error) {
      if (mounted.current) {
        setActivityMessage(errText(error, 'Failed to create version'));
      }
      return null;
    } finally {
      if (mounted.current) setWorkflowBusyAction(null);
    }
  }, [draftId, refresh]);

  const activate = useCallback(
    (versionId: string) =>
      runActivation(
        versionId,
        () => activatePromptPackVersion(versionId),
        'Activated.',
        'Failed to activate version',
      ),
    [runActivation],
  );

  const deactivate = useCallback(
    (versionId: string) =>
      runActivation(
        versionId,
        () => deactivatePromptPackVersion(versionId),
        'Deactivated.',
        'Failed to deactivate version',
      ),
    [runActivation],
  );

  const submit = useCallback(
    (versionId: string) =>
      runWorkflow(
        'submit',
        () => submitPromptPackVersion(versionId),
        'Submitted for review.',
        'Failed to submit version',
      ),
    [runWorkflow],
  );

  const publishPrivate = useCallback(
    (versionId: string) =>
      runWorkflow(
        'publish-private',
        () => publishPromptPackVersionPrivate(versionId),
        'Published as private.',
        'Failed to publish private version',
      ),
    [runWorkflow],
  );

  const publishShared = useCallback(
    (versionId: string) =>
      runWorkflow(
        'publish-shared',
        () => publishPromptPackVersionShared(versionId),
        'Published as shared.',
        'Failed to publish shared version',
      ),
    [runWorkflow],
  );

  const approve = useCallback(
    (versionId: string) =>
      runWorkflow(
        'approve',
        () => approvePromptPackVersion(versionId),
        'Approved.',
        'Failed to approve version',
      ),
    [runWorkflow],
  );

  const reject = useCallback(
    (versionId: string) =>
      runWorkflow(
        'reject',
        () => rejectPromptPackVersion(versionId, reviewNotes.trim() || null),
        'Rejected.',
        'Failed to reject version',
      ),
    [runWorkflow, reviewNotes],
  );

  // ── Memoize the result so consumers don't re-render on identity churn.
  return useMemo<UseDraftLifecycleResult>(
    () => ({
      versions,
      versionsLoading,
      versionsError,
      selectedVersionId,
      selectVersion: setSelectedVersionId,
      activeVersionIds,
      catalogLoading,
      workflowBusyAction,
      activationBusyVersionId,
      reviewNotes,
      setReviewNotes,
      activityMessage,
      refresh,
      createVersion,
      activate,
      deactivate,
      submit,
      publishPrivate,
      publishShared,
      approve,
      reject,
    }),
    [
      versions,
      versionsLoading,
      versionsError,
      selectedVersionId,
      activeVersionIds,
      catalogLoading,
      workflowBusyAction,
      activationBusyVersionId,
      reviewNotes,
      activityMessage,
      refresh,
      createVersion,
      activate,
      deactivate,
      submit,
      publishPrivate,
      publishShared,
      approve,
      reject,
    ],
  );
}
