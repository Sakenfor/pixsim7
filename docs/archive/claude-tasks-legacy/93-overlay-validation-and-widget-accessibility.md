## Task 63: Overlay Validation & Widget Accessibility Cleanup

**Status:** Complete (merged in `b56fa8c4`)

### Problem Statement

The new overlay positioning system (used by `MediaCard` and other surfaces) includes a validation layer in `apps/main/src/lib/overlay/utils/validation.ts`. This layer is currently:

- Emitting **noisy dev-time logs** for certain widget types where the validation rule does not match their intended interaction model (e.g. `INTERACTIVE_WITHOUT_CLICK` for menu/tooltip widgets that handle interaction internally).
- Running validation on every render of `OverlayContainer`, which can be more frequent than strictly necessary.
- Not fully aligned with the **accessibility expectations** expressed in `OverlayWidget` (e.g. when to apply `role="button"`, `tabIndex`, and `ariaLabel`).

This task aims to tighten the contract between:

- `OverlayWidget` (runtime behavior),
- the various widget factories (`BadgeWidget`, `ButtonWidget`, `MenuWidget`, `TooltipWidget`, `UploadWidget`, `VideoScrubWidget`, etc.),
- and `utils/validation.ts` (static/lint-style checks),

so that:

1. Validation output is **actionable and low-noise** during development.
2. Interactive overlays have **reasonable accessibility defaults** (role, keyboard, labels) without excessive boilerplate.
3. Developer ergonomics for adding new widget types remain good (clear rules and patterns).

---

### Scope

In scope (frontend only):

- Overlay core:
  - `apps/main/src/lib/overlay/OverlayContainer.tsx`
  - `apps/main/src/lib/overlay/OverlayWidget.tsx`
  - `apps/main/src/lib/overlay/types.ts`
  - `apps/main/src/lib/overlay/utils/validation.ts`
  - `apps/main/src/lib/overlay/utils/visibility.ts` (only if needed)
- Built-in widgets:
  - `apps/main/src/lib/overlay/widgets/BadgeWidget.tsx`
  - `apps/main/src/lib/overlay/widgets/ButtonWidget.tsx`
  - `apps/main/src/lib/overlay/widgets/MenuWidget.tsx`
  - `apps/main/src/lib/overlay/widgets/TooltipWidget.tsx`
  - `apps/main/src/lib/overlay/widgets/UploadWidget.tsx`
  - `apps/main/src/lib/overlay/widgets/VideoScrubWidget.tsx`
- Media Card usage:
  - `apps/main/src/components/media/MediaCard.tsx`
  - `apps/main/src/components/media/mediaCardWidgets.ts`
  - `apps/main/src/routes/OverlayConfig.tsx` (for overlay editor)

Out of scope:

- Backend changes.
- Scene/world/NPC gameplay systems.
- Adding new overlay surfaces beyond what already exists (MediaCard, future video player/HUD are referenced but not implemented here).

---

### Current Observations (from devtools)

When rendering `MediaCard`, the overlay validator logs:

- `[Overlay] Validation issues for "Media Card"`
- `Warnings: (3) [...]`
- `Info: (3) [...]`

The `Info` entries include:

- `{ widgetId: 'status-menu', code: 'INTERACTIVE_WITHOUT_CLICK', ... }`
- `{ widgetId: 'technical-tags', code: 'INTERACTIVE_WITHOUT_CLICK', ... }`
- `{ widgetId: 'generation-menu', code: 'INTERACTIVE_WITHOUT_CLICK', ... }`

These widgets are created via:

- `createStatusWidget` → `createMenuWidget` (`status-menu`)
- `createTagsTooltip` → `createTooltipWidget` (`technical-tags`)
- `createGenerationMenu` → `createMenuWidget` (`generation-menu`)

The **outer overlay widgets** are marked `interactive: true`, but their click/keyboard behavior is implemented internally (inside the menu/tooltip component), not via the `OverlayWidget.onClick` callback. The current lint rule:

```ts
if (widget.interactive && !widget.onClick) {
  // INTERACTIVE_WITHOUT_CLICK
}
```

does not account for this pattern and produces false-positive informational logs.

---

### Goals

