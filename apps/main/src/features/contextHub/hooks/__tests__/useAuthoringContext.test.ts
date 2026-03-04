import { describe, expect, it } from "vitest";

import {
  extractPanelOverride,
  resolveAuthoringContext,
  type ResolveAuthoringContextInput,
} from "../../domain/authoringContextResolution";
import type { EditorContextSnapshot } from "../../domain/capabilities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY: ResolveAuthoringContextInput = {
  panelCtx: null,
  projectCtx: null,
  worldCtx: null,
  editorCtx: null,
};

function makeEditorCtx(worldId: number | null): EditorContextSnapshot {
  return {
    world: { id: worldId, locationId: null },
    scene: { id: null, selection: [] },
    runtime: { sessionId: null, worldTimeSeconds: null, mode: null },
    workspace: { activePresetId: null, activePanels: [] },
    editor: { primaryView: "scene", mode: "edit" },
  };
}

// ---------------------------------------------------------------------------
// extractPanelOverride
// ---------------------------------------------------------------------------

describe("extractPanelOverride", () => {
  it("returns null for null/undefined/primitive", () => {
    expect(extractPanelOverride(null)).toBeNull();
    expect(extractPanelOverride(undefined)).toBeNull();
    expect(extractPanelOverride(42)).toBeNull();
    expect(extractPanelOverride("hello")).toBeNull();
  });

  it("returns null when object has no override fields", () => {
    expect(extractPanelOverride({ unrelated: true })).toBeNull();
  });

  it("extracts followActive boolean", () => {
    const result = extractPanelOverride({ followActive: false });
    expect(result).toEqual({
      followActive: false,
      projectId: undefined,
      worldId: undefined,
    });
  });

  it("extracts numeric projectId and worldId", () => {
    const result = extractPanelOverride({ projectId: 5, worldId: 10 });
    expect(result?.projectId).toBe(5);
    expect(result?.worldId).toBe(10);
  });

  it("extracts null worldId explicitly", () => {
    const result = extractPanelOverride({ worldId: null });
    expect(result?.worldId).toBeNull();
  });

  it("ignores non-number/non-null worldId values", () => {
    const result = extractPanelOverride({ worldId: "bad" });
    expect(result?.worldId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveAuthoringContext — source: none
// ---------------------------------------------------------------------------

describe("resolveAuthoringContext", () => {
  it('returns "none" when no context is available', () => {
    expect(resolveAuthoringContext(EMPTY)).toEqual({
      projectId: null,
      worldId: null,
      projectSourceWorldId: null,
      source: "none",
      followActive: true,
      isReady: false,
    });
  });

  // ---- editor-fallback ---------------------------------------------------

  it('returns "editor-fallback" when only editor context has a world', () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      editorCtx: makeEditorCtx(42),
    });
    expect(result.source).toBe("editor-fallback");
    expect(result.worldId).toBe(42);
    expect(result.projectId).toBeNull();
    expect(result.isReady).toBe(true);
  });

  // ---- world-context -----------------------------------------------------

  it('returns "world-context" when world context is available', () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      worldCtx: { worldId: 10, name: "Test World" },
    });
    expect(result.source).toBe("world-context");
    expect(result.worldId).toBe(10);
    expect(result.isReady).toBe(true);
  });

  it("world-context beats editor-fallback", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      worldCtx: { worldId: 10 },
      editorCtx: makeEditorCtx(99),
    });
    expect(result.source).toBe("world-context");
    expect(result.worldId).toBe(10);
  });

  // ---- project-context ---------------------------------------------------

  it('returns "project-context" when project context is available', () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      projectCtx: {
        projectId: 5,
        worldId: 20,
        projectSourceWorldId: 15,
        projectName: "Bananza",
      },
      worldCtx: { worldId: 99 },
    });
    expect(result.source).toBe("project-context");
    expect(result.projectId).toBe(5);
    expect(result.worldId).toBe(20);
    expect(result.projectSourceWorldId).toBe(15);
    expect(result.isReady).toBe(true);
  });

  it("project-context beats world-context and editor-fallback", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      projectCtx: { projectId: 1, worldId: 2 },
      worldCtx: { worldId: 50 },
      editorCtx: makeEditorCtx(60),
    });
    expect(result.source).toBe("project-context");
    expect(result.worldId).toBe(2);
  });

  it("project context without worldId still reports project-context source", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      projectCtx: { projectId: 7 },
    });
    expect(result.source).toBe("project-context");
    expect(result.projectId).toBe(7);
    expect(result.worldId).toBeNull();
    expect(result.isReady).toBe(true);
  });

  // ---- panel-override ----------------------------------------------------

  it('returns "panel-override" when followActive is false', () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      panelCtx: { followActive: false, projectId: 100, worldId: 200 },
      projectCtx: { projectId: 1, worldId: 2 },
    });
    expect(result.source).toBe("panel-override");
    expect(result.projectId).toBe(100);
    expect(result.worldId).toBe(200);
    expect(result.followActive).toBe(false);
    expect(result.isReady).toBe(true);
  });

  it("panel override with no IDs has isReady=false", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      panelCtx: { followActive: false },
    });
    expect(result.source).toBe("panel-override");
    expect(result.isReady).toBe(false);
    expect(result.projectId).toBeNull();
    expect(result.worldId).toBeNull();
  });

  it("panel override with null worldId explicitly sets worldId to null", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      panelCtx: { followActive: false, worldId: null, projectId: 3 },
    });
    expect(result.source).toBe("panel-override");
    expect(result.worldId).toBeNull();
    expect(result.projectId).toBe(3);
    expect(result.isReady).toBe(true);
  });

  // ---- followActive behavior ---------------------------------------------

  it("falls through to global when followActive is true (explicit)", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      panelCtx: { followActive: true, projectId: 999, worldId: 888 },
      projectCtx: { projectId: 1, worldId: 2 },
    });
    expect(result.source).toBe("project-context");
    expect(result.followActive).toBe(true);
    expect(result.projectId).toBe(1);
  });

  it("falls through to global when followActive is omitted", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      panelCtx: { projectId: 999, worldId: 888 },
      worldCtx: { worldId: 50 },
    });
    expect(result.source).toBe("world-context");
    expect(result.followActive).toBe(true);
    expect(result.worldId).toBe(50);
  });

  it("followActive defaults to true when panel context has no override fields", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      panelCtx: { someOtherProp: true },
    });
    expect(result.followActive).toBe(true);
  });

  it("followActive defaults to true when panel context is null", () => {
    const result = resolveAuthoringContext(EMPTY);
    expect(result.followActive).toBe(true);
  });

  // ---- projectSourceWorldId propagation ----------------------------------

  it("propagates projectSourceWorldId from project context", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      projectCtx: { projectId: 3, worldId: 4, projectSourceWorldId: 55 },
    });
    expect(result.projectSourceWorldId).toBe(55);
  });

  it("projectSourceWorldId is null for non-project sources", () => {
    const result = resolveAuthoringContext({
      ...EMPTY,
      worldCtx: { worldId: 10 },
    });
    expect(result.projectSourceWorldId).toBeNull();
  });
});
