**Task 71: Local Sources & Folders Controller (Future Cloud-Friendly)**

> **For Agents**
> - Refactors the Local Folders panel into a controller-based architecture that is *ready* for future external sources (e.g., Google Drive) without actually implementing them yet.
> - Keeps current local-folder behavior intact while introducing a clean abstraction for “asset sources”.
> - Use this when:
>   - Modifying `LocalFoldersPanel` or `useLocalFolders` behavior.
>   - Adding features related to importing/uploading assets from local or external locations.
> - Read first:
>   - `apps/main/src/components/assets/LocalFoldersPanel.tsx`
>   - `apps/main/src/stores/localFoldersStore.ts`
>   - `apps/main/src/hooks/useMediaGenerationActions.ts` (for how assets enter generation flows)

---

## Context

Current behavior (`LocalFoldersPanel`):

- Uses `useLocalFolders` from `localFoldersStore` to:
  - Track configured local folders (via File System Access API).
  - List local assets (with `folderId`, `relativePath`, etc.).
  - Provide `loadPersisted`, `addFolder`, `removeFolder`, `refreshFolder`.
- Manages its own UI state:
  - `viewMode` (`tree`, `grid`, `list`).
  - `selectedFolderPath` (for tree filtering).
  - `previews` (blob URLs for thumbnails).
  - `uploadStatus`, `uploadNotes`, `providerId`.
  - `viewerAsset` + navigation between assets.
- Uploads assets to backend providers via:
  - `POST /api/v1/assets/upload` with `provider_id`, using a selected `providerId` from `useProviders`.

Limitations:

- Logic and UI are tightly coupled in `LocalFoldersPanel`.
- Everything assumes a single “local filesystem” source; adding a new source type (e.g., Google Drive) would require significant duplication or tangled branching.

Goal: introduce a **source-aware controller** so that:

- Today: there is exactly one source (`local-fs`), backed by `localFoldersStore`.
- Future: new sources (e.g., `google-drive`) can be added behind the same controller interface, with separate UI panels if desired.

We do **not** implement Google Drive or other external sources in this task; we only shape the code so it’s natural to plug them in later.

---

## Goals

1. **Extract a `useLocalSourcesController` / `useLocalFoldersController` hook**
   - Owns all non-visual logic for local folders.
2. **Introduce a lightweight “source” abstraction in the controller**
   - Today only `local-fs`, but structured to allow more.
3. **Keep `LocalFoldersPanel` focused on UI**
   - It should render:
     - Folder tree.
     - Asset list/grid.
     - Preview/player.
     - Upload controls.
   - It should call controller methods for actual work (load, preview, upload, navigate).

Non-goals:

- No actual Google Drive integration in this task.
- No backend API changes; reuse existing `/api/v1/assets/upload`.
- No major visual redesign of Local Folders (just minor tweaks as needed).

---

## Phase Checklist

- [ ] **Phase 71.1 – Define Source Abstraction & Controller Shape**
- [ ] **Phase 71.2 – Extract `useLocalFoldersController`**
- [ ] **Phase 71.3 – Refactor `LocalFoldersPanel` to Use Controller**

---

## Phase 71.1 – Define Source Abstraction & Controller Shape

**Goal**  
Define a minimal “source” model and controller API that works for local folders now, and can support other sources later.

**Scope**

- New hook / types in `apps/main/src/hooks` and/or `apps/main/src/types`.

**Key Ideas**

- Define an internal `LocalAssetSource` shape, e.g.:

  ```ts
  type LocalSourceId = 'local-fs';

  interface SourceInfo {
    id: LocalSourceId;        // currently only 'local-fs'
    label: string;           // "Local Folders"
    type: 'local';           // reserved for future: 'cloud', 'drive', etc.
  }
  ```

- Controller API (for now, local-only):

  ```ts
  export interface LocalFoldersController {
    source: SourceInfo;             // always 'local-fs' for now
    folders: LocalFolder[];         // from localFoldersStore
    assets: LocalAsset[];           // flattened, sorted asset list
    filteredAssets: LocalAsset[];   // filtered by selected folder when in tree mode
    loadPersisted: () => void;
    addFolder: () => void;
    removeFolder: (id: string) => void;
    refreshFolder: (id: string) => void;

    // View state
    viewMode: 'grid' | 'tree' | 'list';
    setViewMode: (mode: 'grid' | 'tree' | 'list') => void;
    selectedFolderPath: string | null;
    setSelectedFolderPath: (path: string | null) => void;

    // Previews & viewer
    previews: Record<string, string>;
    loadPreview: (asset: LocalAsset | string) => Promise<void>;
    viewerAsset: LocalAsset | null;
    openViewer: (asset: LocalAsset) => void;
    closeViewer: () => void;
    navigateViewer: (direction: 'prev' | 'next') => void;

    // Uploads
    providerId?: string;
    setProviderId: (id: string | undefined) => void;
    uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
    uploadOne: (asset: LocalAsset | string) => Promise<void>;

    // Errors / state from useLocalFolders
    supported: boolean;
    adding: boolean;
    error: string | null;
  }
  ```