1. **Reduce false-positive validation noise**
   - Make `INTERACTIVE_WITHOUT_CLICK` more precise so it only fires when there is a genuine issue, not for widget types that are intentionally internally interactive.

2. **Clarify and tighten the widget interaction contract**
   - Define when widget factories should:
     - set `interactive: true` and rely on the overlay wrapper for click/keyboard handling, versus
     - manage their own interaction internally and treat the overlay wrapper as a purely positional/container element.

3. **Improve accessibility defaults**
   - Ensure that overlay widgets with `interactive: true` have reasonable `ariaLabel` / label behavior, and that `OverlayWidget` only applies `role="button"` / `tabIndex` when appropriate.

4. **Make validation ergonomics better**
   - Ensure `validateAndLog` is called at appropriate times (not excessively on every render).
   - Optionally allow configuration to control how verbose validation is in development.

---

### Proposed Changes

#### 63.1: Refine `INTERACTIVE_WITHOUT_CLICK` Rule

**Files:**

- `apps/main/src/lib/overlay/utils/validation.ts`
- `apps/main/src/lib/overlay/types.ts` (if new metadata is introduced)

**Plan:**

- Update `lintConfiguration` to avoid flagging widget types that are expected to handle interaction internally, e.g.:
  - `menu`
  - `tooltip`
  - potentially `upload`, `video-scrub`, etc. (audit each type).
- Implementation options:
  - Simple: Hard-code a list of exempt types:

    ```ts
    const INTERNAL_INTERACTIVE_TYPES = ['menu', 'tooltip', 'video-scrub', 'upload'];

    if (widget.interactive && !widget.onClick && !INTERNAL_INTERACTIVE_TYPES.includes(widget.type)) {
      // emit INTERACTIVE_WITHOUT_CLICK
    }
    ```

  - More extensible: Introduce a flag on `OverlayWidget`:

    ```ts
    interface OverlayWidget {
      // ...
      interactive?: boolean;
      handlesOwnInteraction?: boolean; // new
    }
    ```

    Then widget factories that own their internal click/keyboard behavior can set `handlesOwnInteraction: true` and the validator can check that flag instead of a hard-coded list.

**Acceptance:**

- Rendering a `MediaCard` no longer logs `INTERACTIVE_WITHOUT_CLICK` for:
  - `status-menu`
  - `technical-tags`
  - `generation-menu`
- Genuine misconfigurations (e.g. a `badge` widget marked `interactive: true` with no `onClick`) still produce an actionable info/warning entry.

---

#### 63.2: Clarify Widget Interaction Responsibilities

**Files:**

- `apps/main/src/lib/overlay/OverlayWidget.tsx`
- `apps/main/src/lib/overlay/widgets/*.tsx`
- Docs: `docs/OVERLAY_DATA_BINDING.md` or a new `docs/OVERLAY_WIDGET_CONTRACTS.md`

**Plan:**

- Document and implement a clear contract:
  - **Wrapper-driven interaction** (`interactive: true`, `onClick` defined):
    - `OverlayWidget` applies `role="button"`, `tabIndex`, and delegates clicks/keyboard to `onWidgetClick`, which then calls `widget.onClick(data)`.
    - Suitable for `ButtonWidget`, click-only badges, etc.
  - **Internally interactive widgets**:
    - Widgets like `MenuWidget` and `TooltipWidget` manage their own focus, keyboard, and click behaviors internally.
    - For these, either:
      - Set `interactive: false` on the `OverlayWidget` and let the inner React subtree handle all interactivity, or
      - Set a dedicated flag (e.g. `handlesOwnInteraction: true`) and adjust `OverlayWidget` to skip wrapper-level click/key handlers for such widgets.
- Ensure widget factories are consistent:
  - `ButtonWidget`: wrapper-driven interaction (keep `interactive: true`, require `onClick`).
  - `MenuWidget` / `TooltipWidget`: choose one pattern and apply it consistently, then align validation rules.

**Acceptance:**

- Widget factories and `OverlayWidget` behavior are aligned (no widget is “double interactive” in a way that confuses focus or keyboard handling).
- A brief doc section explains which pattern to use for new widget types and what flags to set.

---

#### 63.3: Accessibility Improvements

**Files:**

