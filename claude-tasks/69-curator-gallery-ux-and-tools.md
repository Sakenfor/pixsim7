**Task 69: Curator Gallery UX & Tools**

> **For Agents**
> - Elevates the Curator Gallery surface into a distinct “power user” view, not just another `/assets` layout.
> - Focuses on collection-centric workflows, bulk operations, and inline metadata editing.
> - Use this task when you:
>   - Work on `CuratorGallerySurface` or curator-specific gallery logic.
>   - Add bulk tools, collection management, or advanced filters that are *too much* for the normal assets view.
> - Read first:
>   - `apps/main/src/components/assets/CuratorGallerySurface.tsx`
>   - `apps/main/src/hooks/useCuratorGalleryController.ts`
>   - `apps/main/src/routes/Assets.tsx`
>   - `apps/main/src/hooks/useAssetsController.ts`

---

## Context

Current behavior:

- `CuratorGallerySurface` lives at `apps/main/src/components/assets/CuratorGallerySurface.tsx`.
- Logic is now centralized in `useCuratorGalleryController`:
  - Uses `useAssets` for data.
  - Tracks filters, view mode, selection, and collections.
- UI differences from `/assets` are modest:
  - Advanced filters box.
  - Ability to “Create Collection” from a selection and see a simple list of collections.
- The normal Assets view (`AssetsRoute`) already supports:
  - Flexible filters, badges, surfaces, and generation actions.
  - Selection mode for tools.

Result: Curator currently feels like “Assets with a couple of extras” rather than a distinct, opinionated curation workspace.

This task aims to make Curator:

- Collection-centric (collections as first-class citizens).
- Bulk-edit friendly (tags, metadata, statuses).
- A place where power users can shape and organize large sets of assets.

---

## Goals

1. **Make Curator clearly collection-centric**  
   Collections should be the spine of the view, not a small summary.

2. **Add real bulk tools**  
   Curator should be where you go to apply changes across many assets (tags, flags, collections), not just select and forget.

3. **Inline metadata editing in Curator list view**  
   Curator should make it easy to adjust descriptions/tags without leaving the surface.

4. **Differentiate Curator layout/filters from `/assets`**  
   Without breaking existing behavior, emphasize Curator’s “workspace” vibe vs. Assets’ “gallery” vibe.

Non-goals:

- No backend schema changes; reuse existing asset metadata fields (e.g., description, tags, provider_status).
- No changes to `/assets` route behavior beyond optional small links into Curator.
- No new generation operations; reuse existing generation queue hooks if needed.

---

## Phase Checklist

- [ ] **Phase 69.1 – Collection-Centric Layout**
- [ ] **Phase 69.2 – Bulk Tools Bar**
- [ ] **Phase 69.3 – Inline Metadata Editing (List View)**
- [ ] **Phase 69.4 – Curator-Specific Filters & Presets**

---

## Phase 69.1 – Collection-Centric Layout

**Goal**  
Reorganize Curator so that collections are a primary navigation element, not just an info block.

**Scope**

- `apps/main/src/components/assets/CuratorGallerySurface.tsx`
- `apps/main/src/hooks/useCuratorGalleryController.ts`

**Key Ideas**

- Add a **left sidebar** or top section that lists collections:
  - Show collection name and asset count.
  - “+ New Collection” button at the top.
- When a collection is selected:
  - Filter the main grid/list to assets in that collection.
  - Highlight the active collection in the sidebar.
- Allow “All assets” mode:
  - A synthetic “All assets” entry that shows everything matching filters (current behavior).

**Implementation Notes**

- Extend `useCuratorGalleryController`:
  - Track `activeCollectionName: string | null`.
  - Expose `setActiveCollection(name | null)`.
  - Expose a computed `visibleAssets` that:
    - Uses `assets` when no collection selected.
    - Uses collection membership when a collection is active.
- In `CuratorGallerySurface`, drive the grid/list from `controller.visibleAssets` instead of `assets`.

**Acceptance Criteria**

- Users can:
  - Create collections from selections.
  - Click a collection to see only those assets in the main view.
  - Easily switch between “All assets” and specific collections.

---

## Phase 69.2 – Bulk Tools Bar

