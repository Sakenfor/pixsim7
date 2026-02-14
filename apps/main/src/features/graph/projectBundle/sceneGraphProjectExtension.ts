import {
  hasAuthoringProjectBundleContributor,
  registerAuthoringProjectBundleContributor,
} from '@lib/game/projectBundle/contributors';
import type {
  AuthoringProjectBundleContributor,
  ProjectBundleExtensionImportOutcome,
} from '@lib/game/projectBundle/types';

import { useGraphStore, type GraphState } from '@features/graph/stores/graphStore';

import type { DraftScene, SceneMetadata } from '@domain/sceneBuilder';

export const SCENE_GRAPH_PROJECT_EXTENSION_KEY = 'authoring.scene_graph';
const SCENE_GRAPH_PROJECT_EXTENSION_VERSION = 1;
const SCENE_GRAPH_EMPTY_SCENES_WARNING =
  'authoring.scene_graph payload was present but had no scenes';
const SCENE_GRAPH_INVALID_PAYLOAD_WARNING =
  'authoring.scene_graph payload is invalid and was ignored';

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

function serializeSceneGraphState(
  state: Pick<GraphState, 'scenes' | 'sceneMetadata' | 'currentSceneId'>,
): string {
  return JSON.stringify({
    scenes: state.scenes,
    sceneMetadata: state.sceneMetadata || {},
    currentSceneId: state.currentSceneId ?? null,
  });
}

let sceneGraphBaseline = serializeSceneGraphState(useGraphStore.getState());

function markSceneGraphBaseline(): void {
  sceneGraphBaseline = serializeSceneGraphState(useGraphStore.getState());
}

function isSceneGraphDirtyFromState(
  state: Pick<GraphState, 'scenes' | 'sceneMetadata' | 'currentSceneId'>,
): boolean {
  return serializeSceneGraphState(state) !== sceneGraphBaseline;
}

function subscribeSceneGraphDirty(
  listener: (dirty: boolean) => void,
): () => void {
  return useGraphStore.subscribe((state, previousState) => {
    if (
      state.scenes === previousState.scenes &&
      state.sceneMetadata === previousState.sceneMetadata &&
      state.currentSceneId === previousState.currentSceneId
    ) {
      return;
    }

    listener(isSceneGraphDirtyFromState(state));
  });
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
  if (
    currentSceneId !== undefined &&
    currentSceneId !== null &&
    typeof currentSceneId !== 'string'
  ) {
    return null;
  }

  return {
    version: SCENE_GRAPH_PROJECT_EXTENSION_VERSION,
    scenes: scenes as Record<string, DraftScene>,
    sceneMetadata: (sceneMetadata || {}) as Record<string, SceneMetadata>,
    currentSceneId: typeof currentSceneId === 'string' ? currentSceneId : null,
  };
}

function restoreSceneGraph(
  payload: SceneGraphProjectExtensionPayloadV1,
): ProjectBundleExtensionImportOutcome {
  if (Object.keys(payload.scenes).length === 0) {
    return {
      warnings: [SCENE_GRAPH_EMPTY_SCENES_WARNING],
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

export const authoringProjectBundleContributor: AuthoringProjectBundleContributor<unknown> = {
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
        warnings: [SCENE_GRAPH_INVALID_PAYLOAD_WARNING],
      };
    }

    const outcome = restoreSceneGraph(parsed);
    if (Object.keys(parsed.scenes).length > 0) {
      markSceneGraphBaseline();
    }
    return outcome;
  },

  getDirtyState: () => isSceneGraphDirtyFromState(useGraphStore.getState()),

  clearDirtyState: () => {
    markSceneGraphBaseline();
  },

  subscribeDirtyState: (listener) => subscribeSceneGraphDirty(listener),
};

// Backward-compatible explicit entrypoint used by older call sites.
export function registerSceneGraphProjectBundleExtension(): void {
  if (hasAuthoringProjectBundleContributor(SCENE_GRAPH_PROJECT_EXTENSION_KEY)) {
    return;
  }

  markSceneGraphBaseline();
  registerAuthoringProjectBundleContributor(authoringProjectBundleContributor);
}
