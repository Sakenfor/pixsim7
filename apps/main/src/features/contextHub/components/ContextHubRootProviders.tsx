import { useMemo } from "react";
import { useEditorContext } from "@lib/context";
import {
  CAP_SCENE_CONTEXT,
  CAP_WORLD_CONTEXT,
  CAP_EDITOR_CONTEXT,
  useProvideCapability,
  type EditorContextSnapshot,
  type SceneContextSummary,
  type WorldContextSummary,
} from "@features/contextHub";

export function ContextHubRootProviders() {
  const editorContext = useEditorContext();

  const sceneValue = useMemo<SceneContextSummary>(
    () => ({
      sceneId: editorContext.scene.id,
      title: editorContext.scene.title ?? null,
    }),
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

  const editorProvider = useMemo(
    () => ({
      id: "editorContext",
      label: "Editor Context",
      priority: 10,
      exposeToContextMenu: true,
      getValue: (): EditorContextSnapshot => editorContext,
    }),
    [editorContext],
  );

  useProvideCapability(CAP_EDITOR_CONTEXT, editorProvider, [editorContext], {
    scope: "root",
  });

  return null;
}