**Goal**  
Provide powerful bulk actions that only appear when there is a selection, making Curator the place for multi-asset edits.

**Scope**

- `apps/main/src/components/assets/CuratorGallerySurface.tsx`
- Optional helpers in `apps/main/src/hooks/useCuratorGalleryController.ts` (for actions that affect controller state).

**Candidate Bulk Actions**

- “Add tag to N assets…”
- “Remove tag from N assets…”
- “Move selection to collection X / New collection…”
- “Mark selection as ‘Needs review’ / ‘Approved’” (implemented as tags or metadata flags).
- Optional: “Queue selection for transition / image-to-video” leveraging `useMediaGenerationActions` (future task).

**Key Ideas**

- When `controller.selectedAssetIds.size > 0`, show a **bulk tools bar** above the grid:
  - A simple set of buttons or a dropdown:
    - `+ Tag…`, `Move to collection…`, `Mark as…`.
- Implementation can initially be optimistic UI:
  - Apply changes locally to `controller.assets` / `collections`.
  - Persist via existing asset update API (e.g., PATCH `/api/v1/assets/:id` if available) in a simple loop.

**Acceptance Criteria**

- Users can:
  - Select multiple assets.
  - Apply at least one bulk operation that clearly differentiates Curator from `/assets` (e.g., bulk tagging and/or move-to-collection).

---

## Phase 69.3 – Inline Metadata Editing (List View)

**Goal**  
Allow editing key metadata directly inside Curator’s list view rows.

**Scope**

- `apps/main/src/components/assets/CuratorGallerySurface.tsx`
- Asset update API in `apps/main/src/lib/api/assets.ts` (if exists) or similar.

**Key Fields to Edit**

- `description` (text input).
- `tags` (chips/inputs; a minimal “comma-separated tags” input is fine for first pass).

**Key Ideas**

- In list view:
  - Replace static `description` with an inline `<input>` or `<textarea>`:
    - On blur or Enter, persist changes.
    - Show a small “Saved” checkmark or subtle success indication.
  - Add a simple tags editor:
    - Either:
      - Chips with a small “+” to add, “x” to remove, or
      - A text input that edits a comma-separated tags string.
- Hook into an existing asset update endpoint if present; otherwise:
  - Update local state only and mark this task as “local only” until a backend endpoint is wired.

**Acceptance Criteria**

- In Curator (list view), users can:
  - Click into a description, change it, and see it stick.
  - Add/remove tags for individual assets.
- `/assets` remains read-only for these fields (no inline editing there).

---

## Phase 69.4 – Curator-Specific Filters & Presets

**Goal**  
Provide filter options that are tuned for curation workflows, not generic browsing.

**Scope**

- `apps/main/src/components/assets/CuratorGallerySurface.tsx`
- `apps/main/src/hooks/useCuratorGalleryController.ts`

**Curator-Specific Filters**

- “In collection” / “Not in any collection”.
- “Has tags” / “Untagged”.
- “Provider status” chips:
  - For example, local_only / flagged / ok.

**Filter Presets**

- Add a small preset dropdown or chip row for:
  - “Unreviewed” (e.g., no collection and/or no key tags).
  - “Flagged or Local Only”.
  - “Long videos only” (if duration metadata is available).

**Implementation Notes**

- Extend `CuratorFilters` if needed; keep backend calls compatible with existing `/assets` filters.
- For collection-based filters:
  - Some checks can happen client-side using `collections` and `assets` from the controller.

**Acceptance Criteria**

- Curator offers at least one filter or preset that:
  - Does not exist on `/assets`.
  - Is clearly focused on organization/triage (e.g., “Not in any collection”, “Flagged/Local Only”).

---

## Notes & Follow-Ups

- When adding new bulk actions or metadata editing:
  - Prefer using existing asset API helpers (`lib/api/assets.ts`) instead of adding new endpoints.
  - Keep failure modes explicit (e.g., simple toast or inline error near the field).
- If future tasks add richer metadata (e.g., labels, ratings):
  - Curator is the natural home for editing those fields.
- Keep the Controller + Surface separation:
  - Put logic in `useCuratorGalleryController`.
  - Keep `CuratorGallerySurface` focused on layout and wiring state/actions to the UI.