- `apps/main/src/lib/overlay/OverlayWidget.tsx`
- `apps/main/src/lib/overlay/widgets/*.tsx`

**Plan:**

- Ensure that overlay widgets with `interactive: true` have a usable `ariaLabel`:
  - For `ButtonWidget`, derive from `label` if no explicit `tooltip` is provided.
  - For `MenuWidget` and `TooltipWidget`, consider:
    - Setting `ariaLabel` based on `trigger.label` or a concise default (e.g. `"Open menu"`).
    - Or, when using `handlesOwnInteraction`, move ARIA attributes into the inner trigger elements instead of the wrapper.
- In `OverlayWidget`, only apply:

  ```tsx
  role={widget.interactive ? 'button' : undefined}
  tabIndex={widget.tabIndex}
  ```

  when the wrapper is actually the main interactive element. If a `handlesOwnInteraction` flag is introduced, skip these for widgets that own their interaction internally.

**Acceptance:**

- Keyboard navigation and screen reader behavior for overlay widgets are sensible and predictable:
  - Buttons and click badges are focusable and announced meaningfully.
  - Menus/tooltips either expose their own focusable triggers or are not mis-labeled as generic “button” wrappers.

---

#### 63.4: Validation Behavior & Dev Ergonomics

**Files:**

- `apps/main/src/lib/overlay/OverlayContainer.tsx`
- `apps/main/src/lib/overlay/utils/validation.ts`

**Plan:**

- Move `validateAndLog(configuration)` into a `useEffect` in `OverlayContainer` so validation runs:
  - Only when the `configuration` object identity changes, not on every render.
  - Only in development (as it already checks `process.env.NODE_ENV`).

  Example:

  ```ts
  useEffect(() => {
    if (validate) {
      validateAndLog(configuration);
    }
  }, [validate, configuration]);
  ```

- Optionally extend the props for `OverlayContainer` to accept a `validationLevel` or `validationMode`:

  ```ts
  type ValidationMode = 'off' | 'errors' | 'errors-and-warnings' | 'all';
  ```

  and thread this through to `validateAndLog` so noisy views (like the asset gallery) can run a lighter mode if desired.

**Acceptance:**

- Validation still runs in development and catches structural issues.
- Re-rendering the same configuration (e.g. hover state changes) does not spam repeated validation logs.
- Optionally, asset-heavy views can reduce log volume by lowering validation mode without entirely disabling it.

---

### Risks & Considerations

- Changing interaction contracts (e.g. toggling `interactive` flags or introducing `handlesOwnInteraction`) may affect:
  - Existing keyboard navigation paths.
  - How focus is managed inside menus/tooltips.
  - How automated tests (if any) locate interactive elements.
- Validation rule changes must preserve existing **error-level** checks (invalid IDs, positions, visibility configs) and only relax noisy **info-level** checks.
- Any new fields on `OverlayWidget` should be added conservatively and documented to avoid over-complicating widget implementations.

---

### Verification Checklist

- [ ] Load `OverlayConfig` route and preview the Media Card:
  - [ ] No `INTERACTIVE_WITHOUT_CLICK` messages for `status-menu`, `technical-tags`, or `generation-menu`.
  - [ ] Genuine misconfigurations in a test config (e.g. `interactive` badge with no `onClick`) still trigger a clear validation entry.
- [ ] Tab through a `MediaCard`:
  - [ ] Buttons and click badges are focusable and announced with a meaningful label.
  - [ ] Menus and tooltips expose accessible triggers without redundant or misleading roles.
- [ ] Confirm that `validateAndLog` runs when:
  - [ ] Switching overlay presets.
  - [ ] Loading a saved configuration.
  - [ ] Editing configuration in the overlay editor.
- [ ] Confirm that frequent hover/focus changes on the same configuration do **not** spam console logs.

---

### Follow-Ups (Optional)

If this task lands cleanly, follow-ups could include:

- A small test suite for `validateConfiguration` / `lintConfiguration`, covering:
  - Valid configs.
  - Broken widget IDs and positions.
  - Misconfigured visibility triggers.
  - Interactive widgets with and without click handlers.
- A short dedicated doc (or section in an existing doc) that enumerates:
  - Built-in widget types.
  - Their expected interaction pattern.
  - Any per-type validation or accessibility conventions.
