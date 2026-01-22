# 103 – MediaCard Overlay Presets Migration

**Status:** Draft  
**Owner:** Frontend / Gallery  
**Related Tasks:** 61 (MediaCard badges), 62 (Gallery Panel Config & Widget), 93–97 (Overlay system), 68 (Gallery controller)

## Goal

Make MediaCard styling and behavior driven by the **overlay preset system** instead of the legacy **badge style presets**, so there is a single, coherent way to configure MediaCard across the app (Assets route, Gallery panel, Control Center, Settings).

## Problem

We currently have two overlapping configuration layers for MediaCard:

- **Overlay presets** (`apps/main/src/lib/overlay/presets/mediaCard.tsx`)
  - Canonical system for widget layout, spacing, and behavior.
  - Used by `MediaCardConfigPage` via `OverlayEditor` and `mediaCardPresets`.
- **Badge style presets** (`apps/main/src/lib/gallery/badgeConfigPresets.ts`)
  - Legacy system from pre-overlay gallery.
  - Still wired into:
    - `AssetsRoute` – header “Badge Style” dropdown
    - `PanelConfigurationPanel` – gallery panel badge config section
    - `GalleryModule` – Control Center “Badge Style” selector

This causes confusion (two ways to “style” MediaCard) and keeps dead weight around (`BADGE_CONFIG_PRESETS`), while newer work (Tasks 93–97) is centered on overlay presets.

## Scope

Frontend only – focused on:

- `MediaCard` component and its overlay configuration.
- Gallery panel settings and Assets route UI.
- Control Center Gallery module.
- Docs that still reference “badge style presets”.

Backend provider behavior, job flows, and Pixverse/Sora adapters are **out of scope**.

## High-Level Plan

1. **Introduce `overlayPresetId` in gallery panel settings**
2. **Replace badge style dropdowns with overlay preset selectors**
3. **Feed selected overlay preset into `MediaCard`**
4. **Keep `badgeConfig` as fine-grained overrides only**
5. **Remove or archive `badgeConfigPresets` and update docs**

---

## 1. Panel Settings – Store Overlay Preset ID

**Files:**
- `apps/main/src/stores/panelConfigStore.ts`

### Changes

- Extend `GalleryPanelSettings`:

```ts
export interface GalleryPanelSettings {
  overlayPresetId?: string; // e.g. 'media-card-default'
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

- Set a default for the gallery panel:

```ts
const defaultPanelConfigs: Record<PanelId, PanelConfig> = {
  gallery: {
    id: 'gallery',
    enabled: true,
    settings: {
      overlayPresetId: 'media-card-default',
      badgeConfig: defaultGalleryBadgeConfig,
    } as GalleryPanelSettings,
    // ...
  },
  // ...
};
```

Notes:
- This does not break existing persisted configs; missing `overlayPresetId` should just fall back to `'media-card-default'`.

---

## 2. Replace Badge Style Dropdowns with Overlay Presets

**Files:**
- `apps/main/src/routes/Assets.tsx`
- `apps/main/src/components/control/modules/GalleryModule.tsx`
- `apps/main/src/components/settings/PanelConfigurationPanel.tsx`

### 2.1 AssetsRoute – Header Selector

- Replace:
  - Import of `BADGE_CONFIG_PRESETS` / `findMatchingPreset` from `../lib/gallery/badgeConfigPresets`.
  - `currentBadgePreset` + `handleBadgePresetChange`.
  - “Badge Style” dropdown label.
- With:
  - Import of `mediaCardPresets` from `@/lib/overlay`.
  - `currentOverlayPresetId` resolving from `panelConfig?.settings?.overlayPresetId || 'media-card-default'`.
  - `handleOverlayPresetChange` that sets `overlayPresetId`:

```ts
const currentOverlayPresetId =
  panelConfig?.settings?.overlayPresetId || 'media-card-default';

const handleOverlayPresetChange = (presetId: string) => {
  const preset = mediaCardPresets.find(p => p.id === presetId);
  if (preset) {
    updatePanelSettings('gallery', { overlayPresetId: preset.id });
  }
};
```

- Update the header UI from “Badge Style” to “MediaCard Preset” and use `mediaCardPresets` in the `<select>`:

```tsx
<span className="text-xs text-neutral-500 dark:text-neutral-400">
  MediaCard Preset:
