import { describe, expect, it } from "vitest";

import type { AuthoringContext } from "../../domain/authoringContextResolution";
import { resolveAuthoringContext } from "../../domain/authoringContextResolution";

/**
 * Pure-function equivalent of useRequiredAuthoringWorld:
 * derives required-world result from an AuthoringContext.
 */
function deriveRequiredWorld(ctx: AuthoringContext) {
  return {
    worldId: ctx.worldId,
    isReady: ctx.worldId != null,
    missingReason: ctx.worldId != null ? null : ("missing-world" as const),
    source: ctx.source,
  };
}

const EMPTY_INPUT = {
  panelCtx: null,
  projectCtx: null,
  worldCtx: null,
  editorCtx: null,
};

describe("useRequiredAuthoringWorld (pure logic)", () => {
  it('returns "missing-world" when worldId is null', () => {
    const ctx = resolveAuthoringContext(EMPTY_INPUT);
    const result = deriveRequiredWorld(ctx);
    expect(result).toEqual({
      worldId: null,
      isReady: false,
      missingReason: "missing-world",
      source: "none",
    });
  });

  it("returns isReady=true and missingReason=null when worldId is present", () => {
    const ctx = resolveAuthoringContext({
      ...EMPTY_INPUT,
      projectCtx: { projectId: 1, worldId: 42 },
    });
    const result = deriveRequiredWorld(ctx);
    expect(result).toEqual({
      worldId: 42,
      isReady: true,
      missingReason: null,
      source: "project-context",
    });
  });

  it("forwards editor-fallback source", () => {
    const ctx = resolveAuthoringContext({
      ...EMPTY_INPUT,
      editorCtx: {
        world: { id: 7, locationId: null },
        scene: { id: null, selection: [] },
        runtime: { sessionId: null, worldTimeSeconds: null, mode: null },
        workspace: { activePresetId: null, activePanels: [] },
        editor: { primaryView: "scene", mode: "edit" },
      },
    });
    const result = deriveRequiredWorld(ctx);
    expect(result.source).toBe("editor-fallback");
    expect(result.isReady).toBe(true);
  });

  it("forwards world-context source", () => {
    const ctx = resolveAuthoringContext({
      ...EMPTY_INPUT,
      worldCtx: { worldId: 10 },
    });
    const result = deriveRequiredWorld(ctx);
    expect(result.source).toBe("world-context");
    expect(result.isReady).toBe(true);
  });

  it("panel-override with no world returns missing-world", () => {
    const ctx = resolveAuthoringContext({
      ...EMPTY_INPUT,
      panelCtx: { followActive: false, projectId: 5 },
    });
    const result = deriveRequiredWorld(ctx);
    expect(result.isReady).toBe(false);
    expect(result.missingReason).toBe("missing-world");
    expect(result.source).toBe("panel-override");
  });

  it("panel-override with world returns ready", () => {
    const ctx = resolveAuthoringContext({
      ...EMPTY_INPUT,
      panelCtx: { followActive: false, worldId: 77 },
    });
    const result = deriveRequiredWorld(ctx);
    expect(result.isReady).toBe(true);
    expect(result.worldId).toBe(77);
    expect(result.missingReason).toBeNull();
  });
});
