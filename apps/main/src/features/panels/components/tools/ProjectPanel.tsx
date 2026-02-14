import { Button, useToast } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import {
  getSavedGameProject,
  listSavedGameProjects,
  saveGameProject,
  type SavedGameProjectSummary,
} from '@lib/api';
import {
  clearAuthoringProjectBundleDirtyState,
  exportWorldProjectWithExtensions,
  importWorldProjectWithExtensions,
  isAnyAuthoringProjectBundleContributorDirty,
  projectBundleExtensionRegistry,
  type ImportWorldProjectWithExtensionsResult,
  type ProjectBundleExtensionExportReport,
  type ProjectBundleExtensionImportReport,
} from '@lib/game';

import { useProjectSessionStore, useWorldContextStore } from '@features/scene';

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

export function ProjectPanel() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [worldNameOverride, setWorldNameOverride] = useState('');
  const [savedProjects, setSavedProjects] = useState<SavedGameProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<LastProjectAction | null>(null);

  const { worldId, setWorldId, setLocationId } = useWorldContextStore();
  const sourceFileName = useProjectSessionStore((state) => state.sourceFileName);
  const schemaVersion = useProjectSessionStore((state) => state.schemaVersion);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const lastImportedAt = useProjectSessionStore((state) => state.lastImportedAt);
  const lastExportedAt = useProjectSessionStore((state) => state.lastExportedAt);
  const lastOperation = useProjectSessionStore((state) => state.lastOperation);
  const sessionCoreWarnings = useProjectSessionStore((state) => state.coreWarnings);
  const sessionExtensionWarnings = useProjectSessionStore((state) => state.extensionWarnings);
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
      if (projects.length === 0) {
        setSelectedProjectId(null);
      } else if (!projects.some((project) => project.id === selectedProjectId)) {
        setSelectedProjectId(projects[0].id);
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

      await loadSavedProjects({ silent: true });
      setSelectedProjectId(saved.id);
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
        sourceFileName: saved.name,
        schemaVersion: bundle.schema_version ?? null,
        extensionKeys: Object.keys(bundle.extensions || {}),
        extensionWarnings: extensionReport.warnings,
      });

      toast.success(overwrite ? `Project updated: ${saved.name}` : `Project saved: ${saved.name}`);
    } catch (error) {
      toast.error(`Project save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      const { response, extensionReport } = await importWorldProjectWithExtensions(
        project.bundle,
        worldNameOverride.trim() ? { world_name_override: worldNameOverride.trim() } : undefined,
      );

      // Move authoring context to the imported world for immediate continuity.
      setWorldId(response.world_id);
      const firstLocationId = Object.values(response.id_maps.locations)[0];
      setLocationId(firstLocationId ?? null);

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
              setSelectedProjectId(nextId);
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
                #{project.id} {project.name}
              </option>
            ))}
          </select>
        </label>

        {selectedProject && (
          <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
            <div>Schema: {selectedProject.schema_version}</div>
            <div>Source world: {selectedProject.source_world_id ?? 'N/A'}</div>
            <div>Saved: {formatIsoTimestamp(selectedProject.updated_at)}</div>
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
              Extensions: applied {lastAction.extensionReport.applied.length}, skipped {lastAction.extensionReport.skipped.length}, unknown {lastAction.extensionReport.unknown.length}, warnings {lastAction.extensionReport.warnings.length}
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
