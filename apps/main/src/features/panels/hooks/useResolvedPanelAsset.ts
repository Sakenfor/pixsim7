import { useMemo } from "react";

import type { ViewerAsset } from "@features/assets";
import { CAP_ASSET_SELECTION, useCapability, type AssetSelection } from "@features/contextHub";

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

  return useMemo(() => {
    for (const source of precedence) {
      if (source === "context" && context?.currentAsset) {
        return context.currentAsset;
      }
      if (source === "params" && params?.asset) {
        return params.asset as ViewerAsset;
      }
      if (source === "selection" && selection?.asset) {
        return selection.asset;
      }
    }
    return null;
  }, [context?.currentAsset, params?.asset, selection?.asset, precedence]);
}

