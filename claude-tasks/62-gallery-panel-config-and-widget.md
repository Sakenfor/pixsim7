**Task 62: Gallery Panel Config & Builder Widget**

> **For Agents**
> - Connects the gallery (`/assets`), MediaCard badge layout (Task 61), and the configurable panel system.
> - Makes gallery card behavior (badges, overlays, actions) configurable via **panel settings** and **panel builder widgets**, not just hardcoded in the route.
> - Read:
>   - `claude-tasks/56-gallery-surfaces.md`
>   - `claude-tasks/61-gallery-media-card-badges-and-actions.md`
>   - `apps/main/src/components/media/MediaCard.tsx`
>   - `apps/main/src/routes/Assets.tsx`
>   - `apps/main/src/lib/gallery/types.ts`
>   - `apps/main/src/stores/panelConfigStore.ts`
>   - `apps/main/src/components/settings/PanelConfigurationPanel.tsx`
>   - `apps/main/src/components/builder/SimplePanelBuilder.tsx`
>   - `apps/main/src/lib/widgets/panelComposer.ts`
>
> **Backend note:** This task treats “Upload to provider” from gallery as UI plumbing only; any new backend helpers (e.g. “promote local-only asset to provider”) should be a separate backend task.

---

## Goals

1. Expose gallery card badge/layout options as **panel settings** for the `gallery` workspace panel.
2. Add a **Gallery Grid widget** to the panel builder, reusing `MediaCard` and gallery surfaces, with props that mirror badge/layout options.
3. Wire the three-dots “More actions” menu into the gallery panel / widget so panel compositions can add actions like “Open details” and “Show metadata” without touching `MediaCard` internals.
4. Keep all behavior purely frontend (no backend schema changes); backend upload/promotion helpers are out of scope for this task.

Non-goals:
- No new backend endpoints or DB fields.
- No user-facing global “gallery preferences” UI beyond panel and widget settings.

---

## Phase Checklist

- [ ] **Phase 62.1 – Gallery Panel Settings & BadgeConfig**
- [ ] **Phase 62.2 – Gallery Grid Widget for Panel Builder**
- [ ] **Phase 62.3 – Panel-Level Actions & More-Menu Wiring**
- [ ] **Phase 62.4 – Surface & Panel Config Merge Logic**
- [ ] **Phase 62.5 – UX & Docs**

**Status:** Not started.

---

## Phase 62.1 – Gallery Panel Settings & BadgeConfig

**Goal:** Add a `badgeConfig` section to the `gallery` panel settings in `panelConfigStore`, and surface basic toggles in `PanelConfigurationPanel`.

### Plan

- In `apps/main/src/stores/panelConfigStore.ts`:
  - Extend the settings type for the `gallery` panel (or introduce it if not present):

    ```ts
    export interface GalleryPanelSettings {
      badgeConfig?: {
        showPrimaryIcon?: boolean;
        showStatusIcon?: boolean;
        showStatusTextOnHover?: boolean;
        showTagsInOverlay?: boolean;
        showFooterProvider?: boolean;
        showFooterDate?: boolean;
      };
    }
    ```

  - Add a default `badgeConfig` for `gallery` in the initial store state:

    ```ts
    const defaultGalleryBadgeConfig = {
      showPrimaryIcon: true,
      showStatusIcon: true,
      showStatusTextOnHover: true,
      showTagsInOverlay: true,
      showFooterProvider: true,
      showFooterDate: true,
    };
    ```

    and apply this when initializing the `gallery` panel settings (without forcing it into every serialized state).

- In `apps/main/src/components/settings/PanelConfigurationPanel.tsx`:
  - For the `gallery` panel row, add a small “Card badges” section with a few high-value toggles, e.g.:
    - “Show media-type icon” → `showPrimaryIcon`.
    - “Show provider status icon” → `showStatusIcon`.
    - “Show tags in hover overlay” → `showTagsInOverlay`.
  - Read and update `panelConfigStore.settings.gallery.badgeConfig` accordingly.

### Verification

- Opening Panel Configuration shows badge-related toggles under the `gallery` panel.
- Toggling them updates `panelConfigStore` state (visible via Redux/Zustand devtools or logs).

---

## Phase 62.2 – Gallery Grid Widget for Panel Builder

**Goal:** Introduce a `GalleryGridWidget` that can be used in the panel builder, reusing `MediaCard` and gallery surfaces, with props that match the badge/layout config.

### Plan

- In `apps/main/src/components/builder` or `apps/main/src/lib/widgets`:
  - Define a new widget type, e.g. `GalleryGridWidgetDefinition`, that renders a grid of assets using the existing `useAssets` hook and `MediaCard`:

    ```ts
    // lib/widgets/galleryGridWidget.ts
    export interface GalleryGridWidgetProps {
      limit?: number;
      filters?: AssetFilters;
      badgeConfig?: {
        showPrimaryIcon?: boolean;
        showStatusIcon?: boolean;
        showStatusTextOnHover?: boolean;
        showTagsInOverlay?: boolean;
        showFooterProvider?: boolean;
        showFooterDate?: boolean;
      };
    }

    export const GalleryGridWidget: WidgetDefinition<GalleryGridWidgetProps> = {
      id: 'gallery-grid',
      label: 'Gallery Grid',
      // ...
      render(props) {
        // useAssets + MediaCard grid (similar to AssetsRoute)
      },
    };
    ```