</span>
<select
  value={currentOverlayPresetId}
  onChange={(e) => handleOverlayPresetChange(e.target.value)}
  // ...classes...
>
  {mediaCardPresets.map(preset => (
    <option key={preset.id} value={preset.id}>
      {preset.icon} {preset.name}
    </option>
  ))}
</select>
```

### 2.2 Control Center – GalleryModule

- Same pattern:
  - Replace `BADGE_CONFIG_PRESETS` usage with `mediaCardPresets`.
  - Derive `currentOverlayPresetId` from `panelConfig?.settings?.overlayPresetId || 'media-card-default'`.
  - Update handler to `updatePanelSettings('gallery', { overlayPresetId })`.
  - Keep the “Badge Style” concept but rename copy to “MediaCard Preset” for consistency.

### 2.3 PanelConfigurationPanel – Gallery Advanced Settings

- In the gallery panel card, where badge style presets are currently shown:
  - Replace `BADGE_CONFIG_PRESETS` select with `mediaCardPresets`.
  - Bind `value` to `panel.settings?.overlayPresetId || 'media-card-default'`.
  - On change, call `onUpdateSettings({ overlayPresetId: value })`.
- Keep the per-flag badge toggles (showPrimaryIcon, showTagsInOverlay, etc.) as an “Advanced overrides” section under the chosen preset.

---

## 3. MediaCard – Apply Overlay Preset

**Files:**
- `apps/main/src/components/media/MediaCard.tsx`

### 3.1 Extend Props

Add an optional preset id to `MediaCardProps`:

```ts
import {
  OverlayContainer,
  type OverlayConfiguration,
  type OverlayWidget,
  getMediaCardPreset,
  getDefaultMediaCardConfig,
  mergeConfigurations,
} from '@/lib/overlay';

export interface MediaCardProps {
  // existing props...
  overlayPresetId?: string;
}
```

> NOTE: `mergeConfigurations` is already exported from `@/lib/overlay` via `utils/merge.ts`.

### 3.2 Merge Preset Configuration

In the `overlayConfig` `useMemo`, currently we:

- Build `defaultWidgets` from `createDefaultMediaCardWidgets(props)`.
- Merge in `customWidgets`.
- Build a simple `baseConfig` with `widgets`, `spacing`, and `id/name`.

Update this to:

1. Build `baseConfig` from runtime widgets (unchanged).
2. Look up the overlay preset using `props.overlayPresetId` (or default).
3. Merge preset configuration with `baseConfig`.
4. Let `customOverlayConfig` still override simple fields like `id`, `name`, `spacing`.

Sketch:

```ts
const overlayConfig: OverlayConfiguration = useMemo(() => {
  const defaultWidgets = createDefaultMediaCardWidgets(props);

  const widgetMap = new Map<string, OverlayWidget>();
  defaultWidgets.forEach(widget => widgetMap.set(widget.id, widget));
  customWidgets.forEach(widget => widgetMap.set(widget.id, widget));
  const finalWidgets = Array.from(widgetMap.values());

  const baseConfig: OverlayConfiguration = {
    id: 'media-card-default-runtime',
    name: 'Media Card',
    widgets: finalWidgets,
    spacing: customOverlayConfig?.spacing || 'normal',
  };

  const presetId =
    props.overlayPresetId ||
    customOverlayConfig?.id ||
    'media-card-default';

  const preset =
    getMediaCardPreset(presetId) ??
    { configuration: getDefaultMediaCardConfig() };

  const merged = mergeConfigurations(preset.configuration, baseConfig);

  return {
    ...merged,
    id: customOverlayConfig?.id || merged.id,
    name: customOverlayConfig?.name || merged.name,
    spacing: customOverlayConfig?.spacing || merged.spacing,
  };
}, [props, customWidgets, customOverlayConfig]);
```

### 3.3 Pass `overlayPresetId` from AssetsRoute

In `AssetsRoute`, after computing `currentOverlayPresetId`, pass it into every `MediaCard`:

```tsx
<MediaCard
  // existing props...
  badgeConfig={effectiveBadgeConfig}
  overlayPresetId={currentOverlayPresetId}
