import { useMemo } from "react";

import {
  CAP_SCENE_CONTEXT,
  useCapability,
  type SceneContextSummary,
} from "@features/contextHub";

import type { RuntimeSourceCandidate } from "../lib/runtimeResolution";

import { useResolvedRuntimeSource } from "./useResolvedRuntimeSource";

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
  const candidates = useMemo<RuntimeSourceCandidate<SceneSource, string | null>[]>(
    () => [
      {
        source: "context",
        enabled: context?.currentSceneId != null,
        value: context?.currentSceneId != null ? String(context.currentSceneId) : null,
      },
      {
        source: "params",
        enabled: params?.sceneId != null,
        value: params?.sceneId != null ? String(params.sceneId) : null,
      },
      {
        source: "capability",
        enabled: sceneContext?.sceneId != null,
        value: sceneContext?.sceneId != null ? String(sceneContext.sceneId) : null,
      },
    ],
    [context?.currentSceneId, params?.sceneId, sceneContext?.sceneId],
  );

  return useResolvedRuntimeSource(candidates, precedence, null);
}
