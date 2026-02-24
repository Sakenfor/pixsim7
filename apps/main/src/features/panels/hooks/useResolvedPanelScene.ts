import { useMemo } from "react";

import {
  CAP_SCENE_CONTEXT,
  useCapability,
  type SceneContextSummary,
} from "@features/contextHub";

type SceneSource = "params" | "context" | "capability";

interface SceneContextLike {
  currentSceneId?: string | number | null;
}

interface UseResolvedPanelSceneOptions {
  context?: SceneContextLike;
  params?: Record<string, any>;
  precedence?: readonly SceneSource[];
}

const DEFAULT_PRECEDENCE: readonly SceneSource[] = ["context", "params", "capability"];

/**
 * Generic scene resolver for context-aware panels.
 * Returns a normalized scene ID string when available.
 */
export function useResolvedPanelScene({
  context,
  params,
  precedence = DEFAULT_PRECEDENCE,
}: UseResolvedPanelSceneOptions): string | null {
  const { value: sceneContext } = useCapability<SceneContextSummary>(CAP_SCENE_CONTEXT);

  return useMemo(() => {
    const capabilitySceneId = sceneContext?.sceneId;
    for (const source of precedence) {
      if (source === "context" && context?.currentSceneId != null) {
        return String(context.currentSceneId);
      }
      if (source === "params" && params?.sceneId != null) {
        return String(params.sceneId);
      }
      if (source === "capability" && capabilitySceneId != null) {
        return String(capabilitySceneId);
      }
    }
    return null;
  }, [context?.currentSceneId, params?.sceneId, sceneContext?.sceneId, precedence]);
}

