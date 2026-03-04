import { useMemo } from "react";

import { resolveAuthoringContext } from "../domain/authoringContextResolution";
import type {
  EditorContextSnapshot,
  WorldContextSummary,
} from "../domain/capabilities";
import {
  CAP_EDITOR_CONTEXT,
  CAP_WORLD_CONTEXT,
} from "../domain/capabilityKeys";

import { useCapability, usePanelContext } from "./useCapability";
import { useProjectContext } from "./useProjectContext";

// Re-export types so consumers can import from hooks barrel
export type {
  AuthoringContext,
  AuthoringContextSource,
  PanelAuthoringContextOverride,
  ResolveAuthoringContextInput,
} from "../domain/authoringContextResolution";

/**
 * Canonical authoring-context hook.
 *
 * Resolution order:
 *  1. Panel override (`CAP_PANEL_CONTEXT`) — only when `followActive === false`
 *  2. Project context (`CAP_PROJECT_CONTEXT`)
 *  3. World context  (`CAP_WORLD_CONTEXT`)
 *  4. Editor fallback (`CAP_EDITOR_CONTEXT`)
 *  5. None
 *
 * @see {@link resolveAuthoringContext} for the pure resolution logic.
 */
export function useAuthoringContext() {
  const panelCtx = usePanelContext();
  const projectCtx = useProjectContext();
  const { value: worldCtx } =
    useCapability<WorldContextSummary>(CAP_WORLD_CONTEXT);
  const { value: editorCtx } =
    useCapability<EditorContextSnapshot>(CAP_EDITOR_CONTEXT);

  return useMemo(
    () =>
      resolveAuthoringContext({ panelCtx, projectCtx, worldCtx, editorCtx }),
    [panelCtx, projectCtx, worldCtx, editorCtx],
  );
}
