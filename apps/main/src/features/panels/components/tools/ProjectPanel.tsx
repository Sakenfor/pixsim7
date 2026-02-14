import { Button, useToast } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import {
  deleteSavedGameProject,
  deleteProjectDraft,
  duplicateSavedGameProject,
  getProjectDraft,
  getSavedGameProject,
  listSavedGameProjects,
  renameSavedGameProject,
  saveGameProject,
} from '@lib/api';
import {
  clearAuthoringProjectBundleDirtyState,
  clearDraftAfterSave,
  exportWorldProjectWithExtensions,
  importWorldProjectWithExtensions,
  isAnyAuthoringProjectBundleContributorDirty,
  projectBundleExtensionRegistry,
  type ImportWorldProjectWithExtensionsResult,
  type ProjectBundleExtensionExportReport,
  type ProjectBundleExtensionImportReport,
} from '@lib/game';

import { useProjectIndexStore, useProjectSessionStore, useWorldContextStore } from '@features/scene';

import { WorldContextSelector } from '@/components/game/WorldContextSelector';

import { PanelHeader } from '../shared/PanelHeader';

type LastProjectAction =
  | {
      kind: 'save';
      projectId: number;
      projectName: string;
      worldName: string;
      overwritten: boolean;
      counts: {
        locations: number;
        npcs: number;
        scenes: number;
        items: number;
      };
      extensionReport: ProjectBundleExtensionExportReport;
    }
  | {
      kind: 'load';
      projectId: number;
      projectName: string;
      worldId: number;
      worldName: string;
      counts: ImportWorldProjectWithExtensionsResult['response']['counts'];
      coreWarnings: string[];
      extensionReport: ProjectBundleExtensionImportReport;
    };