**Acceptance Criteria**

- A clear controller interface exists that:
  - Provides everything `LocalFoldersPanel` needs.
  - Keeps “local” specifics inside the controller.

---

## Phase 71.2 – Extract `useLocalFoldersController`

**Goal**  
Implement `useLocalFoldersController` by moving logic out of `LocalFoldersPanel`.

**Scope**

- `apps/main/src/hooks/useLocalFoldersController.ts` (new)
- Logic currently in `LocalFoldersPanel`:
  - `useLocalFolders` wiring.
  - `viewMode`, `selectedFolderPath`, and `filteredAssets` computation.
  - `previews` handling (`getLocalThumbnailBlob`, `setLocalThumbnailBlob`).
  - `viewerAsset` + `navigateViewer`.
  - `uploadStatus`, `uploadOne`, and provider selection.

**Key Steps**

1. Create `useLocalFoldersController` hook:
   - Import `useLocalFolders` and wire:
     - `supported`, `folders`, `assets`, `loadPersisted`, `addFolder`, `removeFolder`, `refreshFolder`, `adding`, `error`.
   - Move:
     - `viewMode` state and setter.
     - `selectedFolderPath` and `filteredAssets` logic.
     - `previews` state and `preview` function (renamed `loadPreview`).
     - `viewerAsset`, `openViewer`, `closeViewer`, `navigateViewer`.
     - `providerId`, `setProviderId`, `uploadStatus`, `uploadOne`.
   - Return a `LocalFoldersController` object.
2. Keep API shape stable:
   - Do not change signatures of `addFolder`, `removeFolder`, `refreshFolder`, `uploadOne`, etc. in a way that breaks existing UX.

**Acceptance Criteria**

- `LocalFoldersPanel` no longer imports or calls `useLocalFolders` directly.
- All local folder-specific logic is inside the controller hook.

---

## Phase 71.3 – Refactor `LocalFoldersPanel` to Use Controller

**Goal**  
Update `LocalFoldersPanel` to use the controller hook, leaving it as a pure UI layer.

**Scope**

- `apps/main/src/components/assets/LocalFoldersPanel.tsx`

**Key Steps**

1. Replace:
   - Direct calls to `useLocalFolders`, `useState`, `useMemo` for assets, previews, upload status, viewer.
   - With `const controller = useLocalFoldersController();`.
2. Update JSX:
   - Tree view / grid / list:
     - Use `controller.assets` and `controller.filteredAssets` where appropriate.
     - Use `controller.viewMode`, `controller.setViewMode`.
     - Use `controller.selectedFolderPath`, `controller.setSelectedFolderPath`.
   - Top controls:
     - `Add Folder` → `controller.addFolder`.
     - Provider dropdown → `controller.providerId` / `controller.setProviderId`.
   - Preview + viewer:
     - Use `controller.loadPreview`, `controller.viewerAsset`, `controller.openViewer`, `controller.closeViewer`, `controller.navigateViewer`.
   - Upload buttons:
     - Use `controller.uploadOne` and `controller.uploadStatus`.

**Acceptance Criteria**

- `LocalFoldersPanel` becomes a thin wrapper:
  - All data & actions come from `useLocalFoldersController`.
  - Behavior (add/remove/refresh folders, previews, uploads, viewer navigation) remains unchanged.

---

## Notes & Future Work

- When introducing a cloud source (e.g. Google Drive) later:
  - You can either:
    - Add a new `CloudSourcesPanel` using a sibling controller (e.g. `useCloudSourcesController`), or
    - Generalize `useLocalFoldersController` into a `useExternalSourcesController` that supports multiple source types.
- Keep the “source” concept in the controller, not in the UI:
  - So the UI can evolve naturally from “Local Folders” to “Sources” without rewriting business logic.
- If new upload APIs are added later (e.g. direct-to-provider uploads from Drive), they should plug into the same “uploadOne” concept without changing how `LocalFoldersPanel` is wired.

