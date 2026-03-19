import { useMemo } from "react";

import {
  CAP_EDITOR_CONTEXT,
  type EditorContextSnapshot,
} from "../domain/capabilities";

import type { AuthoringContextSource } from "./useAuthoringContext";
import { useAuthoringContext } from "./useAuthoringContext";
import { useCapability } from "./useCapability";

type SourceTag = "override" | "authoring-context" | "editor-runtime" | "fallback" | "none";

export interface UseEffectiveAuthoringIdsOptions {
  worldIdOverride?: number | null;
  sessionIdOverride?: number | null;
  projectIdOverride?: number | null;
  fallbackWorldId?: number | null;
  fallbackSessionId?: number | null;
  fallbackProjectId?: number | null;
}

export interface EffectiveAuthoringIds {
  projectId: number | null;
  worldId: number | null;
  sessionId: number | null;
  projectSourceWorldId: number | null;
  authoringSource: AuthoringContextSource;
  followActive: boolean;
  worldSource: SourceTag;
  sessionSource: SourceTag;
  projectSource: SourceTag;
  hasWorld: boolean;
  hasSession: boolean;
  hasProject: boolean;
}

export function useEffectiveAuthoringIds(
  options: UseEffectiveAuthoringIdsOptions = {},
): EffectiveAuthoringIds {
  const authoring = useAuthoringContext();
  const { value: editorContext } =
    useCapability<EditorContextSnapshot>(CAP_EDITOR_CONTEXT);
  const {
    worldIdOverride,
    sessionIdOverride,
    projectIdOverride,
    fallbackWorldId,
    fallbackSessionId,
    fallbackProjectId,
  } = options;

  return useMemo(() => {
    let worldId: number | null;
    let worldSource: SourceTag;
    if (worldIdOverride !== undefined) {
      worldId = worldIdOverride ?? null;
      worldSource = "override";
    } else if (authoring.worldId != null) {
      worldId = authoring.worldId;
      worldSource = "authoring-context";
    } else if (fallbackWorldId != null) {
      worldId = fallbackWorldId;
      worldSource = "fallback";
    } else {
      worldId = null;
      worldSource = "none";
    }

    let sessionId: number | null;
    let sessionSource: SourceTag;
    if (sessionIdOverride !== undefined) {
      sessionId = sessionIdOverride ?? null;
      sessionSource = "override";
    } else if (editorContext?.runtime?.sessionId != null) {
      sessionId = editorContext.runtime.sessionId;
      sessionSource = "editor-runtime";
    } else if (fallbackSessionId != null) {
      sessionId = fallbackSessionId;
      sessionSource = "fallback";
    } else {
      sessionId = null;
      sessionSource = "none";
    }

    let projectId: number | null;
    let projectSource: SourceTag;
    if (projectIdOverride !== undefined) {
      projectId = projectIdOverride ?? null;
      projectSource = "override";
    } else if (authoring.projectId != null) {
      projectId = authoring.projectId;
      projectSource = "authoring-context";
    } else if (fallbackProjectId != null) {
      projectId = fallbackProjectId;
      projectSource = "fallback";
    } else {
      projectId = null;
      projectSource = "none";
    }

    return {
      projectId,
      worldId,
      sessionId,
      projectSourceWorldId: authoring.projectSourceWorldId,
      authoringSource: authoring.source,
      followActive: authoring.followActive,
      worldSource,
      sessionSource,
      projectSource,
      hasWorld: worldId != null,
      hasSession: sessionId != null,
      hasProject: projectId != null,
    };
  }, [
    authoring,
    editorContext,
    worldIdOverride,
    sessionIdOverride,
    projectIdOverride,
    fallbackWorldId,
    fallbackSessionId,
    fallbackProjectId,
  ]);
}
