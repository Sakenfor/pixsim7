import {
  projectBundleExtensionRegistry,
  registerProjectBundleExtension,
  type ProjectBundleExtensionHandler,
  type ProjectBundleExtensionImportOutcome,
} from '@lib/game/projectBundle';

import { useGraphStore } from '@features/graph/stores/graphStore';

import type { DraftScene, SceneMetadata } from '@domain/sceneBuilder';

export const SCENE_GRAPH_PROJECT_EXTENSION_KEY = 'authoring.scene_graph';
const SCENE_GRAPH_PROJECT_EXTENSION_VERSION = 1;

interface SceneGraphProjectExtensionPayloadV1 {
  version: number;
  scenes: Record<string, DraftScene>;
  sceneMetadata: Record<string, SceneMetadata>;
  currentSceneId: string | null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseSceneGraphPayload(raw: unknown): SceneGraphProjectExtensionPayloadV1 | null {
  if (!isObjectRecord(raw)) {
    return null;
  }

  const version = raw.version;
  if (version !== undefined && version !== SCENE_GRAPH_PROJECT_EXTENSION_VERSION) {
    return null;
  }

  const scenes = raw.scenes;
  if (!isObjectRecord(scenes)) {
    return null;
  }

  const sceneMetadata = raw.sceneMetadata;
  if (sceneMetadata !== undefined && !isObjectRecord(sceneMetadata)) {
    return null;
  }

  const currentSceneId = raw.currentSceneId;
  if (currentSceneId !== undefined && currentSceneId !== null && typeof currentSceneId !== 'string') {
    return null;
  }

  return {
    version: SCENE_GRAPH_PROJECT_EXTENSION_VERSION,
    scenes: scenes as Record<string, DraftScene>,
    sceneMetadata: (sceneMetadata || {}) as Record<string, SceneMetadata>,
    currentSceneId: (typeof currentSceneId === 'string' ? currentSceneId : null),
  };
}

function restoreSceneGraph(payload: SceneGraphProjectExtensionPayloadV1): ProjectBundleExtensionImportOutcome {
  if (Object.keys(payload.scenes).length === 0) {
    return {
      warnings: ['authoring.scene_graph payload was present but had no scenes'],
    };
  }

  const serialized = JSON.stringify({
    scenes: payload.scenes,
    sceneMetadata: payload.sceneMetadata,
  });

  const graphStore = useGraphStore.getState();
  graphStore.importProject(serialized);

  if (payload.currentSceneId && useGraphStore.getState().scenes[payload.currentSceneId]) {
    useGraphStore.getState().loadScene(payload.currentSceneId);
  }

  return {};
}

const sceneGraphProjectExtensionHandler: ProjectBundleExtensionHandler<unknown> = {
  key: SCENE_GRAPH_PROJECT_EXTENSION_KEY,

  export: () => {
    const graphState = useGraphStore.getState();
    if (!graphState.scenes || Object.keys(graphState.scenes).length === 0) {
      return null;
    }

    return {
      version: SCENE_GRAPH_PROJECT_EXTENSION_VERSION,
      scenes: cloneJson(graphState.scenes),
      sceneMetadata: cloneJson(graphState.sceneMetadata || {}),
      currentSceneId: graphState.currentSceneId ?? null,
    } satisfies SceneGraphProjectExtensionPayloadV1;
  },

  import: (payload, context) => {
    // context.response.id_maps is available for future ID remap hooks.
    void context.response.id_maps;

    const parsed = parseSceneGraphPayload(payload);
    if (!parsed) {
      return {
        warnings: ['authoring.scene_graph payload is invalid and was ignored'],
      };
    }

    return restoreSceneGraph(parsed);
  },
};

export function registerSceneGraphProjectBundleExtension(): void {
  if (projectBundleExtensionRegistry.has(SCENE_GRAPH_PROJECT_EXTENSION_KEY)) {
    return;
  }
  registerProjectBundleExtension(sceneGraphProjectExtensionHandler);
}
