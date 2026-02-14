import { Ref } from "@pixsim7/shared.types";
import { useEffect, useMemo } from "react";

import { useEditorContext } from "@lib/context";
import {
  isAnyAuthoringProjectBundleContributorDirty,
  subscribeAuthoringProjectBundleDirtyState,
} from "@lib/game/projectBundle";

import {
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_PROJECT_CONTEXT,
  CAP_EDITOR_CONTEXT,
  useProvideCapability,
  type EditorContextSnapshot,
  type ProjectContextSummary,
  type SceneContextSummary,
  type WorldContextSummary,
} from "@features/contextHub";
import { useProjectSessionStore } from "@features/scene";

import { ContextHubCapabilityBridge } from "./ContextHubCapabilityBridge";

export function ContextHubRootProviders() {
  const editorContext = useEditorContext();
  const currentProjectId = useProjectSessionStore((state) => state.currentProjectId);
  const currentProjectName = useProjectSessionStore((state) => state.currentProjectName);
  const currentProjectSourceWorldId = useProjectSessionStore((state) => state.currentProjectSourceWorldId);
  const currentProjectUpdatedAt = useProjectSessionStore((state) => state.currentProjectUpdatedAt);
  const sourceFileName = useProjectSessionStore((state) => state.sourceFileName);
  const schemaVersion = useProjectSessionStore((state) => state.schemaVersion);
  const extensionKeys = useProjectSessionStore((state) => state.extensionKeys);
  const extensionWarnings = useProjectSessionStore((state) => state.extensionWarnings);
  const coreWarnings = useProjectSessionStore((state) => state.coreWarnings);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const lastImportedAt = useProjectSessionStore((state) => state.lastImportedAt);
  const lastExportedAt = useProjectSessionStore((state) => state.lastExportedAt);
  const lastOperation = useProjectSessionStore((state) => state.lastOperation);
  const setDirty = useProjectSessionStore((state) => state.setDirty);

  useEffect(() => {
    setDirty(isAnyAuthoringProjectBundleContributorDirty());

    return subscribeAuthoringProjectBundleDirtyState((nextDirty) => {
      useProjectSessionStore.getState().setDirty(nextDirty);
    });
  }, [setDirty]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useProjectSessionStore.getState().dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const sceneValue = useMemo<SceneContextSummary>(
    () => {
      const sceneId = editorContext.scene.id;
      const numericSceneId = sceneId != null ? Number(sceneId) : NaN;
      const ref = Number.isFinite(numericSceneId)
        ? Ref.scene(numericSceneId)
        : null;

      return {
        sceneId,
        title: editorContext.scene.title ?? null,
        ref,
      };
    },
    [editorContext.scene.id, editorContext.scene.title],
  );

  const worldValue = useMemo<WorldContextSummary>(
    () => ({
      worldId: editorContext.world.id,
      name: editorContext.world.name ?? null,
    }),
    [editorContext.world.id, editorContext.world.name],
  );

  const sceneProvider = useMemo(
    () => ({
      id: "editorScene",
      label: "Editor Scene",
      priority: 20,
      exposeToContextMenu: true,
      isAvailable: () => sceneValue.sceneId != null,
      getValue: () => sceneValue,
    }),
    [sceneValue],
  );

  const worldProvider = useMemo(
    () => ({
      id: "editorWorld",
      label: "Editor World",
      priority: 20,
      exposeToContextMenu: true,
      isAvailable: () => worldValue.worldId != null,
      getValue: () => worldValue,
    }),
    [worldValue],
  );

  useProvideCapability(CAP_SCENE_CONTEXT, sceneProvider, [sceneValue], {
    scope: "root",
  });
  useProvideCapability(CAP_WORLD_CONTEXT, worldProvider, [worldValue], {
    scope: "root",
  });

  const projectValue = useMemo<ProjectContextSummary>(
    () => ({
      worldId: editorContext.world.id,
      projectId: currentProjectId,
      projectName: currentProjectName,
      projectSourceWorldId: currentProjectSourceWorldId,
      projectUpdatedAt: currentProjectUpdatedAt,
      sourceFileName,
      schemaVersion,
      extensionKeys,
      extensionWarnings,
      coreWarnings,
      dirty,
      lastImportedAt,
      lastExportedAt,
      lastOperation,
    }),
    [
      editorContext.world.id,
      currentProjectId,
      currentProjectName,
      currentProjectSourceWorldId,
      currentProjectUpdatedAt,
      sourceFileName,
      schemaVersion,
      extensionKeys,
      extensionWarnings,
      coreWarnings,
      dirty,
      lastImportedAt,
      lastExportedAt,
      lastOperation,
    ],
  );

  const projectProvider = useMemo(
    () => ({
      id: "projectSession",
      label: "Project Session",
      priority: 20,
      exposeToContextMenu: true,
      isAvailable: () =>
        projectValue.worldId != null ||
        projectValue.lastImportedAt != null ||
        projectValue.lastExportedAt != null,
      getValue: () => projectValue,
    }),
    [projectValue],
  );

  useProvideCapability(CAP_PROJECT_CONTEXT, projectProvider, [projectValue], {
    scope: "root",
  });

  const editorSnapshot = useMemo<EditorContextSnapshot>(() => {
    const locationRef =
      editorContext.world.locationId != null
        ? Ref.location(editorContext.world.locationId)
        : null;
    const sceneId = editorContext.scene.id;
    const numericSceneId = sceneId != null ? Number(sceneId) : NaN;
    const sceneRef = Number.isFinite(numericSceneId)
      ? Ref.scene(numericSceneId)
      : null;

    return {
      ...editorContext,
      world: {
        ...editorContext.world,
        locationRef,
      },
      scene: {
        ...editorContext.scene,
        ref: sceneRef,
      },
    };
  }, [editorContext]);

  const editorProvider = useMemo(
    () => ({
      id: "editorContext",
      label: "Editor Context",
      priority: 10,
      exposeToContextMenu: true,
      getValue: (): EditorContextSnapshot => editorSnapshot,
    }),
    [editorSnapshot],
  );

  useProvideCapability(CAP_EDITOR_CONTEXT, editorProvider, [editorSnapshot], {
    scope: "root",
  });

  return <ContextHubCapabilityBridge />;
}

