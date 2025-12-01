## Task 94: Overlay Unified Config & Editor Integration

### Summary

The overlay system (Media Card overlays, HUD-style overlays, etc.) now has:

- A solid runtime layer (`OverlayContainer`, `OverlayWidget`, widget factories).
- A shared editable-core model (`UnifiedSurfaceConfig`, `UnifiedWidgetConfig` in `editing-core/unifiedConfig.ts`).
- A basic visual editor (`apps/main/src/components/overlay-editor/OverlayEditor.tsx`) and property editor.
- Validation/accessibility refinements (Task 93) including `handlesOwnInteraction`.

However, several integration pieces are still incomplete:

- Overlay ↔ unified config conversion is shallow (drops widget-specific props and bindings).
- The overlay editor works directly on `OverlayConfiguration`, not on unified configs.
- Widget creation/editing is type-agnostic and doesn’t use the widget registry or default configs.

This task wires those layers together in a logical sequence so overlay presets become truly portable and editable across surfaces (cards, HUD, etc.).

---

### Task Checklist

- [x] 94.1 – Registry-Based Reconstruction Path ✅ (2025-12-01)
- [x] 94.2 – Bindings & Widget Props Round-Trip ✅ (2025-12-01)
- [x] 94.3 – OverlayEditor Type-Aware Creation & Editing ✅ (2025-12-01)
- [x] 94.4 – Visibility Trigger Fidelity ✅ (2025-12-01)

**Completion Summary:**
- ✅ Widget registry extended with factory support
- ✅ `overlayWidgetRegistry.ts` created with badge, panel, upload, button factories
- ✅ `buildOverlayConfigFromUnified()` implemented for full reconstruction
- ✅ Widget-specific props and bindings preserved in round-trip conversion
- ✅ `TypeSpecificProperties` component created for type-aware editing
- ✅ Overlay-specific visibility triggers preserved via advanced conditions
- ✅ Comprehensive integration guide created (`INTEGRATION_GUIDE.md`)
- **Commit:** `a85d863` - "Implement overlay unified config and editor integration (Task 94)"
- **Branch:** `claude/review-implement-changes-01B264iQH1emnSDDhoNxPz4u`

---

### Recommended Order of Work

1. **Registry-based reconstruction path**
2. **Binding & widget props round-trip in unified configs**
3. **OverlayEditor type-aware widget creation & editing**
4. **Visibility trigger fidelity between overlay and unified**

Working in this order ensures that:

- We can reconstruct real widgets from `UnifiedWidgetConfig` before we start exporting richer data.
- Once bindings/props are preserved, the editor can meaningfully tweak them.
- Only after basic semantics are stable do we expand visibility mapping to cover more advanced triggers.

---

### 94.1 Registry-Based Reconstruction Path

**Goal:** Given a `UnifiedSurfaceConfig` + widget registry, reconstruct fully functional `OverlayWidget` instances (with `render`, `onClick`, bindings, etc.) instead of only structural shells.

**Key Files:**

- `apps/main/src/lib/editing-core/registry/widgetRegistry.ts`
- `apps/main/src/lib/overlay/overlayConfig.ts`
- `apps/main/src/lib/overlay/widgets/*.tsx`

**Plan:**

- Extend the widget registry so overlay widget types (`badge`, `button`, `panel`, `menu`, `tooltip`, `upload`, `video-scrub`, etc.) can be registered with:
  - A stable `type` string.
  - A factory that can take:
    - `UnifiedWidgetConfig` (or overlay-style partial widget config).
    - Optionally the unified bindings list.
    - Runtime helpers (like `onClick` callbacks where appropriate).
  - And return a fully configured `OverlayWidget`.
- Add a helper in overlay layer, e.g. `buildOverlayWidgetsFromUnified(surfaceConfig, registry, runtimeOptions)` that:
  - Iterates `surfaceConfig.widgets`, and for each:
    - Looks up a widget factory by `config.type`.
    - Constructs a concrete `OverlayWidget` instance.
  - Returns an `OverlayConfiguration` with real `widgets` attached.
- Adjust `overlayConfig.fromUnifiedWidget` (or add a new helper) so it joins with the registry rather than returning an unconnected `Partial<OverlayWidget>` that lacks `render`.

**Acceptance Criteria:**

- There is a documented way to go from a `UnifiedSurfaceConfig` to an `OverlayConfiguration` whose widgets are actually renderable.
- Media Card and HUD (if desired) can use the same registry pattern to reconstruct overlay widgets from unified configs.

---

### 94.2 Bindings & Widget Props Round-Trip

**Goal:** Ensure overlay widgets’ key props and data bindings can be exported to, and re-imported from, `UnifiedWidgetConfig.bindings` / `props`.

**Key Files:**

- `apps/main/src/lib/overlay/overlayConfig.ts`
- `apps/main/src/lib/overlay/widgets/{BadgeWidget,PanelWidget,UploadWidget,VideoScrubWidget,ProgressWidget}.tsx`
- `apps/main/src/lib/editing-core/unifiedConfig.ts`

