**Task 61: Gallery Media Card Badges & Actions UX**

> **For Agents**
> - Refines the `/assets` gallery card UI to be less cluttered while still conveying important status at a glance.
> - Introduces a **badge layout model** (top-left persistent, top-right contextual on hover) and a **more-actions menu** area.
> - Lays groundwork for **user-configurable badge visibility** and future icon-based status indicators.
> - Read:
>   - `apps/main/src/components/media/MediaCard.tsx`
>   - `apps/main/src/routes/Assets.tsx`
>   - `apps/main/src/components/assets/ReviewGallerySurface.tsx`
>   - `apps/main/src/components/assets/CuratorGallerySurface.tsx`
>   - `apps/main/src/components/assets/LocalFoldersPanel.tsx`
>   - `apps/main/src/lib/gallery/types.ts`
>   - `claude-tasks/32-gallery-provider-status-and-flags.md`
>   - `claude-tasks/56-gallery-surfaces.md`

---

## Goals

1. Define a consistent **badge layout** for `MediaCard`:
   - Top-left: always-visible, compact icon badge(s) for primary status.
   - Top-right: contextual text/icon badges that only show on **intentional hover** in that corner.
2. Move rarely-used text badges (e.g. `"Local only"`, `"Provider OK"`, `media_type`) into a **hover zone** and/or a three-dots menu, reducing clutter in the default state.
3. Make space for a **more-actions menu** (three dots) that can host “Open details”, “Show metadata”, “Upload to provider”, etc.
4. Define a small, data-driven model for badge configuration so future work can expose **user preferences** per gallery surface without hardcoding layout in the component.

Non-goals (for this task):
- No backend changes; all work is frontend-only.
- No full-blown user preferences UI yet; just design and wire the configuration hooks.

---

## Phase Checklist

- [ ] **Phase 61.1 – Badge Model & Icon Mapping**
- [ ] **Phase 61.2 – Layout & Hover Behavior**
- [ ] **Phase 61.3 – More-Actions Menu Wiring**
- [ ] **Phase 61.4 – Surface-Level Badge Config Hooks**
- [ ] **Phase 61.5 – UX & Docs**

**Status:** Not started.

---

## Phase 61.1 – Badge Model & Icon Mapping

**Goal:** Define a small, explicit model describing which badges exist on a `MediaCard` and how they map to icons/labels.

### Plan

- In `apps/main/src/components/media/MediaCard.tsx` (or a sibling `mediaBadgeConfig.ts` helper), define a light-weight badge model, e.g.:

  ```ts
  export type MediaPrimaryBadge =
    | 'video'
    | 'image'
    | 'audio'
    | 'model';

  export type MediaStatusBadge =
    | 'provider_ok'
    | 'local_only'
    | 'flagged'
    | 'unknown';

  export interface MediaBadgeConfig {
    /** Primary icon badge for top-left (e.g. media type). */
    primary: MediaPrimaryBadge | null;
    /** Status badge for top-right (provider_status, sync, etc.). */
    status: MediaStatusBadge | null;
    /** Optional tags/flags that can be shown in overlay or menu. */
    flags: string[];
  }
  ```

- Add a small mapping from `mediaType` and `providerStatus` to these enums and to actual display tokens (emoji or icon names):

  ```ts
  const MEDIA_TYPE_ICON: Record<MediaPrimaryBadge, string> = {
    video: '🎬',
    image: '🖼️',
    audio: '🎧',
    model: '📦',
  };

  const MEDIA_STATUS_ICON: Record<MediaStatusBadge, { icon: string; color: 'green' | 'yellow' | 'red' | 'gray' }> = {
    provider_ok: { icon: '✓', color: 'green' },
    local_only: { icon: '↓', color: 'yellow' },
    flagged: { icon: '!', color: 'red' },
    unknown: { icon: '?', color: 'gray' },
  };
  ```

- The `MediaCard` component should resolve a `MediaBadgeConfig` from `mediaType` and `providerStatus` once, then use the mapping to render icons in the right places.

### Verification

- All existing badges (“Provider OK”, “Local only”, “Flagged”, media_type) can be expressed via the new badge model.
- No behavior changes yet; this is just data modeling and mapping.

---

## Phase 61.2 – Layout & Hover Behavior

**Goal:** Implement a concrete layout for primary vs contextual badges with minimal default clutter.

### Plan

- **Top-left (always visible):**
  - Render a small, icon-only badge based on `MediaPrimaryBadge` (e.g., 🎬 for video, 🖼️ for image).
  - Optionally incorporate a tiny color ring to reflect provider_status severity (e.g., green ring for `provider_ok`, yellow for `local_only`, red for `flagged`), but keep text out of this area.

- **Top-right (hover zone):**
  - Treat the top-right area as a contextual hover zone:
    - Default state: only the most important status icon may show (if at all), or nothing.
    - On hover near the top-right (e.g., moving the mouse into a small bounding box), show a small pill with text, e.g. “Local only”, “Flagged”, “OK”.
  - This can be implemented by:
    - Tracking a small overlay div aligned top-right that becomes visible when `isHovered && inTopRight` (where `inTopRight` is derived from `onMouseMove` coords within the card), or
    - Simpler: on any hover (`isHovered`), show a **single** compact text badge in the top-right, rather than multiple lines of badges.

