## Task 97: HUD Editor & Overlay Unified Integration

**Status:** Complete (HUD plumbing & guide in `bfad883`, extended docs in `865ddf0`)

### Summary

The HUD editor (`HudEditor.tsx`) and overlay system now share a common editable core (`editing-core/unifiedConfig.ts`), but they still operate largely independently:

- HUD editor has its own placement/preset logic.
+- Overlay uses `UnifiedSurfaceConfig` and widget registry for portable presets.

This task brings HUD editor closer to the overlay/unified pipeline so HUD layouts can:

- Share widget types and presets where appropriate.
- Benefit from the same unified configuration model and registry.

---

### Goals

1. Introduce a path for HUD to read/write `UnifiedSurfaceConfig` for HUD surfaces.
2. Reuse overlay widget registry + unified config pieces where it makes sense (e.g., shared widgets such as badges, panels, progress indicators).
3. Keep HUD-specific concepts (regions, gameplay visibility conditions) layered on top without forcing them into the pure overlay model.

---

### Scope

In scope:

- HUD editor:
  - `apps/main/src/components/hud-editor/HudEditor.tsx`
  - Any existing HUD presets/config helpers.
- Editable core:
  - `apps/main/src/lib/editing-core/unifiedConfig.ts`
  - `apps/main/src/lib/editing-core/registry/widgetRegistry.ts`
- Overlay/shared widgets where reused by HUD.

Out of scope:

- Major HUD UX redesign (this task focuses on configuration plumbing).
- New gameplay logic or world/session integration.

---

### Plan

1. **Audit HUD configuration model**
   - Identify how HUD currently stores placements, visibility, and widget types:
     - What maps cleanly to `UnifiedSurfaceConfig` (regions, positions, basic styles)?
     - What is HUD-specific (gameplay visibility conditions, world/session references)?

2. **Define HUD `componentType` and surface IDs**
   - Choose a `componentType` for HUD in unified configs (e.g., `"hud"`).
   - Standardize how HUD surfaces are identified (e.g., `"hud-main"`, `"hud-debug"`), aligning with `UnifiedSurfaceConfig.id`.

3. **HUD ↔ unified config converters**
   - Add HUD-specific converters analogous to `overlayConfig.ts`, for example:
     - `hudToUnifiedSurfaceConfig(hudConfig) → UnifiedSurfaceConfig`
     - `hudFromUnifiedSurfaceConfig(unifiedConfig) → hudConfig`
   - Map HUD regions to `UnifiedPosition.mode === 'region'` where appropriate; use `anchor` or `absolute` where regions don’t apply.
   - Use `UnifiedVisibility.advanced` for gameplay-specific conditions (quest, time-of-day, etc.).

4. **Registry integration for shared widgets**
   - For widgets that exist in both systems (e.g., badges, panels, progress bars):
     - Ensure the widget registry can construct them in a HUD context (e.g., `componentType: 'hud'`).
     - Reuse shared widget factories or add HUD-specific variants if needed (but keep configs unified).

5. **Thread unified configs through HudEditor**
   - Introduce a layer in `HudEditor` that:
     - Reads HUD configs via unified config converters when loading/persisting presets.
     - Uses unified configs as the internal representation where possible, or at least as a boundary format.
   - If appropriate, reuse parts of the overlay editor components for HUD where the UX patterns match (e.g., widget list, basic property editing).

---

### Acceptance Criteria

- There is a documented mapping between HUD configuration and `UnifiedSurfaceConfig`.
- HUD surfaces can be serialized/deserialized using the unified configuration model.
- Shared widgets (badges/panels/progress where used) can be created via the widget registry in a HUD context.
- Existing HUD behavior is preserved; the integration is additive and behind the scenes from a user perspective.

---

### Risks / Notes

- HUD’s gameplay-specific visibility conditions may not map 1:1 to overlay’s simpler triggers; use `UnifiedVisibility.advanced` carefully and document any lossy mappings.
- Keep an eye on circular dependencies between HUD, overlay, and editing-core; converters and registries should live in lib layers, not components, to avoid tight coupling.