**Plan:**

- Decide the minimal binding/props surface to support for v1, for example:
  - `BadgeWidget`: `variant`, `icon`, `label`/`labelBinding`.
  - `PanelWidget`: `title`, `content` binding (probably just treat content as JSON/keys, not JSX).
  - `UploadWidget`: `stateBinding`, `progressBinding`.
  - `VideoScrubWidget`: `videoUrlBinding`, `durationBinding`.
- In `overlayConfig.toUnifiedWidget`:
  - Extract widget-specific props and bindings into:
    - `UnifiedWidgetConfig.props` (safe JSON-friendly values).
    - `UnifiedWidgetConfig.bindings` (using `UnifiedDataBinding` where appropriate).
- Extend `fromUnifiedWidget` to:
  - Recreate those widget-specific props as part of the `Partial<OverlayWidget>` (or as inputs to the widget factory in 94.1).
  - For bindings, map `UnifiedDataBinding` back into the appropriate `DataBinding<T>` fields on widgets.
- Document what is and isn’t supported in this first iteration (e.g. complex JSX content not round-tripped).

**Acceptance Criteria:**

- Exporting a typical Media Card overlay configuration to `UnifiedSurfaceConfig` and re-importing it preserves:
  - Widget IDs, types, positions, visibility, style.
  - Core icon/label/state bindings for the supported widget types.
- Unsupported properties are explicitly documented as such (no silent, surprising behavior).

---

### 94.3 OverlayEditor Type-Aware Creation & Editing

**Goal:** Make the overlay editor aware of widget types and defaults, and expose at least basic type-specific properties for editing (not just position/visibility/style).

**Key Files:**

- `apps/main/src/components/overlay-editor/OverlayEditor.tsx`
- `apps/main/src/components/overlay-editor/WidgetPropertyEditor.tsx`
- `apps/main/src/components/overlay-editor/WidgetList.tsx`
- Overlay widgets and/or registry from 94.1.

**Plan:**

- Use `availableWidgetTypes.defaultConfig` when adding widgets:
  - Instead of hard-coded `render: () => <div>New Widget</div>`, use a default from the type registry (or at least a better per-type stub).
  - Ensure new widgets include a basic `style` object so the style controls can always be shown and edited.
- Make `WidgetPropertyEditor` type-aware:
  - Keep generic sections (position, visibility, style, interactive, ariaLabel, tabIndex, priority).
  - Add a simple per-type extension mechanism, e.g.:
    - A mapping from `widget.type` to a small “props editor” component that edits values in `widget` or in a `widget.props` bag.
    - Example: for `badge`, allow editing `icon`, `variant`, `color` and a “static label” field when not using bindings.
- Ensure the overlay editor doesn’t try to directly edit non-serializable fields (like actual `render` functions), but works on the data/config level that maps cleanly to unified configs.

**Acceptance Criteria:**

- Adding a widget from the editor creates a usable instance with sensible defaults per type.
- For common types (badge, panel, button), the editor allows editing at least a subset of type-specific props that match what is exported in 94.2.
- The editor still composes cleanly with the underlying `OverlayConfiguration` / unified config converters.

---

### 94.4 Visibility Trigger Fidelity

**Goal:** Improve how visibility triggers are mapped between overlay and unified configs, so more runtime semantics survive round-trip when needed.

**Key Files:**

- `apps/main/src/lib/overlay/types.ts` (VisibilityConfig, VisibilityTrigger)
- `apps/main/src/lib/overlay/overlayConfig.ts` (to/from UnifiedVisibility)
- `apps/main/src/lib/editing-core/unifiedConfig.ts` (AdvancedVisibilityCondition)

**Plan:**

- Audit which overlay triggers are actually used in current overlays:
  - `hover-container`, `hover-sibling`, `active`, custom `{ condition: string }`.
- Extend `UnifiedVisibility` usage (and/or its `advanced` conditions) to encode more overlay-specific triggers, for example:
  - Map `hover-container` to an advanced condition with type `"overlayTrigger"` and params `{ trigger: 'hover-container' }`.
  - Same pattern for `hover-sibling`, `active`, etc.
- Update `toUnifiedVisibility` and `fromUnifiedVisibility` to:
  - Preserve overlay-specific triggers via `advanced` when possible.
  - Fall back to `simple: 'always'` only when there is no meaningful mapping.
- Keep the editor-side UX simple for now:
  - OverlayEditor may still only expose a limited set of triggers; advanced ones can be considered an expert feature or left for future HUD/editor work.

**Acceptance Criteria:**

- When exporting/importing configs that use `hover-container` or other overlay-specific triggers, the core semantics are preserved in `UnifiedSurfaceConfig` and restored back to overlay configs.
- Existing simple triggers continue to work exactly as before.

---

### Non-Goals / Out of Scope

- Full HUD editor integration (that’s covered by Task 101+).
- Backward migration of older, legacy overlay configs not using unified formats.
- Adding brand-new widget types; the focus here is on making existing ones portable and editable.

