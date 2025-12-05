## Task 130 – Extract Shared Asset Gallery

### Goal
Refactor the current MediaCard + LocalFoldersPanel preview plumbing into a reusable asset gallery component/hooks that any UI (Local Folders, Intimacy Composer, media browser, dev tools) can drop in.

### Motivation
- `LocalFoldersPanel` defines its own `TreeLazyMediaCard`, `useLazyLoadPreview`, spinner states, and upload buttons.
- Other screens replicate similar logic (thumbnail placeholders, “open viewer”, upload buttons), which leads to drift.
- A shared gallery module would ensure consistent lazy-loading, status badges, and click behavior while simplifying future features (context menus, bulk actions).

### Deliverables
1. **Base MediaCard refactor**
   - Keep `MediaCard` focused on rendering thumbnails/video previews, status overlays, and a slot for action buttons.
   - Remove panel-specific props so it can render any asset summary with consistent placeholders/spinners.
2. **Lazy preview hook**
   - Extract `useLazyLoadPreview` into `useLazyPreview` (e.g., `apps/main/src/hooks/useLazyPreview.ts`) handling IntersectionObserver, caching, and “already loading” guards.
   - Expose options for silent refresh vs. showing a spinner.
3. **AssetGallery component**
   - Lives in `apps/main/src/components/media/AssetGallery.tsx`.
   - Accepts a list of assets (local or remote), optional grouping, size presets, and callbacks (`onOpen`, `onUpload`, `onSelect`).
   - Handles lazy preview loading via the shared hook, renders `MediaCard` instances, and surfaces upload/progress status.
4. **Adoption**
   - Update `LocalFoldersPanel` to use `AssetGallery` instead of `TreeLazyMediaCard`.
   - Switch any other gallery-like view (e.g., Intimacy Composer’s asset picker, dev tools media browser) to the shared component.
5. **Documentation**
   - Add a README or JSDoc describing how to use `AssetGallery` and the lazy preview hook.

### Nice-to-haves (optional if time permits)
- Support selection state out of the box (multi-select checkboxes, keyboard navigation).
- Hook in upload status badges (e.g., `UploadState` overlay) so consumers only pass status data.
- Provide Storybook stories or screenshot tests for the gallery in various states (loading, error, video).
