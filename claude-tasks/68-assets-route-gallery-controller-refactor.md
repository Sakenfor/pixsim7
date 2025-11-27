**Task 68: Assets Route & Gallery Controller Refactor**

> **For Agents**
> - Refactors the `/assets` route and gallery surfaces to separate UI layout from data/control logic.
> - Mirrors the pattern used for `QuickGenerateModule` (Task 67): controller hook + bindings + pure helpers.
> - Use this task when you:
>   - Touch `apps/main/src/routes/Assets.tsx` or gallery surfaces that drive generation actions.
>   - Need to add new gallery behaviors (filters, batch actions, generation shortcuts) without bloating components.
> - Read first:
>   - `apps/main/src/routes/Assets.tsx`
>   - `apps/main/src/hooks/useAssets.ts`
>   - `apps/main/src/hooks/useMediaGenerationActions.ts`
>   - `apps/main/src/stores/assetPickerStore.ts`
>   - `apps/main/src/stores/workspaceStore.ts`
>   - Related gallery surfaces:
>     - `apps/main/src/components/assets/ReviewGallerySurface.tsx`
>     - `apps/main/src/components/widgets/GalleryGridWidget.tsx`
>     - `apps/main/src/components/assets/LocalFoldersPanel.tsx`

---

## Context

Current state (as of 2025-11-27):

- `apps/main/src/routes/Assets.tsx` is a large, multi-responsibility component that:
  - Manages URL and sessionStorage-backed filters (query, tag, provider, media type, provider_status).
  - Coordinates pagination and loading via `useAssets`.
  - Orchestrates selection mode via `useAssetPickerStore` and workspace panel closing.
  - Handles gallery selection state, viewer opening/closing, and detail panel.
  - Wires up `MediaCard` actions to generation flows via `useMediaGenerationActions`:
    - `onImageToVideo` → `queueImageToVideo`
    - `onVideoExtend` → `queueVideoExtend`
    - `onAddToTransition` → `queueAddToTransition`
    - `onAddToGenerate` → `queueAutoGenerate`
  - Implements deletion (API call + local state update + reset).
  - Renders all the above logic in a single JSX tree (tabs, filters, banners, gallery grid, selection overlays).

This makes `AssetsRoute` hard to evolve:

- Adding new filters, batch actions, or generation shortcuts requires touching a large mixed JSX + logic file.
- Gallery behaviors are partially duplicated in other surfaces (e.g., `ReviewGallerySurface`, `GalleryGridWidget`).
- There is no single “controller” hook that other gallery UIs can reuse; most logic lives inline in components.

We recently decoupled the Control Center “Generate” UI via:

- `buildGenerationRequest` (pure helper in `apps/main/src/lib/control/quickGenerateLogic.ts`).
- `useQuickGenerateBindings` (hook for active asset + queues + params).
- `useQuickGenerateController` (orchestration hook used by `QuickGenerateModule`).

We want a similar pattern for `/assets` and gallery surfaces.

---

## Goals

1. **Extract an Assets controller hook for logic:**
   - Move filter management, paging, selection-mode orchestration, and per-card actions into a dedicated hook.
   - Keep `AssetsRoute` mostly declarative (wiring UI elements to controller state/actions).

2. **Provide a reusable gallery-surface controller:**
   - Allow components like `ReviewGallerySurface` and `GalleryGridWidget` to reuse core behaviors
     (selection, generation actions, badges) without re-implementing logic.

3. **Prepare for future gallery UX changes:**
   - Make it easy to add:
     - New filters or scopes.
     - Batch operations (e.g. “Apply preset to N assets”, “Queue N assets for transition”).
     - Surface-specific configurations (panel vs route vs widget) without duplicating controller logic.

Non-goals:

- No backend changes; work is frontend-only.
- No major visual redesign of `/assets` in this task; focus is structural.
- Do not change how selection or generation queues behave externally (same stores and actions).

---

## Phase Checklist

- [ ] **Phase 68.1 – Assets Controller Hook (`useAssetsController`)**
- [ ] **Phase 68.2 – Gallery Surface Controller (`useGallerySurfaceController`)**
- [ ] **Phase 68.3 – Wire `AssetsRoute` to Controller**
- [ ] **Phase 68.4 – Align Gallery Surfaces to Shared Controller**

---

## Phase 68.1 – Assets Controller Hook (`useAssetsController`)

**Goal**  
Extract the core logic from `AssetsRoute` into a dedicated controller hook that can be used by the route and (optionally) other surfaces.

**Scope**

- `apps/main/src/routes/Assets.tsx`
- New hook: `apps/main/src/hooks/useAssetsController.ts` (or similar)

**Key Responsibilities of `useAssetsController`**

The hook should encapsulate:

1. **Filter + scope management**
   - Current filters (q, tag, provider_id, media_type, provider_status, sort).
   - Scope tabs (All, Favorites, Mine, Recent) if they affect filters.
   - Reading/writing filters to:
     - URLSearchParams.
     - Session storage (as currently done via `sessionKey = 'assets_filters'`).

2. **Data loading**
   - Wrap `useAssets({ filters })` and expose:
     - `assets` (items).
     - `loadMore`, `loading`, `error`, `hasMore`.

