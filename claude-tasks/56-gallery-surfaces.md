**Task 56: Gallery Surfaces & Tools Registry**

> **For Agents**
> - Makes the asset gallery (`/assets`) modular, like panels and graph editors.
> - Introduces a registry for “gallery surfaces” (different layouts/modes) and wires existing gallery tools into it.
> - Read:
>   - `apps/main/src/routes/Assets.tsx`
>   - `apps/main/src/components/gallery/GalleryToolsPanel.tsx`
>   - `apps/main/src/lib/gallery/types.ts`
>   - `claude-tasks/01-world-hud-layout-designer.md`

---

## Goals

1. Define a `GallerySurfaceDefinition` + `gallerySurfaceRegistry`.
2. Register the current `/assets` view as the default surface.
3. Add at least one alternate surface (e.g., Review / Curator view).
4. Make gallery tools declare which surfaces they support.

Non-goals:
- No backend/schema changes for assets.
- No changes to gallery-tool plugin semantics beyond metadata.

---

## Phase Checklist

- [ ] **Phase 56.1 – Gallery Surface Types & Registry**
- [ ] **Phase 56.2 – Default Assets Surface Registration**
- [ ] **Phase 56.3 – Alternate Surfaces & Switching**
- [ ] **Phase 56.4 – Gallery Tool Integration**
- [ ] **Phase 56.5 – UX & Docs**

**Status:** Not started.

---

## Phase 56.1 – Gallery Surface Types & Registry

**Goal:** Capture gallery UIs as explicit “surfaces”.

### Plan

- In `lib/gallery` (new `surfaceRegistry.ts` or similar):
  ```ts
  export type GallerySurfaceId =
    | 'assets-default'
    | 'assets-review'
    | 'assets-curator'
    | 'assets-debug'
    | string;

  export interface GallerySurfaceDefinition {
    id: GallerySurfaceId;
    label: string;
    description?: string;
    icon?: string;
    category?: 'default' | 'review' | 'curation' | 'debug' | 'custom';
    component: React.ComponentType<any>;
    supportsMediaTypes?: Array<'image' | 'video' | 'audio' | '3d_model'>;
    supportsSelection?: boolean;
    routePath?: string;
  }

  export class GallerySurfaceRegistry {
    // register/get/getAll/getByCategory...
  }

  export const gallerySurfaceRegistry = new GallerySurfaceRegistry();
  ```

### Verification

- Registry can register + retrieve definitions in a small test or debug hook.

---

## Phase 56.2 – Default Assets Surface Registration

**Goal:** Treat the current `/assets` implementation as a surface.

### Plan

- Add a small wrapper:
  ```tsx
  // components/assets/DefaultGallerySurface.tsx
  export function DefaultGallerySurface() {
    return <AssetsRoute />;
  }
  ```
- In a `registerGallerySurfaces()` helper:
  ```ts
  gallerySurfaceRegistry.register({
    id: 'assets-default',
    label: 'Assets – Default',
    description: 'Standard asset gallery with filters and tools',
    icon: '🖼️',
    category: 'default',
    component: DefaultGallerySurface,
    supportsMediaTypes: ['image', 'video', 'audio', '3d_model'],
    supportsSelection: true,
    routePath: '/assets',
  });
  ```
- Call `registerGallerySurfaces()` at app startup.

### Verification

- `gallerySurfaceRegistry.get('assets-default')` returns a valid definition.
- `/assets` route still works as before.

---

## Phase 56.3 – Alternate Surfaces & Switching

**Goal:** Introduce at least one alternate surface and a way to switch surfaces.

### Plan

- Implement one alternate surface:
  - Example: “Review” surface with larger cards, accept/reject tools, and fewer filters.
- Add a `GallerySurfaceHost` component that:
  - Reads active surface ID (via URL param or store).
  - Fetches definition from `gallerySurfaceRegistry`.
  - Renders `component`.
- Integrate host into `/assets` or new routes (`/assets/review`, etc.).
- Add a “View” dropdown in Assets header to choose surface (`assets-default`, `assets-review`, etc.).

### Verification

- Able to switch between at least two surfaces.
- Active surface choice is stable across reloads (via URL or persisted store).

---

## Phase 56.4 – Gallery Tool Integration

**Goal:** Make gallery tools indicate which surfaces they support and respect that in UI.

### Plan

- Extend gallery tool metadata (e.g. in `lib/gallery/types.ts`):
  ```ts
  export interface GalleryToolPlugin {
    // existing fields...
    supportedSurfaces?: GallerySurfaceId[]; // defaults to ['assets-default']
  }
  ```
- In `GalleryToolsPanel`, accept a `surfaceId` prop and filter tools by `supportedSurfaces`.
- Optionally let `GallerySurfaceDefinition` specify `defaultTools?: string[]`, which the tools panel highlights.

### Verification

- Tools list changes appropriately when switching surfaces.
- Existing behavior (default surface + tools) remains intact when `supportedSurfaces` is absent.

---

## Phase 56.5 – UX & Docs

**Goal:** Make gallery surfaces discoverable and understandable.

### Plan

- UX:
  - Add a “View” selector in Assets header that shows surface labels + icons.
  - Add a small badge or text somewhere in the UI showing the current surface ID.
- Docs:
  - Mention gallery surfaces in `SYSTEM_OVERVIEW.md`.
  - Optionally add a small `GALLERY_SURFACES.md` describing:
    - Default surface.
    - Alternate surfaces.
    - How to add a new surface.

### Verification

- From `/assets`, a dev can:
  - See which surface is active.
  - Switch to another surface.
  - Understand which tools are available in each surface.