function formatTimestamp(value: number | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function formatIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

function confirmDiscardUnsavedAuthoringChanges(): boolean {
  return window.confirm(
    'You have unsaved authoring changes. Loading a project may overwrite them. Continue?',
  );
}

function confirmDeleteSavedProject(projectName: string): boolean {
  return window.confirm(`Delete saved project "${projectName}"? This cannot be undone.`);
}

export function ProjectPanel() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [worldNameOverride, setWorldNameOverride] = useState('');
  const [lastAction, setLastAction] = useState<LastProjectAction | null>(null);

  const { worldId, setWorldId, setLocationId } = useWorldContextStore();
  const savedProjects = useProjectIndexStore((state) => state.projects);
  const selectedProjectId = useProjectIndexStore((state) => state.selectedProjectId);
  const setSavedProjects = useProjectIndexStore((state) => state.setProjects);
  const upsertSavedProject = useProjectIndexStore((state) => state.upsertProject);
  const removeSavedProject = useProjectIndexStore((state) => state.removeProject);
  const selectSavedProject = useProjectIndexStore((state) => state.selectProject);
  const currentProjectId = useProjectSessionStore((state) => state.currentProjectId);
  const currentProjectName = useProjectSessionStore((state) => state.currentProjectName);
  const currentProjectSourceWorldId = useProjectSessionStore(
    (state) => state.currentProjectSourceWorldId,
  );
  const currentProjectUpdatedAt = useProjectSessionStore((state) => state.currentProjectUpdatedAt);
  const sourceFileName = useProjectSessionStore((state) => state.sourceFileName);
  const schemaVersion = useProjectSessionStore((state) => state.schemaVersion);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const lastImportedAt = useProjectSessionStore((state) => state.lastImportedAt);
  const lastExportedAt = useProjectSessionStore((state) => state.lastExportedAt);
  const lastOperation = useProjectSessionStore((state) => state.lastOperation);
  const sessionCoreWarnings = useProjectSessionStore((state) => state.coreWarnings);
  const sessionExtensionWarnings = useProjectSessionStore((state) => state.extensionWarnings);
  const setCurrentProject = useProjectSessionStore((state) => state.setCurrentProject);
  const clearCurrentProject = useProjectSessionStore((state) => state.clearCurrentProject);
  const recordImport = useProjectSessionStore((state) => state.recordImport);
  const recordExport = useProjectSessionStore((state) => state.recordExport);
  const registeredExtensions = useMemo(
    () => projectBundleExtensionRegistry.list().map((handler) => handler.key),
    [],
  );

  const selectedProject = useMemo(
    () => savedProjects.find((entry) => entry.id === selectedProjectId) ?? null,
    [savedProjects, selectedProjectId],
  );

  const loadSavedProjects = async (opts?: { silent?: boolean }) => {
    try {
      const projects = await listSavedGameProjects({ limit: 200 });
      setSavedProjects(projects);

      if (
        currentProjectId != null &&
        projects.some((project) => project.id === currentProjectId)
      ) {
        selectSavedProject(currentProjectId);
      }
    } catch (error) {
      if (!opts?.silent) {
        toast.error(
          `Failed to load saved projects: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }
  };

  useEffect(() => {
    void loadSavedProjects({ silent: true });
    // Intentionally run once for panel bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentProjectId == null) {
      return;
    }
    if (!savedProjects.some((project) => project.id === currentProjectId)) {
      return;
    }
    selectSavedProject(currentProjectId);
  }, [currentProjectId, savedProjects, selectSavedProject]);

  const setDirty = useProjectSessionStore((state) => state.setDirty);

  const handleSaveCurrent = async () => {
    if (!worldId) {
      toast.warning('Select a world before saving a project');
      return;
    }
    if (currentProjectId == null) {
      toast.warning('No active project to save');
      return;
    }

    setBusy(true);
    try {
      const { bundle, extensionReport } = await exportWorldProjectWithExtensions(worldId);
      const resolvedName = currentProjectName || String(bundle.core.world.name || `world_${worldId}`);

      const saved = await saveGameProject({
        name: resolvedName,
        bundle,
        source_world_id: worldId,
        overwrite_project_id: currentProjectId,
      });

      upsertSavedProject(saved);
      selectSavedProject(saved.id);
      setProjectName(saved.name);

      setLastAction({
        kind: 'save',
        projectId: saved.id,
        projectName: saved.name,
        worldName: bundle.core.world.name,
        overwritten: true,
        counts: {
          locations: bundle.core.locations.length,
          npcs: bundle.core.npcs.length,
          scenes: bundle.core.scenes.length,
          items: bundle.core.items.length,
        },
        extensionReport,
      });

      clearAuthoringProjectBundleDirtyState();
      recordExport({
        projectId: saved.id,
        projectName: saved.name,
        projectSourceWorldId: saved.source_world_id ?? null,
        projectUpdatedAt: saved.updated_at,
        sourceFileName: saved.name,
        schemaVersion: bundle.schema_version ?? null,
        extensionKeys: Object.keys(bundle.extensions || {}),
        extensionWarnings: extensionReport.warnings,
      });

      void clearDraftAfterSave(saved.id);
      toast.success(`Project saved: ${saved.name}`);
    } catch (error) {
      toast.error(`Project save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProject = async (overwrite: boolean) => {
    if (!worldId) {
      toast.warning('Select a world before saving a project');
      return;
    }
    if (overwrite && !selectedProjectId) {
      toast.warning('Select a project to overwrite');
      return;
    }

    setBusy(true);
    try {
      const { bundle, extensionReport } = await exportWorldProjectWithExtensions(worldId);
      const resolvedName =
        projectName.trim() ||
        selectedProject?.name ||
        String(bundle.core.world.name || `world_${worldId}`);

      const saved = await saveGameProject({
        name: resolvedName,
        bundle,
        source_world_id: worldId,
        ...(overwrite && selectedProjectId ? { overwrite_project_id: selectedProjectId } : {}),
      });

      upsertSavedProject(saved);
      selectSavedProject(saved.id);
      setProjectName(saved.name);

      setLastAction({
        kind: 'save',
        projectId: saved.id,
        projectName: saved.name,
        worldName: bundle.core.world.name,
        overwritten: overwrite,
        counts: {
          locations: bundle.core.locations.length,
          npcs: bundle.core.npcs.length,
          scenes: bundle.core.scenes.length,
          items: bundle.core.items.length,
        },
        extensionReport,
      });

      clearAuthoringProjectBundleDirtyState();
      recordExport({
        projectId: saved.id,
        projectName: saved.name,
        projectSourceWorldId: saved.source_world_id ?? null,
        projectUpdatedAt: saved.updated_at,
        sourceFileName: saved.name,
        schemaVersion: bundle.schema_version ?? null,
        extensionKeys: Object.keys(bundle.extensions || {}),
        extensionWarnings: extensionReport.warnings,
      });

      void clearDraftAfterSave(saved.id);
      toast.success(overwrite ? `Project updated: ${saved.name}` : `Project saved: ${saved.name}`);
    } catch (error) {
      toast.error(`Project save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRenameSelectedProject = async () => {
    if (!selectedProjectId || !selectedProject) {
      toast.warning('Select a project to rename');
      return;
    }

    const resolvedName = projectName.trim();
    if (!resolvedName) {
      toast.warning('Enter a project name before renaming');
      return;
    }

    setBusy(true);
    try {
      const renamed = await renameSavedGameProject(selectedProjectId, { name: resolvedName });
      upsertSavedProject(renamed);
      selectSavedProject(renamed.id);
      setProjectName(renamed.name);

      if (currentProjectId === renamed.id) {
        setCurrentProject({
          projectId: renamed.id,
          projectName: renamed.name,
          projectSourceWorldId: renamed.source_world_id ?? null,
          projectUpdatedAt: renamed.updated_at,
        });
      }

      toast.success(`Project renamed: ${renamed.name}`);
    } catch (error) {
      toast.error(`Project rename failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicateSelectedProject = async () => {
    if (!selectedProjectId || !selectedProject) {
      toast.warning('Select a project to duplicate');
      return;
    }

    const resolvedName = projectName.trim() || `${selectedProject.name} Copy`;

    setBusy(true);
    try {
      const duplicated = await duplicateSavedGameProject(selectedProjectId, { name: resolvedName });
      upsertSavedProject(duplicated);
      selectSavedProject(duplicated.id);
      setProjectName(duplicated.name);

      toast.success(`Project duplicated: ${duplicated.name}`);
    } catch (error) {
      toast.error(`Project duplicate failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSelectedProject = async () => {
    if (!selectedProjectId || !selectedProject) {
      toast.warning('Select a project to delete');
      return;
    }

    if (!confirmDeleteSavedProject(selectedProject.name)) {
      return;
    }

    setBusy(true);
    try {
      await deleteSavedGameProject(selectedProjectId);
      const deletedId = selectedProjectId;
      const deletedName = selectedProject.name;
      removeSavedProject(deletedId);

      if (currentProjectId === deletedId) {
        clearCurrentProject();
        setDirty(false);
      }

      if (selectedProjectId === deletedId) {
        setProjectName('');
      }

      toast.success(`Project deleted: ${deletedName}`);
    } catch (error) {
      toast.error(`Project delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRecoverDraft = async () => {
    setBusy(true);
    try {
      const draft = await getProjectDraft(currentProjectId);
      if (!draft) {
        toast.info('No draft found to recover');
        return;
      }

      const draftTime = Date.parse(draft.updated_at);
      const currentTime = currentProjectUpdatedAt ? Date.parse(currentProjectUpdatedAt) : 0;
      if (Number.isFinite(draftTime) && Number.isFinite(currentTime) && draftTime <= currentTime) {
        const proceed = window.confirm(
          'The draft is older than the current saved version. Recover anyway?',
        );
        if (!proceed) return;
      }

      const { response, extensionReport } = await importWorldProjectWithExtensions(draft.bundle);

      setWorldId(response.world_id);
      const firstLocationId = Object.values(response.id_maps.locations)[0];
      setLocationId(firstLocationId ?? null);

      setLastAction({
        kind: 'load',
        projectId: draft.id,
        projectName: draft.name,
        worldId: response.world_id,
        worldName: response.world_name,
        counts: response.counts,
        coreWarnings: response.warnings,
        extensionReport,
      });

      clearAuthoringProjectBundleDirtyState();
      recordImport({
        projectId: currentProjectId,
        projectName: currentProjectName,
        projectSourceWorldId: draft.source_world_id ?? null,
        projectUpdatedAt: draft.updated_at,
        sourceFileName: '[draft recovery]',
        schemaVersion: draft.bundle.schema_version ?? null,
        extensionKeys: Object.keys(draft.bundle.extensions || {}),
        extensionWarnings: extensionReport.warnings,
        coreWarnings: response.warnings,
      });

      try {
        await deleteProjectDraft(currentProjectId);
      } catch {
        // draft cleanup is best-effort
      }

      toast.success('Draft recovered successfully');
    } catch (error) {
      toast.error(
        `Draft recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLoadSelectedProject = async () => {
    if (!selectedProjectId) {
      toast.warning('Select a project to load');
      return;
    }

    const hasUnsavedChanges = dirty || isAnyAuthoringProjectBundleContributorDirty();
    if (hasUnsavedChanges && !confirmDiscardUnsavedAuthoringChanges()) {
      return;
    }

    setBusy(true);
    try {
      const project = await getSavedGameProject(selectedProjectId);

      // Check for a newer draft
      let bundleToLoad = project.bundle;
      try {
        const draft = await getProjectDraft(selectedProjectId);
        if (draft) {
          const draftTime = Date.parse(draft.updated_at);
          const savedTime = Date.parse(project.updated_at);
          if (Number.isFinite(draftTime) && draftTime > savedTime) {
            const useDraft = window.confirm(
              `A newer autosaved draft exists (${new Date(draftTime).toLocaleString()}). Load the draft instead of the saved version?`,
            );
            if (useDraft) {
              bundleToLoad = draft.bundle;
            }
          }
        }
      } catch {
        // Draft check is best-effort — proceed with saved bundle
      }

      const { response, extensionReport } = await importWorldProjectWithExtensions(
        bundleToLoad,
        worldNameOverride.trim() ? { world_name_override: worldNameOverride.trim() } : undefined,
      );

      // Move authoring context to the imported world for immediate continuity.
      setWorldId(response.world_id);
      const firstLocationId = Object.values(response.id_maps.locations)[0];
      setLocationId(firstLocationId ?? null);

      upsertSavedProject(project);
      selectSavedProject(project.id);

      setLastAction({
        kind: 'load',
        projectId: project.id,
        projectName: project.name,
        worldId: response.world_id,
        worldName: response.world_name,
        counts: response.counts,
        coreWarnings: response.warnings,
        extensionReport,
      });

      clearAuthoringProjectBundleDirtyState();
      recordImport({
        projectId: project.id,
        projectName: project.name,
        projectSourceWorldId: project.source_world_id ?? null,
        projectUpdatedAt: project.updated_at,
        sourceFileName: project.name,
        schemaVersion: project.bundle.schema_version ?? null,
        extensionKeys: Object.keys(project.bundle.extensions || {}),
        extensionWarnings: extensionReport.warnings,
        coreWarnings: response.warnings,
      });

      const warningCount = response.warnings.length + extensionReport.warnings.length;
      if (warningCount > 0) {
        toast.warning(`Project loaded with ${warningCount} warning(s)`);
      } else {
        toast.success(`Project loaded: ${project.name}`);
      }
    } catch (error) {
      toast.error(`Project load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <PanelHeader
        title="Project"
        category="workspace"
        contextLabel={worldId ? `World #${worldId}` : 'No world selected'}
        statusIcon={
          dirty ? (
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          ) : currentProjectId != null ? (
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          ) : undefined
        }
        statusLabel={
          dirty
            ? 'Unsaved'
            : currentProjectId != null
              ? currentProjectName ?? undefined
              : undefined
        }
      />

      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
        <WorldContextSelector />
      </div>

      <div className="p-3 space-y-3 border-b border-neutral-200 dark:border-neutral-800">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-600 dark:text-neutral-300">Project name</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Default: world name"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void handleSaveProject(false);
            }}
            disabled={busy || !worldId}
          >
            Save As New
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void handleSaveProject(true);
            }}
            disabled={busy || !worldId || !selectedProjectId}
          >
            Overwrite Selected
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void handleSaveCurrent();
            }}
            disabled={busy || !worldId || currentProjectId == null}
          >
            Save Current
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between text-xs">
          <div className="font-semibold">Saved Projects</div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void loadSavedProjects();
            }}
            disabled={busy}
          >
            Refresh
          </Button>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-600 dark:text-neutral-300">Select project</span>
          <select
            value={selectedProjectId ?? ''}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              const nextId = Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null;
              selectSavedProject(nextId);
              const nextProject = savedProjects.find((entry) => entry.id === nextId);
              if (nextProject) {
                setProjectName(nextProject.name);
              }
            }}
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          >
            <option value="">Select a saved project...</option>
            {savedProjects.map((project) => (
              <option key={project.id} value={project.id}>
                #{project.id} {project.name}{project.id === currentProjectId ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void handleRenameSelectedProject();
            }}
            disabled={busy || !selectedProjectId}
          >
            Rename Selected
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void handleDuplicateSelectedProject();
            }}
            disabled={busy || !selectedProjectId}
          >
            Duplicate Selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void handleDeleteSelectedProject();
            }}
            disabled={busy || !selectedProjectId}
          >
            Delete Selected
          </Button>
        </div>

        {selectedProject && (
          <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
            <div>Schema: {selectedProject.schema_version}</div>
            <div>Source world: {selectedProject.source_world_id ?? 'N/A'}</div>
            <div>Saved: {formatIsoTimestamp(selectedProject.updated_at)}</div>
          </div>
        )}

        {currentProjectId != null && (
          <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${dirty ? 'bg-amber-500' : 'bg-green-500'}`}
              />
              Current project: #{currentProjectId}
              {currentProjectName ? ` ${currentProjectName}` : ''}
              {dirty && <span className="text-amber-600 dark:text-amber-400">(unsaved changes)</span>}
            </div>
            <div>Current source world: {currentProjectSourceWorldId ?? 'N/A'}</div>
            <div>
              Current updated:{' '}
              {currentProjectUpdatedAt ? formatIsoTimestamp(currentProjectUpdatedAt) : 'Unknown'}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-600 dark:text-neutral-300">Load world name override (optional)</span>
          <input
            value={worldNameOverride}
            onChange={(event) => setWorldNameOverride(event.target.value)}
            placeholder="Use project world name when empty"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void handleLoadSelectedProject();
            }}
            disabled={busy || !selectedProjectId}
          >
            Load Selected Project
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void handleRecoverDraft();
            }}
            disabled={busy}
          >
            Recover Draft
          </Button>
        </div>
      </div>

      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 text-xs">
        <div className="font-semibold mb-1">Registered Extensions</div>
        {registeredExtensions.length > 0 ? (
          <div className="text-neutral-600 dark:text-neutral-300">
            {registeredExtensions.join(', ')}
          </div>
        ) : (
          <div className="text-neutral-500 dark:text-neutral-400">None</div>
        )}
      </div>

      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
        <div className="font-semibold mb-1">Project Session</div>
        <div>Status: {dirty ? 'Dirty' : 'Clean'}</div>
        <div>Last operation: {lastOperation ?? 'none'}</div>
        <div>Bundle schema: {schemaVersion ?? 'Unknown'}</div>
        <div>Source project: {sourceFileName || 'N/A'}</div>
        <div>
          Current project: {currentProjectId != null ? `#${currentProjectId}` : 'N/A'}
          {currentProjectName ? ` (${currentProjectName})` : ''}
        </div>
        <div>Last import: {formatTimestamp(lastImportedAt)}</div>
        <div>Last export: {formatTimestamp(lastExportedAt)}</div>
        <div>
          Session warnings: core {sessionCoreWarnings.length}, extensions {sessionExtensionWarnings.length}
        </div>
      </div>

      <div className="p-3 text-xs overflow-y-auto">
        <div className="font-semibold mb-2">Last Operation</div>
        {!lastAction && <div className="text-neutral-500 dark:text-neutral-400">No project operation yet.</div>}

        {lastAction?.kind === 'save' && (
          <div className="space-y-1">
            <div>
              Saved project: <b>{lastAction.projectName}</b> (#{lastAction.projectId})
              {lastAction.overwritten ? ' [updated]' : ''}
            </div>
            <div>World source: <b>{lastAction.worldName}</b></div>
            <div>
              Core counts: locations {lastAction.counts.locations}, npcs {lastAction.counts.npcs}, scenes {lastAction.counts.scenes}, items {lastAction.counts.items}
            </div>
            <div>
              Extensions: included {lastAction.extensionReport.included.length}, skipped {lastAction.extensionReport.skipped.length}, warnings {lastAction.extensionReport.warnings.length}
            </div>
          </div>
        )}

        {lastAction?.kind === 'load' && (
          <div className="space-y-1">
            <div>
              Loaded project: <b>{lastAction.projectName}</b> (#{lastAction.projectId})
            </div>
            <div>
              Imported world: <b>{lastAction.worldName}</b> (#{lastAction.worldId})
            </div>
            <div>
              Core counts: locations {lastAction.counts.locations}, hotspots {lastAction.counts.hotspots}, npcs {lastAction.counts.npcs}, scenes {lastAction.counts.scenes}, nodes {lastAction.counts.nodes}, edges {lastAction.counts.edges}, items {lastAction.counts.items}
            </div>
            <div>
              Extensions: applied {lastAction.extensionReport.applied.length}, skipped {lastAction.extensionReport.skipped.length}, unknown {lastAction.extensionReport.unknown.length}{lastAction.extensionReport.migrated.length > 0 ? `, migrated ${lastAction.extensionReport.migrated.length}` : ''}{lastAction.extensionReport.failed.length > 0 ? `, failed ${lastAction.extensionReport.failed.length}` : ''}, warnings {lastAction.extensionReport.warnings.length}
            </div>
            {(lastAction.coreWarnings.length > 0 || lastAction.extensionReport.warnings.length > 0) && (
              <div className="pt-2">
                <div className="font-semibold mb-1">Warnings</div>
                <ul className="list-disc ml-4 space-y-1 text-neutral-600 dark:text-neutral-300">
                  {lastAction.coreWarnings.map((warning, index) => (
                    <li key={`core-${index}`}>{warning}</li>
                  ))}
                  {lastAction.extensionReport.warnings.map((warning, index) => (
                    <li key={`ext-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

