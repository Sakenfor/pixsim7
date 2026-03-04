import type {
  EditorContextSnapshot,
  ProjectContextSummary,
  WorldContextSummary,
} from "./capabilities";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthoringContextSource =
  | "panel-override"
  | "project-context"
  | "world-context"
  | "editor-fallback"
  | "none";

export interface AuthoringContext {
  projectId: number | null;
  worldId: number | null;
  projectSourceWorldId: number | null;
  source: AuthoringContextSource;
  followActive: boolean;
  isReady: boolean;
}

/**
 * Optional override shape that a panel context may include to lock authoring
 * to a specific project/world instead of following the global active context.
 */
export interface PanelAuthoringContextOverride {
  followActive?: boolean;
  projectId?: number | null;
  worldId?: number | null;
}

export interface ResolveAuthoringContextInput {
  panelCtx: unknown;
  projectCtx: ProjectContextSummary | null;
  worldCtx: WorldContextSummary | null;
  editorCtx: EditorContextSnapshot | null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to extract authoring-override fields from an arbitrary panel context
 * object. Returns `null` when the panel context does not carry override fields.
 */
export function extractPanelOverride(
  panelCtx: unknown,
): PanelAuthoringContextOverride | null {
  if (!panelCtx || typeof panelCtx !== "object") return null;
  const ctx = panelCtx as Record<string, unknown>;
  if (!("followActive" in ctx || "projectId" in ctx || "worldId" in ctx)) {
    return null;
  }
  return {
    followActive:
      typeof ctx.followActive === "boolean" ? ctx.followActive : undefined,
    projectId:
      typeof ctx.projectId === "number" || ctx.projectId === null
        ? (ctx.projectId as number | null)
        : undefined,
    worldId:
      typeof ctx.worldId === "number" || ctx.worldId === null
        ? (ctx.worldId as number | null)
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Pure resolution function.
 *
 * Resolution order:
 *  1. Panel override (`CAP_PANEL_CONTEXT`) — only when `followActive === false`
 *  2. Project context (`CAP_PROJECT_CONTEXT`)
 *  3. World context  (`CAP_WORLD_CONTEXT`)
 *  4. Editor fallback (`CAP_EDITOR_CONTEXT`)
 *  5. None
 */
export function resolveAuthoringContext(
  input: ResolveAuthoringContextInput,
): AuthoringContext {
  const { panelCtx, projectCtx, worldCtx, editorCtx } = input;
  const override = extractPanelOverride(panelCtx);
  const followActive = override?.followActive !== false;

  // 1. Panel override (explicit lock)
  if (override && !followActive) {
    return {
      projectId: override.projectId ?? null,
      worldId: override.worldId ?? null,
      projectSourceWorldId: null,
      source: "panel-override",
      followActive: false,
      isReady: override.projectId != null || override.worldId != null,
    };
  }

  // 2. Project context
  if (projectCtx?.projectId != null) {
    return {
      projectId: projectCtx.projectId,
      worldId: projectCtx.worldId ?? null,
      projectSourceWorldId: projectCtx.projectSourceWorldId ?? null,
      source: "project-context",
      followActive,
      isReady: true,
    };
  }

  // 3. World context
  if (worldCtx?.worldId != null) {
    return {
      projectId: null,
      worldId: worldCtx.worldId,
      projectSourceWorldId: null,
      source: "world-context",
      followActive,
      isReady: true,
    };
  }

  // 4. Editor fallback
  if (editorCtx?.world?.id != null) {
    return {
      projectId: null,
      worldId: editorCtx.world.id,
      projectSourceWorldId: null,
      source: "editor-fallback",
      followActive,
      isReady: true,
    };
  }

  // 5. None
  return {
    projectId: null,
    worldId: null,
    projectSourceWorldId: null,
    source: "none",
    followActive,
    isReady: false,
  };
}