- Register the widget in the widget registry used by `SimplePanelBuilder.tsx` / `panelComposer.ts`.
- Ensure the builder UI exposes at least the key `badgeConfig` toggles for this widget (similar to the panel settings from Phase 62.1).

### Verification

- In the panel builder, the widget palette shows “Gallery Grid” as an option.
- Dropping a Gallery Grid widget into a panel and tweaking its `badgeConfig` props results in visible changes to card badges/layout in that panel.

---

## Phase 62.3 – Panel-Level Actions & More-Menu Wiring

**Goal:** Wire the three-dots “More actions” menu on `MediaCard` to panel- or widget-level actions like “Open details” and “Show metadata”.

### Plan

- In `apps/main/src/components/media/MediaCard.tsx`:
  - Add an optional `actions` prop:

    ```ts
    export interface MediaCardActions {
      onOpenDetails?: (id: number) => void;
      onShowMetadata?: (id: number) => void;
      onUploadToProvider?: (id: number) => void;
    }

    export interface MediaCardProps {
      // existing props...
      actions?: MediaCardActions;
    }
    ```

  - In the three-dots menu, render menu items based on which `actions` exist:
    - “Open details” → calls `actions.onOpenDetails(id)`.
    - “Show metadata” → calls `actions.onShowMetadata(id)` if provided.
    - “Upload to provider” is declared but can be left for a separate backend-oriented task.

- In `AppsRoute` and/or `GalleryGridWidget`:
  - Pass `actions.onOpenDetails` that navigates to `/assets/:id`.
  - Optionally pass `actions.onShowMetadata` that either:
    - navigates to the same route but with a metadata tab selected, or
    - opens a dev tool / side panel (e.g. a dedicated metadata panel if one exists).

### Verification

- The three-dots menu on cards in `/assets` shows at least “Open details” when an `actions.onOpenDetails` prop is provided.
- Clicking “Open details” has the same effect as clicking the card thumbnail (navigate to `/assets/:id`), but does not disrupt Ctrl+click selection logic.

---

## Phase 62.4 – Surface & Panel Config Merge Logic

**Goal:** Ensure gallery surfaces and panel/builder configs merge cleanly so we don’t have multiple competing sources of truth.

### Plan

- In the gallery surface host (e.g. `GallerySurfaceRegistry` consumer or `AssetsRoute`):
  - Resolve a `surfaceBadgeConfig` from the gallery surface definition (`GallerySurfaceDefinition.badgeConfig`).
  - Resolve a `panelBadgeConfig` from `panelConfigStore.settings.gallery.badgeConfig` when rendering inside the workspace panel.
  - Merge them as:

    ```ts
    const effectiveBadgeConfig = {
      ...surfaceBadgeConfig,
      ...panelBadgeConfig,
      ...widgetBadgeConfig, // if inside GalleryGridWidget
    };
    ```

  - Pass `effectiveBadgeConfig` down into `MediaCard` as a prop.

- Ensure there is a clear priority order:
  - Widget-level `badgeConfig` (in a composed panel) overrides panel-level, which overrides surface defaults.

### Verification

- Changing the surface-level defaults affects cards in `/assets` and in panels that don’t override anything.
- Changing gallery panel settings overrides surface defaults for that panel but not for other surfaces elsewhere.
- Gallery widgets created in the panel builder can override both the panel-level and surface-level settings via their own props.

---

## Phase 62.5 – UX & Docs

**Goal:** Document how gallery card configuration ties into panels and the builder so future work can extend it predictably.

### Plan

- Docs:
  - In `apps/main/src/lib/gallery/GALLERY_SURFACES.md` (or equivalent):
    - Add a short section on `badgeConfig` and how it interacts with panel/builder config.
  - In `apps/main/src/lib/panels/PANEL_PLUGINS_AND_REGISTRY.md`:
    - Mention that the gallery panel is now badge-configurable via `panelConfigStore` and Panel Configuration.
  - In a small builder-focused doc (e.g. `PANEL_BUILDER_WIDGETS.md` or similar):
    - Document the `GalleryGridWidget` and its `badgeConfig` props.

- Optional: Add a brief note to `UI_CONSOLIDATION_COMPLETED.md` linking from the older UI analysis to the new “gallery as a configurable panel + widget” model.

### Verification

- A dev can:
  - Read how to change gallery card behavior via panel settings.
  - Understand how to use the Gallery Grid widget in composed panels and how badge props map to card UI.

---

## Success Criteria

- Gallery card badge/layout behavior is **panel-configurable** for the `gallery` workspace panel via `panelConfigStore` and Panel Configuration.
- The panel builder has a reusable **Gallery Grid widget** that uses the same badge/layout model and can be tuned per composition.
- The three-dots menu on `MediaCard` is wired to panel/builder-level actions (at least “Open details”), while keeping the core card component generic.
- Surface-level defaults, panel-level overrides, and widget-level overrides merge cleanly, avoiding multiple conflicting sources of truth.

