import {
  Button,
  FormField,
  SidebarContentLayout,
  useToast,
} from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import {
  deleteSavedGameProject,
  deleteProjectDraft,
  duplicateSavedGameProject,
  getProjectDraft,
  getSavedGameProject,
  renameSavedGameProject,
  saveGameProject,
  type SaveGameProjectRequest,
  type SavedGameProjectSummary,
} from '@lib/api';
import { useEditorContext } from '@lib/context/editorContext';
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
import { resolveSavedGameProjects } from '@lib/resolvers';

import { useProjectIndexStore, useProjectSessionStore, useWorldContextStore } from '@features/scene';

import { ActionSelectionDebugSection } from '@/components/game/ActionSelectionDebugSection';
import { WorldContextSelector } from '@/components/game/WorldContextSelector';

import { useProjectAvailability, type AvailabilityItem } from './useProjectAvailability';

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

type BananzaSeederMode = 'api' | 'direct';
type BananzaSyncMode = 'two_way' | 'backend_to_file' | 'file_to_backend' | 'none';

interface BananzaRuntimePreferences {
  seederMode: BananzaSeederMode;
  syncMode: BananzaSyncMode;
  watchEnabled: boolean;
}

const DEFAULT_BANANZA_RUNTIME_PREFERENCES: BananzaRuntimePreferences = {
  seederMode: 'api',
  syncMode: 'two_way',
  watchEnabled: true,
};

const BANANZA_RUNTIME_META_KEY = 'bananza_runtime';
const BANANZA_META_SEEDER_MODE = 'bananza_seeder_mode';
const BANANZA_META_SYNC_MODE = 'bananza_sync_mode';
const BANANZA_META_WATCH_ENABLED = 'bananza_watch_enabled';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBananzaSeederMode(value: unknown): BananzaSeederMode | null {
  if (value === 'api' || value === 'direct') {
    return value;
  }
  return null;
}

