import { useMemo } from "react";

import type { ViewerAsset } from "@features/assets";
import { CAP_ASSET_SELECTION, useCapability, type AssetSelection } from "@features/contextHub";

import type { RuntimeSourceCandidate } from "../lib/runtimeResolution";

import { useResolvedRuntimeSource } from "./useResolvedRuntimeSource";

type AssetSource = "params" | "context" | "selection";

interface AssetContextLike {
  currentAsset?: ViewerAsset | null;
}

interface UseResolvedPanelAssetOptions {
  context?: AssetContextLike;
  params?: Record<string, any>;
  precedence?: readonly AssetSource[];
}

const DEFAULT_PRECEDENCE: readonly AssetSource[] = ["context", "params", "selection"];

/**
 * Generic asset resolver for context-aware panels.
 * Keeps source precedence explicit and reusable without binding panels
 * to any host-specific store implementation.
 */
export function useResolvedPanelAsset({
  context,
  params,
  precedence = DEFAULT_PRECEDENCE,
}: UseResolvedPanelAssetOptions): ViewerAsset | null {
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);
  const candidates = useMemo<RuntimeSourceCandidate<AssetSource, ViewerAsset | null>[]>(
    () => [
      {
        source: "context",
        enabled: !!context?.currentAsset,
        value: context?.currentAsset ?? null,
      },
      {
        source: "params",
        enabled: !!params?.asset,
        value: (params?.asset as ViewerAsset | undefined) ?? null,
      },
      {
        source: "selection",
        enabled: !!selection?.asset,
        value: selection?.asset ?? null,
      },
    ],
    [context?.currentAsset, params?.asset, selection?.asset],
  );

  return useResolvedRuntimeSource(candidates, precedence, null);
}