/>
```

Do this for both selection mode and normal mode card render paths.

Other surfaces (Curator, Review, GalleryGridWidget, etc.) can optionally pass a preset id later, but are not required in this first pass.

---

## 4. BadgeConfig – Keep as Overrides Only

We still want surfaces/panels to tweak low-level behaviour like:

- Show/hide primary icon.
- Show tags overlay.
- Footer provider/date.
- Generation menu visibility and quick action.

But the **primary style system** should be overlay presets.

### Rules

- `badgeConfig` remains on `MediaCardProps` and is still merged using `mergeBadgeConfig` in:
  - `apps/main/src/lib/gallery/badgeConfigMerge.ts`.
- Gallery panel settings can continue to store a `badgeConfig` object that overrides:
  - The default badge behavior implied by the preset.
  - Surface-level `badgeConfig` from `GallerySurfaceDefinition`.
- New work should not add *new* presets to `badgeConfigPresets`; instead, it should:
  - Add new overlay presets (`mediaCardPresets`).
  - Optionally extend `badgeConfig` and `mergeBadgeConfig` for additional flags.

---

## 5. Decommission `badgeConfigPresets`

**Files:**
- `apps/main/src/lib/gallery/badgeConfigPresets.ts`
- `docs` references (e.g. `GALLERY_SURFACES.md`, frontend docs)

### Steps

1. After rewiring all usage sites (AssetsRoute, GalleryModule, PanelConfigurationPanel), run a search:
   - `rg "badgeConfigPresets" -n`
   - `rg "BADGE_CONFIG_PRESETS" -n`
   - `rg "findMatchingPreset" -n`
2. If no remaining usages exist:
   - Delete `apps/main/src/lib/gallery/badgeConfigPresets.ts`.
   - Remove related exports if any (currently only local).
3. Update docs:
   - `apps/main/src/lib/gallery/GALLERY_SURFACES.md`
   - Any docs under `docs/frontend` that talk about “Badge Style presets”.
   - Replace language like:
     - “Badge style presets (Default, Minimal, Compact, …)”
   - With:
     - “MediaCard overlay presets (media-card-default, media-card-minimal, …)”
4. (Optional) Add a short note to `MediaCardConfigPage` JSDoc or docs that:
   - It is the canonical way to create/manage MediaCard overlay presets.

---

## Acceptance Criteria

- **Single source of truth:**
  - Gallery panel configuration stores **one** preset choice: `overlayPresetId`.
  - No UI in the app uses `BADGE_CONFIG_PRESETS` or `findMatchingPreset`.

- **Assets route:**
  - Header dropdown shows overlay-based presets (labels/icons from `mediaCardPresets`).
  - Changing the preset updates MediaCard layout/overlays in the gallery.
  - Choice persists via `panelConfigStore` across reloads.

- **Control Center Gallery module:**
  - “Badge Style” section replaced with “MediaCard Preset” selector.
  - Selector is in sync with the gallery panel’s `overlayPresetId`.

- **Panel Configuration Panel:**
  - Gallery panel card exposes overlay preset selection.
  - Advanced badge toggles still work as expected (show/hide primary icon, tags, etc.).

- **MediaCard behavior:**
  - `MediaCard` merges the selected overlay preset with runtime widgets and custom overlay config.
  - Existing features (status badge, upload button, generation menu, tags tooltip, video scrub) still function.

- **Cleanup:**
  - `apps/main/src/lib/gallery/badgeConfigPresets.ts` is unused or removed.
  - Docs refer to overlay presets instead of standalone “badge style presets”.

---

## Notes / Follow-Ups

- Once this migration is stable, consider:
  - Adding per-surface default `overlayPresetId` (e.g. review surface uses a “review-focused” preset by default).
  - Exposing overlay preset selection inside GallerySurface definitions or widgets.
  - Tightening the relationship between `badgeConfig` and overlay widgets (e.g., hiding widgets entirely when flags are false).

