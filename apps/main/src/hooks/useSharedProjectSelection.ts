import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SavedGameProjectSummary } from "@lib/api";
import { resolveSavedGameProjects } from "@lib/resolvers";

import { useEffectiveAuthoringIds } from "@features/contextHub";
import { useProjectSessionStore } from "@features/scene";

interface UseSharedProjectSelectionOptions {
  autoSelectFirst?: boolean;
  limit?: number;
  loadCatalog?: boolean;
  bypassCache?: boolean;
}

interface UseSharedProjectSelectionResult {
  projects: SavedGameProjectSummary[];
  selectedProjectId: number | null;
  selectedProjectName: string | null;
  selectedProjectSource:
    | "override"
    | "authoring-context"
    | "editor-runtime"
    | "fallback"
    | "none";
  setSelectedProjectId: (projectId: number | null) => void;
  isLoadingProjects: boolean;
  projectLoadError: string | null;
  reloadProjects: () => Promise<void>;
}

export function useSharedProjectSelection(
  options: UseSharedProjectSelectionOptions = {},
): UseSharedProjectSelectionResult {
  const {
    autoSelectFirst = false,
    limit = 200,
    loadCatalog = true,
    bypassCache = false,
  } = options;
  const effectiveIds = useEffectiveAuthoringIds();
  const selectedProjectId = effectiveIds.projectId;

  const currentProjectName = useProjectSessionStore((s) => s.currentProjectName);
  const setCurrentProject = useProjectSessionStore((s) => s.setCurrentProject);
  const clearCurrentProject = useProjectSessionStore((s) => s.clearCurrentProject);

  const [projects, setProjects] = useState<SavedGameProjectSummary[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(loadCatalog);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);

  const selectedProjectIdRef = useRef<number | null>(selectedProjectId);
  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setProjectLoadError(null);

    try {
      const projectList = await resolveSavedGameProjects(
        { limit },
        {
          consumerId: "useSharedProjectSelection.loadProjects",
          bypassCache,
        },
      );
      setProjects(projectList);

      const activeProjectId = selectedProjectIdRef.current;
      if (autoSelectFirst && activeProjectId == null && projectList.length > 0) {
        const firstProject = projectList[0];
        if (firstProject) {
          setCurrentProject({
            projectId: firstProject.id,
            projectName: firstProject.name,
            projectSourceWorldId: firstProject.source_world_id ?? null,
            projectUpdatedAt: firstProject.updated_at,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProjectLoadError(message);
      setProjects([]);
      throw error;
    } finally {
      setIsLoadingProjects(false);
    }
  }, [autoSelectFirst, limit, setCurrentProject, bypassCache]);

  useEffect(() => {
    if (!loadCatalog) {
      setIsLoadingProjects(false);
      return;
    }
    void loadProjects().catch(() => {});
  }, [loadCatalog, loadProjects]);

  const setSelectedProjectId = useCallback(
    (projectId: number | null) => {
      if (projectId == null) {
        clearCurrentProject();
        return;
      }

      const matched = projects.find((entry) => entry.id === projectId);
      setCurrentProject({
        projectId,
        projectName: matched?.name ?? null,
        projectSourceWorldId: matched?.source_world_id ?? null,
        projectUpdatedAt: matched?.updated_at ?? null,
      });
    },
    [clearCurrentProject, projects, setCurrentProject],
  );

  const selectedProjectName = useMemo(() => {
    const matched = selectedProjectId != null
      ? projects.find((entry) => entry.id === selectedProjectId)
      : null;
    return matched?.name ?? currentProjectName ?? null;
  }, [currentProjectName, projects, selectedProjectId]);

  return {
    projects,
    selectedProjectId,
    selectedProjectName,
    selectedProjectSource: effectiveIds.projectSource,
    setSelectedProjectId,
    isLoadingProjects,
    projectLoadError,
    reloadProjects: loadProjects,
  };
}