function normalizeBananzaSyncMode(value: unknown): BananzaSyncMode | null {
  if (
    value === 'two_way' ||
    value === 'backend_to_file' ||
    value === 'file_to_backend' ||
    value === 'none'
  ) {
    return value;
  }
  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

function readBananzaRuntimePreferences(
  project: SavedGameProjectSummary | null | undefined,
): BananzaRuntimePreferences {
  const provenance = project?.provenance;
  const meta = isRecord(provenance?.meta) ? provenance.meta : {};
  const runtime: Record<string, unknown> = isRecord(meta[BANANZA_RUNTIME_META_KEY])
    ? meta[BANANZA_RUNTIME_META_KEY]
    : {};

  const seederMode =
    normalizeBananzaSeederMode(runtime.seeder_mode) ??
    normalizeBananzaSeederMode(meta[BANANZA_META_SEEDER_MODE]) ??
    DEFAULT_BANANZA_RUNTIME_PREFERENCES.seederMode;

  const syncMode =
    normalizeBananzaSyncMode(runtime.sync_mode) ??
    normalizeBananzaSyncMode(meta[BANANZA_META_SYNC_MODE]) ??
    DEFAULT_BANANZA_RUNTIME_PREFERENCES.syncMode;

  const watchEnabled =
    normalizeBoolean(runtime.watch_enabled) ??
    normalizeBoolean(meta[BANANZA_META_WATCH_ENABLED]) ??
    DEFAULT_BANANZA_RUNTIME_PREFERENCES.watchEnabled;

  return { seederMode, syncMode, watchEnabled };
}

function hasExplicitBananzaRuntimePreferences(
  project: SavedGameProjectSummary | null | undefined,
): boolean {
  const provenance = project?.provenance;
  const meta = isRecord(provenance?.meta) ? provenance.meta : {};
  const runtime: Record<string, unknown> = isRecord(meta[BANANZA_RUNTIME_META_KEY])
    ? meta[BANANZA_RUNTIME_META_KEY]
    : {};
  return (
    runtime.seeder_mode !== undefined ||
    runtime.sync_mode !== undefined ||
    runtime.watch_enabled !== undefined ||
    meta[BANANZA_META_SEEDER_MODE] !== undefined ||
    meta[BANANZA_META_SYNC_MODE] !== undefined ||
    meta[BANANZA_META_WATCH_ENABLED] !== undefined
  );
}

function buildProjectProvenanceRequest(
  existingProject: SavedGameProjectSummary | null,
  preferences: BananzaRuntimePreferences,
): SaveGameProjectRequest['provenance'] {
  const existingProvenance = existingProject?.provenance;
  const existingMeta = isRecord(existingProvenance?.meta) ? existingProvenance.meta : {};
  const existingRuntime: Record<string, unknown> = isRecord(existingMeta[BANANZA_RUNTIME_META_KEY])
    ? existingMeta[BANANZA_RUNTIME_META_KEY]
    : {};

  const mergedMeta: Record<string, unknown> = {
    ...existingMeta,
    [BANANZA_RUNTIME_META_KEY]: {
      ...existingRuntime,
      seeder_mode: preferences.seederMode,
      sync_mode: preferences.syncMode,
      watch_enabled: preferences.watchEnabled,
    },
    [BANANZA_META_SEEDER_MODE]: preferences.seederMode,
    [BANANZA_META_SYNC_MODE]: preferences.syncMode,
    [BANANZA_META_WATCH_ENABLED]: preferences.watchEnabled,
  };

  return {
    kind: existingProvenance?.kind ?? 'user',
    source_key: existingProvenance?.source_key ?? null,
    parent_project_id: existingProvenance?.parent_project_id ?? null,
    meta: mergedMeta,
  };
}

function buildBananzaSeederPresetCommand(preferences: BananzaRuntimePreferences): string {
  let command = `python -m scripts.seeds.game.bananza.cli --mode ${preferences.seederMode}`;
  if (preferences.seederMode === 'api') {
    command += ` --sync-mode ${preferences.syncMode}`;
  }
  if (preferences.watchEnabled) {
    command += ' --watch';
  }
  return command;
}

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

function toNullableId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function parseSettingsChildId(value: unknown): SettingsChildId {
  return value === 'load' ? 'load' : 'save';
}

function confirmDiscardUnsavedAuthoringChanges(): boolean {
  return window.confirm(
    'You have unsaved authoring changes. Loading a project may overwrite them. Continue?',
  );
}

function confirmDeleteSavedProject(projectName: string): boolean {
  return window.confirm(`Delete saved project "${projectName}"? This cannot be undone.`);
}

function formatAvailabilityValue(item: AvailabilityItem): string {
  if (item.status === 'loading') {
    return 'Loading...';
  }
  if (item.status === 'error') {
    return `Error: ${item.error || 'Unknown error'}`;
  }
  if (typeof item.count === 'number') {
    const sampledText = item.sampled ? ' (sampled)' : '';
    return item.detail ? `${item.count}${sampledText} · ${item.detail}` : `${item.count}${sampledText}`;
  }
  return item.detail || 'OK';
}

type SettingsChildId = 'save' | 'load';
type SectionId = 'settings' | 'saved-projects' | 'availability' | 'session' | 'last-operation' | 'debug';

const SECTION_NAV_ITEMS = [
  {
    id: 'settings',
    label: 'Settings',
    children: [
      { id: 'save', label: 'Save' },
      { id: 'load', label: 'Load' },
    ],
  },
  { id: 'saved-projects', label: 'Projects' },
  { id: 'availability', label: 'Availability' },
  { id: 'session', label: 'Session' },
  { id: 'last-operation', label: 'Last Operation' },
  { id: 'debug', label: 'Debug' },
] as const;

export function ProjectPanel() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [worldNameOverride, setWorldNameOverride] = useState('');
  const [bananzaSeederMode, setBananzaSeederMode] = useState<BananzaSeederMode>(
    DEFAULT_BANANZA_RUNTIME_PREFERENCES.seederMode,
  );
  const [bananzaSyncMode, setBananzaSyncMode] = useState<BananzaSyncMode>(
    DEFAULT_BANANZA_RUNTIME_PREFERENCES.syncMode,
  );
  const [bananzaWatchEnabled, setBananzaWatchEnabled] = useState<boolean>(
    DEFAULT_BANANZA_RUNTIME_PREFERENCES.watchEnabled,
  );
  const [lastAction, setLastAction] = useState<LastProjectAction | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('settings');
  const [activeSettingsChild, setActiveSettingsChild] = useState<SettingsChildId>('save');

  const { worldId, setWorldId, setLocationId } = useWorldContextStore();
  const editorContext = useEditorContext();
  const savedProjects = useProjectIndexStore((state) => state.projects);
  const selectedProjectId = useProjectIndexStore((state) => state.selectedProjectId);
  const setSavedProjects = useProjectIndexStore((state) => state.setProjects);
  const upsertSavedProject = useProjectIndexStore((state) => state.upsertProject);
  const removeSavedProject = useProjectIndexStore((state) => state.removeProject);
  const selectSavedProject = useProjectIndexStore((state) => state.selectProject);
  const currentProjectId = useProjectSessionStore((state) => state.currentProjectId);
  const currentProjectName = useProjectSessionStore((state) => state.currentProjectName);
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
  const currentProjectSummary = useMemo(
    () => savedProjects.find((entry) => entry.id === currentProjectId) ?? null,
    [savedProjects, currentProjectId],
  );
  const currentBananzaPreferences = useMemo<BananzaRuntimePreferences>(
    () => ({
      seederMode: bananzaSeederMode,
      syncMode: bananzaSyncMode,
      watchEnabled: bananzaWatchEnabled,
    }),
    [bananzaSeederMode, bananzaSyncMode, bananzaWatchEnabled],
  );
  const selectedProjectBananzaPreferences = useMemo(
    () => readBananzaRuntimePreferences(selectedProject),
    [selectedProject],
  );
  const selectedProjectHasBananzaPreferences = useMemo(
    () => hasExplicitBananzaRuntimePreferences(selectedProject),
    [selectedProject],
  );
  const bananzaSeederPresetCommand = useMemo(
    () => buildBananzaSeederPresetCommand(currentBananzaPreferences),
    [currentBananzaPreferences],
  );
  const runtimeSessionId = useMemo(() => {
    const value = editorContext.runtime.sessionId;
    const next = typeof value === 'number' ? value : Number(value ?? NaN);
    return Number.isFinite(next) ? next : null;
  }, [editorContext.runtime.sessionId]);
  const {
    items: availabilityItems,
    isLoading: availabilityLoading,
    lastRefreshedAtMs: availabilityLastRefreshedAtMs,
    refresh: refreshAvailability,
  } = useProjectAvailability(worldId ?? null);

  const loadSavedProjects = async (opts?: { silent?: boolean }) => {
    try {
      const projects = await resolveSavedGameProjects(
        { limit: 200 },
        {
          consumerId: 'ProjectPanel.loadSavedProjects',
          bypassCache: true,
        },
      );
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

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    const preferences = readBananzaRuntimePreferences(selectedProject);
    setBananzaSeederMode(preferences.seederMode);
    setBananzaSyncMode(preferences.syncMode);
    setBananzaWatchEnabled(preferences.watchEnabled);
  }, [selectedProject?.id, selectedProject?.updated_at]);

  const selectProjectById = (nextId: number | null) => {
    selectSavedProject(nextId);
    const nextProject = savedProjects.find((entry) => entry.id === nextId);
    if (!nextProject) {
      if (nextId == null) {
        setProjectName('');
      }
      return;
    }
    setProjectName(nextProject.name);
    const nextPreferences = readBananzaRuntimePreferences(nextProject);
    setBananzaSeederMode(nextPreferences.seederMode);
    setBananzaSyncMode(nextPreferences.syncMode);
    setBananzaWatchEnabled(nextPreferences.watchEnabled);
  };

  const handleProjectSelectValue = (value: string) => {
    const nextValue = Number(value);
    const nextId = Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null;
    selectProjectById(nextId);
  };

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
      const provenanceBaseProject =
        currentProjectSummary ??
        (selectedProject?.id === currentProjectId ? selectedProject : null);
      const saveRequest: SaveGameProjectRequest = {
        name: resolvedName,
        bundle,
        source_world_id: worldId,
        overwrite_project_id: currentProjectId,
        provenance: buildProjectProvenanceRequest(
          provenanceBaseProject,
          currentBananzaPreferences,
        ),
      };

      const saved = await saveGameProject(saveRequest);

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

      void clearDraftAfterSave(saved.id, currentProjectId);
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
      const provenanceBaseProject = overwrite ? selectedProject : null;
      const saveRequest: SaveGameProjectRequest = {
        name: resolvedName,
        bundle,
        source_world_id: worldId,
        ...(overwrite && selectedProjectId ? { overwrite_project_id: selectedProjectId } : {}),
        provenance: buildProjectProvenanceRequest(
          provenanceBaseProject,
          currentBananzaPreferences,
        ),
      };

      const saved = await saveGameProject(saveRequest);

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

      void clearDraftAfterSave(saved.id, currentProjectId);
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
      setLocationId(toNullableId(firstLocationId));

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

      // Check for a newer draft.
      let bundleToLoad = project.bundle;
      let loadedProjectUpdatedAt = project.updated_at;
      let loadedProjectSourceWorldId = project.source_world_id ?? null;
      let loadedSchemaVersion = project.bundle.schema_version ?? null;
      let loadedExtensionKeys = Object.keys(project.bundle.extensions || {});
      let loadedSourceLabel = project.name;
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
              loadedProjectUpdatedAt = draft.updated_at;
              loadedProjectSourceWorldId = draft.source_world_id ?? null;
              loadedSchemaVersion = draft.bundle.schema_version ?? null;
              loadedExtensionKeys = Object.keys(draft.bundle.extensions || {});
              loadedSourceLabel = `[draft] ${project.name}`;
            }
          }
        }
      } catch {
        // Draft check is best-effort - proceed with saved bundle.
      }

      const { response, extensionReport } = await importWorldProjectWithExtensions(
        bundleToLoad,
        worldNameOverride.trim() ? { world_name_override: worldNameOverride.trim() } : undefined,
      );

      // Move authoring context to the imported world for immediate continuity.
      setWorldId(response.world_id);
      const firstLocationId = Object.values(response.id_maps.locations)[0];
      setLocationId(toNullableId(firstLocationId));

      upsertSavedProject(project);
      selectSavedProject(project.id);
      const loadedPreferences = readBananzaRuntimePreferences(project);
      setBananzaSeederMode(loadedPreferences.seederMode);
      setBananzaSyncMode(loadedPreferences.syncMode);
      setBananzaWatchEnabled(loadedPreferences.watchEnabled);

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
        projectSourceWorldId: loadedProjectSourceWorldId,
        projectUpdatedAt: loadedProjectUpdatedAt,
        sourceFileName: loadedSourceLabel,
        schemaVersion: loadedSchemaVersion,
        extensionKeys: loadedExtensionKeys,
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
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
        <WorldContextSelector />
      </div>

      <SidebarContentLayout
        sections={SECTION_NAV_ITEMS as unknown as { id: string; label: string }[]}
        activeSectionId={activeSection}
        onSelectSection={(id) => setActiveSection(id as SectionId)}
        activeChildId={activeSection === 'settings' ? activeSettingsChild : undefined}
        onSelectChild={(parentId, childId) => {
          if (parentId !== 'settings') {
            return;
          }
          setActiveSection('settings');
          setActiveSettingsChild(parseSettingsChildId(childId));
        }}
        expandedSectionIds={new Set(['settings'])}
        sidebarWidth="w-36"
        variant="light"
        contentClassName="p-3 text-xs space-y-3"
      >
          {activeSection === 'settings' && activeSettingsChild === 'save' && (
            <>
              <FormField label="Project name" size="sm">
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Default: world name"
                  className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 w-full"
                />
              </FormField>

              <FormField
                label="Bananza seeder mode"
                size="sm"
                helpText="Saved with project provenance and used as CLI default preference."
              >
                <select
                  value={bananzaSeederMode}
                  onChange={(event) =>
                    setBananzaSeederMode(
                      event.target.value === 'direct' ? 'direct' : 'api',
                    )
                  }
                  className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 w-full"
                >
                  <option value="api">API (recommended)</option>
                  <option value="direct">Direct DB (advanced)</option>
                </select>
              </FormField>

              <FormField
                label="Bananza sync mode"
                size="sm"
                helpText="Applies to API mode seeding/sync workflows."
              >
                <select
                  value={bananzaSyncMode}
                  onChange={(event) =>
                    setBananzaSyncMode(
                      event.target.value === 'backend_to_file' ||
                        event.target.value === 'file_to_backend' ||
                        event.target.value === 'none'
                        ? event.target.value
                        : 'two_way',
                    )
                  }
                  className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 w-full"
                >
                  <option value="two_way">Two-way (default)</option>
                  <option value="backend_to_file">Backend to file</option>
                  <option value="file_to_backend">File to backend</option>
                  <option value="none">None</option>
                </select>
              </FormField>

              <FormField
                label="Bananza watch default"
                size="sm"
                helpText="Controls whether watcher mode is preferred for Bananza seeder runs."
              >
                <select
                  value={bananzaWatchEnabled ? 'enabled' : 'disabled'}
                  onChange={(event) => setBananzaWatchEnabled(event.target.value === 'enabled')}
                  className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 w-full"
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </FormField>

              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 break-all">
                CLI preset: <code>{bananzaSeederPresetCommand}</code>
              </div>

              <div className="flex flex-wrap gap-2">
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
            </>
          )}

          {activeSection === 'settings' && activeSettingsChild === 'load' && (
            <>
              <FormField label="Select project" size="sm">
                <select
                  value={selectedProjectId ?? ''}
                  onChange={(event) => handleProjectSelectValue(event.target.value)}
                  className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 w-full"
                >
                  <option value="">Select a saved project...</option>
                  {savedProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      #{project.id} {project.name}{project.id === currentProjectId ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="World name override" size="sm" helpText="Used when loading a project">
                <input
                  value={worldNameOverride}
                  onChange={(event) => setWorldNameOverride(event.target.value)}
                  placeholder="Use project world name when empty"
                  className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 w-full"
                />
              </FormField>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void handleLoadSelectedProject();
                  }}
                  disabled={busy || !selectedProjectId}
                >
                  Load Selected
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

              {selectedProject && (
                <div className="text-neutral-600 dark:text-neutral-300 space-y-1">
                  <div>Schema: {selectedProject.schema_version}</div>
                  <div>Source world: {selectedProject.source_world_id ?? 'N/A'}</div>
                  <div>Saved: {formatIsoTimestamp(selectedProject.updated_at)}</div>
                </div>
              )}
            </>
          )}

          {activeSection === 'saved-projects' && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Saved Projects</span>
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

              <FormField label="Select project" size="sm">
                <select
                  value={selectedProjectId ?? ''}
                  onChange={(event) => handleProjectSelectValue(event.target.value)}
                  className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 w-full"
                >
                  <option value="">Select a saved project...</option>
                  {savedProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      #{project.id} {project.name}{project.id === currentProjectId ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
              </FormField>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void handleRenameSelectedProject();
                  }}
                  disabled={busy || !selectedProjectId}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void handleDuplicateSelectedProject();
                  }}
                  disabled={busy || !selectedProjectId}
                >
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void handleDeleteSelectedProject();
                  }}
                  disabled={busy || !selectedProjectId}
                >
                  Delete
                </Button>
              </div>

              {selectedProject && (
                <div className="text-neutral-600 dark:text-neutral-300 space-y-1">
                  <div>Schema: {selectedProject.schema_version}</div>
                  <div>Source world: {selectedProject.source_world_id ?? 'N/A'}</div>
                  <div>Saved: {formatIsoTimestamp(selectedProject.updated_at)}</div>
                  <div>
                    Bananza seeder: {selectedProjectBananzaPreferences.seederMode}
                    {!selectedProjectHasBananzaPreferences ? ' (default)' : ''}
                  </div>
                  <div>
                    Bananza sync: {selectedProjectBananzaPreferences.syncMode}
                    {!selectedProjectHasBananzaPreferences ? ' (default)' : ''}
                  </div>
                  <div>
                    Bananza watch: {selectedProjectBananzaPreferences.watchEnabled ? 'enabled' : 'disabled'}
                    {!selectedProjectHasBananzaPreferences ? ' (default)' : ''}
                  </div>
                </div>
              )}

            </>
          )}

          {activeSection === 'availability' && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Availability Snapshot</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void refreshAvailability();
                  }}
                  disabled={availabilityLoading}
                >
                  Refresh
                </Button>
              </div>
              <div className="text-neutral-500 dark:text-neutral-400">
                {availabilityLastRefreshedAtMs
                  ? `Updated ${formatTimestamp(availabilityLastRefreshedAtMs)}`
                  : 'Not refreshed yet'}
              </div>
              <div className="space-y-1">
                {availabilityItems.map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-3">
                    <span className="text-neutral-600 dark:text-neutral-300">{item.label}</span>
                    <span
                      className={
                        item.status === 'error'
                          ? 'text-right text-red-600 dark:text-red-400'
                          : 'text-right text-neutral-700 dark:text-neutral-200'
                      }
                    >
                      {formatAvailabilityValue(item)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeSection === 'session' && (
            <div className="space-y-1">
              <div>Status: {dirty ? 'Dirty' : 'Clean'}</div>
              <div>Last operation: {lastOperation ?? 'none'}</div>
              <div>Bundle schema: {schemaVersion ?? 'Unknown'}</div>
              <div>Source project: {sourceFileName || 'N/A'}</div>
              <div>Last import: {formatTimestamp(lastImportedAt)}</div>
              <div>Last export: {formatTimestamp(lastExportedAt)}</div>
              <div>
                Session warnings: core {sessionCoreWarnings.length}, extensions{' '}
                {sessionExtensionWarnings.length}
              </div>
              <div className="pt-2">
                <div className="font-semibold mb-1">Registered Extensions</div>
                {registeredExtensions.length > 0 ? (
                  <div className="text-neutral-600 dark:text-neutral-300">
                    {registeredExtensions.join(', ')}
                  </div>
                ) : (
                  <div className="text-neutral-500 dark:text-neutral-400">None</div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'last-operation' && (
            <>
              {!lastAction && (
                <div className="text-neutral-500 dark:text-neutral-400">No project operation yet.</div>
              )}

              {lastAction?.kind === 'save' && (
                <div className="space-y-1">
                  <div>
                    Saved project: <b>{lastAction.projectName}</b> (#{lastAction.projectId})
                    {lastAction.overwritten ? ' [updated]' : ''}
                  </div>
                  <div>
                    World source: <b>{lastAction.worldName}</b>
                  </div>
                  <div>
                    Core counts: locations {lastAction.counts.locations}, npcs{' '}
                    {lastAction.counts.npcs}, scenes {lastAction.counts.scenes}, items{' '}
                    {lastAction.counts.items}
                  </div>
                  <div>
                    Extensions: included {lastAction.extensionReport.included.length}, skipped{' '}
                    {lastAction.extensionReport.skipped.length}, warnings{' '}
                    {lastAction.extensionReport.warnings.length}
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
                    Core counts: locations {lastAction.counts.locations}, hotspots{' '}
                    {lastAction.counts.hotspots}, npcs {lastAction.counts.npcs}, scenes{' '}
                    {lastAction.counts.scenes}, nodes {lastAction.counts.nodes}, edges{' '}
                    {lastAction.counts.edges}, items {lastAction.counts.items}
                  </div>
                  <div>
                    Extensions: applied {lastAction.extensionReport.applied.length}, skipped{' '}
                    {lastAction.extensionReport.skipped.length}, unknown{' '}
                    {lastAction.extensionReport.unknown.length}
                    {lastAction.extensionReport.migrated.length > 0
                      ? `, migrated ${lastAction.extensionReport.migrated.length}`
                      : ''}
                    {lastAction.extensionReport.failed.length > 0
                      ? `, failed ${lastAction.extensionReport.failed.length}`
                      : ''}
                    , warnings {lastAction.extensionReport.warnings.length}
                  </div>
                  {(lastAction.coreWarnings.length > 0 ||
                    lastAction.extensionReport.warnings.length > 0) && (
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
            </>
          )}

          {activeSection === 'debug' && (
            <ActionSelectionDebugSection
              defaultWorldId={worldId}
              defaultSessionId={runtimeSessionId}
            />
          )}
      </SidebarContentLayout>
    </div>
  );
}