3. **Selection modes**
   - Integrate with `useAssetPickerStore`:
     - `isSelectionMode`, `selectAsset`, `exitSelectionMode`.
   - Integrate with `useWorkspaceStore`:
     - `closeFloatingPanel('gallery')` on selection completion.
   - Provide:
     - `selectedAssetIds` and toggling behavior for multi-select within the gallery route (if present in current code).

4. **Viewer + detail panel**
   - Expose state and handlers for:
     - `viewerAsset`, `viewerSrc`, `openInViewer`, `closeViewer`.
     - Detail asset id and loading via `useAsset` where it makes sense.

5. **Per-asset actions**
   - Wire in `useMediaGenerationActions`:
     - `queueImageToVideo`, `queueVideoExtend`, `queueAddToTransition`, `queueAutoGenerate`.
   - Deletion:
     - Wrap `deleteAsset` API call, update local state, and reset `useAssets` where needed.
   - Provide a simple actions object per asset:

     ```ts
     getAssetActions(asset: AssetSummary) => {
       onOpenDetails: () => ...,
       onShowMetadata: () => ...,
       onImageToVideo: () => queueImageToVideo(asset),
       onVideoExtend: () => queueVideoExtend(asset),
       onAddToTransition: () => queueAddToTransition(asset),
       onAddToGenerate: () => queueAutoGenerate(asset),
       onDelete: () => handleDeleteAsset(asset),
     }
     ```

**Acceptance Criteria**

- `AssetsRoute` no longer contains:
  - Direct `useAssets` calls.
  - Inline URL/sessionStorage filter wiring.
  - Direct `useMediaGenerationActions` invocations.
  - Deletion logic.
- Instead, it consumes `useAssetsController` for state + actions and primarily renders layout.

---

## Phase 68.2 – Gallery Surface Controller (`useGallerySurfaceController`)

**Goal**  
Provide a reusable controller hook for gallery-like surfaces that need a subset of assets/generation behaviors without full `/assets` route complexity.

**Scope**

- New hook: `apps/main/src/hooks/useGallerySurfaceController.ts` (name flexible)
- Integrations:
  - `ReviewGallerySurface`
  - `GalleryGridWidget`
  - `LocalFoldersPanel` (if appropriate)

**Key Ideas**

- The hook should:
  - Accept configuration describing the surface context:
    - E.g. `{ mode: 'review' | 'widget', mediaType?: 'image' | 'video', limit?: number }`.
  - Use `useAssets` or local folders hooks as needed.
  - Expose:
    - `assets`, `loading`, `error`.
    - Per-asset actions (`getAssetActions`) built on `useMediaGenerationActions`.
    - Optional selection state if the surface supports selection.

**Acceptance Criteria**

- At least one non-route gallery surface (e.g. `ReviewGallerySurface`) uses the new controller hook instead of duplicating generation/action wiring.
- Logic for hooking `MediaCard.actions` into generation is not re-implemented per-surface; it is shared via the controller.

---

## Phase 68.3 – Wire `AssetsRoute` to Controller

**Goal**  
Refactor `AssetsRoute` to rely on `useAssetsController` and simplify JSX.

**Scope**

- `apps/main/src/routes/Assets.tsx`

**Key Steps**

1. Introduce `useAssetsController` in `AssetsRoute`:
   - Replace inline state and handlers with controller-derived state/action props.
2. Update MediaCard usage:
   - Use `controller.getAssetActions(asset)` to populate `MediaCard.actions`.
3. Keep visual output the same:
   - No behavioral changes to:
     - Filter persistence.
     - Selection mode banner and behavior.
     - Viewer and detail panel behavior.
     - Generation actions.

**Acceptance Criteria**

- The route still behaves the same from a user perspective.
- The majority of business logic resides in `useAssetsController`, not inline in the component.

---

## Phase 68.4 – Align Gallery Surfaces to Shared Controller

**Goal**  
Adopt the new gallery surface controller where beneficial, reducing duplication and tightening consistency.

**Scope**

- `apps/main/src/components/assets/ReviewGallerySurface.tsx`
- `apps/main/src/components/widgets/GalleryGridWidget.tsx`
- `apps/main/src/components/assets/LocalFoldersPanel.tsx` (optional, depending on fit)

**Key Steps**

1. Identify overlapping behaviors:
   - Generation actions attached to `MediaCard`.
   - Selection behavior.
   - Simple filters (e.g. media type, provider status).
2. Replace duplicated logic with calls to `useGallerySurfaceController` (or reuse `useAssetsController` if appropriate).
3. Ensure each surface can still:
   - Customize layout and badges.
   - Apply its own default filters or limits.

**Acceptance Criteria**

- Surfaces that show gallery items and wire generation actions no longer manually wire `useMediaGenerationActions` in multiple places; they use a shared pattern.
- No changes to visual output or user flows; only internal structure is improved.

---

## Notes & Follow-Ups

- This task is structural and should not modify backend APIs or stores semantics.
- Once `useAssetsController` and `useGallerySurfaceController` are in place:
  - Future tasks can:
    - Add new batch actions (e.g. multi-select → “Queue as Transition”).
    - Integrate more tightly with Control Center (e.g. sending context to QuickGenerate).
    - Add per-surface badge config or filter presets with minimal changes to UI components.