- **Global hover overlay (bottom gradient) cleanup:**
  - Keep:
    - description (clamped),
    - up to 3 tags,
    - bottom row with date/size/duration.
  - Remove or avoid duplicating provider/media-type labels here, since they’re now captured by icon and footer.

### Verification

- In `/assets`, cards at rest show:
  - a small media-type icon in top-left,
  - a compact footer line,
  - no long text badges until hover.
- On hover, the contextual top-right badge appears with a single, clear status (e.g. “Local only”), without overwhelming the card.

---

## Phase 61.3 – More-Actions Menu Wiring

**Goal:** Finish wiring the three-dots menu as the home for less-common actions, keeping the main card clean.

### Plan

- Expand the existing three-dots menu in `MediaCard` to support multiple actions based on props:

  ```ts
  export interface MediaCardActions {
    onOpenDetails?: (id: number) => void;
    onShowMetadata?: (id: number) => void;
    onUploadToProvider?: (id: number) => void;
  }
  ```

- Extend `MediaCardProps` to accept an optional `actions?: MediaCardActions`:
  - In the menu rendering, only show list items for actions that exist.
  - For now, `onOpenDetails` and `onShowMetadata` can be wired; `onUploadToProvider` can be a no-op or left for a follow-up task that adds backend support.

- In `AssetsRoute`:
  - Pass `actions.onOpenDetails` (navigate to `/assets/:id`).
  - Optionally pass `actions.onShowMetadata` that opens the existing detail route or a metadata panel (if available).

- Ensure the menu:
  - Does not interfere with selection (stop propagation on menu clicks).
  - Closes on selection or when the card loses hover focus.

### Verification

- Clicking the three-dots menu on a card in `/assets` opens a small action list with at least “Open details”.
- The main thumbnail area remains the primary click target for open; the menu is for secondary actions only.

---

## Phase 61.4 – Surface-Level Badge Config Hooks

**Goal:** Add configuration hooks so different gallery surfaces can tweak badge visibility without forking `MediaCard`.

### Plan

- Extend the gallery types in `apps/main/src/lib/gallery/types.ts`:

  ```ts
  export interface GallerySurfaceDefinition {
    // existing fields...
    badgeConfig?: {
      showPrimaryIcon?: boolean;      // default true
      showStatusIcon?: boolean;       // default true
      showStatusTextOnHover?: boolean; // default true
      showTagsInOverlay?: boolean;    // default true
      showFooterProvider?: boolean;   // default true
      showFooterDate?: boolean;       // default true
    };
  }
  ```

- Update gallery surfaces (`Default`, `Review`, `Curator`) to set sensible defaults, e.g.:
  - Default surface: keep most features on, but prefer icons over text where possible.
  - Review surface: emphasize status and curation info; tags may be less important.
  - Curator surface: emphasize tags and metadata; status text may be more prominent.

- Allow surfaces to pass their `badgeConfig` down to `MediaCard` via props:
  - `MediaCard` should accept an optional `badgeConfig` prop and use it to toggle parts of the layout (primary icon, status text, tags in overlay, footer bits).

### Verification

- Changing the `badgeConfig` for a surface (e.g., turning off `showTagsInOverlay`) visibly affects cards rendered in that surface, without any changes to the core `MediaCard` logic.
- Default behavior remains unchanged for surfaces that don’t specify a `badgeConfig`.

---

## Phase 61.5 – UX & Docs

**Goal:** Document the new badge layout and actions so future work (like user preferences) has a clear anchor.

### Plan

- Update gallery docs:
  - In `apps/main/src/lib/gallery/GALLERY_SURFACES.md` (or add a short section if not present):
    - Describe the media card badge layout:
      - Top-left primary icon,
      - Top-right contextual status,
      - Bottom overlay for detail,
      - Footer for provider/date.
    - Document `badgeConfig` on `GallerySurfaceDefinition` with a couple of examples.

- Update task 32 doc (`claude-tasks/32-gallery-provider-status-and-flags.md`) to note that:
  - Provider status is now predominantly surfaced via icon + a small status badge on hover, not always-on text.

- Optional: Add a short design note in `UI_CONSOLIDATION_COMPLETED.md` or similar, explaining that:
  - Status and type information has been moved from always-visible labels to icon badges + contextual hover + menu, to reduce visual noise in dense grids.

### Verification

- A UI dev reading the docs understands:
  - where badges appear on the card,
  - how to tweak badge visibility per surface,
  - how to add new actions to the three-dots menu.

### Panel integration notes

- When implemented, gallery panel settings in `panelConfigStore` (e.g. `settings.gallery.badgeConfig`) should map directly onto `badgeConfig` passed to gallery surfaces and/or gallery widgets.
- Panel Builder compositions that include a gallery widget should save their badge-related props into the composition and flow them into `MediaCard` in the same way.
- This keeps gallery badge behavior part of the **configurable panel** system (panel registry + panel builder) rather than a one-off global setting.

---

## Success Criteria

- Media cards in `/assets` feel visually lighter:
  - No always-on “Open” button or redundant status labels.
  - Primary type/status is conveyed via icons and small badges.
- Less common info (extended status, tags, metadata actions) is moved into:
  - the hover overlay, and
  - the three-dots menu in the bottom-right.
- Gallery surfaces have a simple way to configure which badges/elements are visible without forking `MediaCard`.
