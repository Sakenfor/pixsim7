import { useMemo } from "react";

import type { AuthoringContextSource } from "./useAuthoringContext";
import { useAuthoringContext } from "./useAuthoringContext";

export interface RequiredAuthoringWorldResult {
  worldId: number | null;
  isReady: boolean;
  missingReason: "missing-world" | null;
  source: AuthoringContextSource;
}

/**
 * Guard hook that wraps {@link useAuthoringContext} and surfaces a simple
 * "world required" check.  Panels can use `missingReason` to render a
 * consistent empty/missing state without duplicating null-check logic.
 */
export function useRequiredAuthoringWorld(): RequiredAuthoringWorldResult {
  const ctx = useAuthoringContext();

  return useMemo(
    () => ({
      worldId: ctx.worldId,
      isReady: ctx.worldId != null,
      missingReason: ctx.worldId != null ? null : ("missing-world" as const),
      source: ctx.source,
    }),
    [ctx.worldId, ctx.source],
  );
}
