## Task 96: Overlay Editor UX & Validation

**Status:** Complete (merged via `865ddf0`)

### Summary

The overlay editor is functionally wired into the overlay system and unified config layer (Tasks 93/94), but its UX is still minimal:

- Type-aware property editing exists, but only for a subset of props.
- Validation output (`validateConfiguration`, `lintConfiguration`) is not surfaced in the editor UI.
- There is no quick feedback for common mistakes (overlapping widgets, missing ariaLabel, invalid triggers).

This task focuses on making the overlay editor more usable and safer without changing underlying data contracts.

---

### Goals

1. Surface overlay validation results directly in the editor UI.
2. Provide lightweight, type-aware property editors for the most common widget types.
3. Improve affordances for adding/removing/reordering widgets and understanding their impact on the preview.
4. Keep behavior backward-compatible; no changes to `OverlayConfiguration` or unified schema.

---

### Scope

In scope:

- Editor UI:
  - `apps/main/src/components/overlay-editor/OverlayEditor.tsx`
  - `apps/main/src/components/overlay-editor/WidgetPropertyEditor.tsx`
  - `apps/main/src/components/overlay-editor/TypeSpecificProperties.tsx`
  - `apps/main/src/components/overlay-editor/WidgetList.tsx`
- Overlay validation helpers:
  - `apps/main/src/lib/overlay/utils/validation.ts`

Out of scope:

- HUD editor UX (separate surface, Task 97).
- Changes to overlay runtime behavior (visibility, positioning, collision detection).

---

### Plan

1. **Validation display in the editor**
   - Add a small validation panel in `OverlayEditor` or `WidgetPropertyEditor` that:
     - Runs `validateConfiguration` + `lintConfiguration` on the current config (not just in dev console).
     - Groups results by severity: Errors, Warnings, Info.
     - Highlights issues per widget (e.g. by widget ID) and links to/selects the problematic widget in the list when clicked.

2. **Inline hints for common issues**
   - For wrapper-driven interactive widgets (`interactive && !handlesOwnInteraction`):
     - Display an inline hint when `ariaLabel` is missing (mirroring `MISSING_ARIA_LABEL`).
   - For overlapping widgets (when `OVERLAPPING_WIDGETS` is reported):
     - Optionally show a simple banner/hint in the editor describing the issue and suggesting enabling `collisionDetection` or adjusting positions.

3. **Type-specific property editors polish**
   - Extend `TypeSpecificProperties` to cover more props for:
     - `badge`: color presets, icon picker, simple label input.
     - `button`: label, variant, size, optional icon.
     - `panel`: title, variant, backdrop toggle.
     - `upload`: label overrides (idle/uploading/success/error), showProgress toggle.
   - Ensure the property editors operate on data fields that are already mapped through unified config (Task 94/95), to keep everything serializable.

4. **Editor affordances**
   - Consider small UX enhancements such as:
     - Visual indication of the currently-selected widget in the preview (e.g. a subtle outline).
     - Simple “duplicate widget” action in `WidgetList` (clone with new ID and slight position offset).
     - Confirm dialog for destructive actions if needed (optional).

5. **Optional: minimal tests**
   - If test infrastructure is available, add one or two focused tests for:
     - Validation panel correctly showing errors for an intentionally broken config.
     - Type-specific editor updating the correct widget fields.

---

### Acceptance Criteria

- Overlay editor shows validation issues (errors/warnings/info) without requiring devtools console.
- Clicking a validation issue that references a widget selects that widget in the editor.
- Type-specific property panels exist for at least `badge`, `button`, `panel`, `upload` and map to the same fields used by unified config converters/registry.
- No changes to the underlying `OverlayConfiguration` or unified schema; all improvements are in UI/UX and use existing validation logic.

---

### Risks / Notes

- Validation should be throttled/debounced in the editor to avoid running on every keystroke in large configs; using a small debounce or running on blur/save is acceptable.
- Keep the editor’s UI focused; avoid turning it into a full-blown form-builder in this task.
