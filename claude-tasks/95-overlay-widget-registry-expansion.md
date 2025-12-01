## Task 95: Overlay Widget Registry Expansion

**Status:** Complete (merged via `865ddf0`)

### Summary

Tasks 93 and 94 established a solid base for the overlay system:

- Wrapper vs. internal interaction (`handlesOwnInteraction`).
- Unified config converters (`toUnifiedSurfaceConfig`, `fromUnifiedSurfaceConfig`).
- Registry-based reconstruction for core widgets (`badge`, `panel`, `upload`, `button`).

This task broadens the registry and unified config support to more overlay widget types, so a larger portion of the UI can use portable, editor-friendly presets.

---

### Goals

1. Add registry coverage and unified round-trip support for additional overlay widget types.
2. Ensure these widgets can be created from `UnifiedWidgetConfig` and exported back with meaningful props/bindings preserved.
3. Keep the contract consistent with editing-core (`UnifiedSurfaceConfig`, `UnifiedWidgetConfig`, `UnifiedDataBinding`).

---

### Scope

In scope:

- Overlay widgets:
  - `MenuWidget` (`menu`)
  - `TooltipWidget` (`tooltip`)
  - `VideoScrubWidget` (`video-scrub`)
  - `ProgressWidget` (`progress`)
  - Any HUD-reusable overlay widgets that are already implemented
- Registry and converters:
  - `apps/main/src/lib/overlay/overlayWidgetRegistry.ts`
  - `apps/main/src/lib/overlay/overlayConfig.ts`
  - `apps/main/src/lib/editing-core/registry/widgetRegistry.ts` (if needed)

Out of scope:

- New widget types not already present in the overlay layer.
- HUD editor integration (covered in Task 97).

---

### Plan

1. **Audit existing widgets and types**
   - Confirm the canonical `widget.type` strings for:
     - menu, tooltip, video-scrub, progress.
   - Identify which props / bindings are important to preserve for each.

2. **Extend unified converters**
   - In `overlayConfig.toUnifiedWidget`:
     - Add `case 'menu'`, `case 'tooltip'`, `case 'video-scrub'`, `case 'progress'`.
     - Extract serializable props into `props` (e.g. trigger type, placement, showTimeline) and bindings into `bindings` where appropriate.
   - In `fromUnifiedWidget` (if used directly) or in per-widget factories (see #3):
     - Reconstruct these props/bindings back into overlay widget config structures.

3. **Add registry factories**
   - In `overlayWidgetRegistry.ts`, register factories for:
     - `menu`
     - `tooltip`
     - `video-scrub`
     - `progress`
   - For each, map from `UnifiedWidgetConfig` to the corresponding widget config type:
     - e.g., `MenuWidgetConfig`, `TooltipWidgetConfig`, `VideoScrubWidgetConfig`, `ProgressWidgetConfig`.
   - Define reasonable `defaultConfig` entries for each type so they can be created from the editor.

4. **Validation and examples**
   - Add (or update) examples in `apps/main/src/lib/overlay/INTEGRATION_GUIDE.md` showing how to:
     - Export a unified config that includes these widgets.
     - Rebuild overlay widgets from a unified config via the registry.
   - Optionally add a small unit test or story-level check to ensure factories are registered and basic round-trip works.

---

### Acceptance Criteria

- `overlayWidgetRegistry` supports at least:
  - `badge`, `panel`, `upload`, `button` (from Task 94) and now also `menu`, `tooltip`, `video-scrub`, `progress`.
- `toUnifiedSurfaceConfig` and the registry-based reconstruction path preserve:
  - Positions, visibility, style.
  - Key props and bindings for the expanded widget set.
- The overlay editor can add these widget types via registry defaults, and they render correctly using the registry path.

---

### Risks / Notes

- Some widget props (e.g. complex tooltip `content.custom`, menu item arrays) may be difficult or impossible to serialize cleanly; start with a minimal supported subset and clearly document limitations.
- Keep runtime behavior unchanged; the registry path should only affect how widgets are configured/constructed, not how they behave once rendered.
