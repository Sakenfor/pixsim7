# Comic Panels – Architecture & Integration Review

**Date:** 2025-12-13
**Reviewer:** Claude Code
**Goal:** Understand the current comic panels implementation and propose optimal placement in the new architecture.

---

## Executive Summary

Comic panels are a **lightweight presentation layer** for visualizing story beats as sequential images. Currently implemented as an **overlay widget** with minimal integration into scenes and interactions. The implementation is well-designed but needs better placement within the new feature-based architecture.

**Key Findings:**
- Comic panels are **scene-centric**, not interaction-centric
- Currently distributed across `lib/ui/overlay/widgets/` and `lib/gameplay-ui-core/`
- No coupling to interactions feature
- Uses simple `assetId` strings rather than canonical ID types (`AssetRef`)
- Does not use `IAssetProvider` abstraction yet

**Recommendation:**
- Move core implementation to `@features/scene/ui/` (new folder)
- Keep widget in `lib/ui/overlay/widgets/` but simplify it to call scene UI helpers
- Align with `@lib/assetProvider` for media fetching

---

## Import Rules of Thumb

Following the new architecture, **always use path aliases** to make ownership clear:

### ✅ Correct Import Patterns

```typescript
// Features: Always use @features/*
import { SceneManagementPanel } from '@features/scene';
import { InteractionMenu } from '@features/interactions';
import { GalleryGrid } from '@features/gallery';

// Shared libraries: Always use @lib/*
import { useAssetProvider } from '@lib/assetProvider';
import { createBindingFromValue } from '@lib/editing-core';
import { OverlayWidget } from '@lib/ui/overlay';

// Root-level: Use @/ only when no narrower alias exists
import { gameStore } from '@/stores/gameStore';
import { MainLayout } from '@/components/layout/MainLayout';
```

### ❌ Anti-Patterns (Avoid These)

```typescript
// DON'T use @/ for features that have their own alias
import { SceneManagementPanel } from '@/features/scene';  // ❌ Use @features/scene

// DON'T use @/ for libs that have their own alias
import { useAssetProvider } from '@/lib/assetProvider';  // ❌ Use @lib/assetProvider

// DON'T use relative imports across features
import { InteractionMenu } from '../../../interactions';  // ❌ Use @features/interactions

// DON'T use deep imports into other features
import { getActiveComicPanels } from '@features/scene/ui/comicPanels/selection';  // ❌ Use barrel export
import { getActiveComicPanels } from '@features/scene';  // ✅ Import from feature root
```

### Why This Matters

- **Clear ownership:** `@features/scene` tells you the scene feature owns this code
- **Refactor-safe:** Moving files within a feature doesn't break external imports if barrel exports are maintained
- **Circular dependency prevention:** Features can't accidentally depend on each other if they use explicit aliases
- **Readable diffs:** Path aliases make code review easier ("this imports from the gallery feature")

---

## Feature Ownership Boundaries

To prevent the feature-coupling issues identified in the architecture audit, here are **explicit ownership statements** for related features:

### Assets vs. Gallery
- **`@features/assets`** owns:
  - Asset CRUD operations (create, update, delete)
  - Asset storage and organization (folders, collections)
  - Upload/import workflows
  - Asset metadata management
- **`@features/gallery`** owns:
  - Asset display and filtering UI
  - Gallery grid/list views
  - Asset preview and selection
  - Visual asset browsing

**Rule:** If it's about *storing* assets, use `@features/assets`. If it's about *showing* assets, use `@features/gallery`.

### HUD vs. World Tools
- **`@features/hud`** owns:
  - HUD layout engine and rendering
  - HUD widget system (health bars, minimaps, etc.)
  - In-game overlay UI
  - HUD editor and customization
- **`@features/worldTools`** owns:
  - World-level configuration tools (not gameplay UI)
  - NPC/location management panels
  - World visual roles binding
  - Campaign/world editing workflows

**Rule:** If it's displayed *during gameplay*, use `@features/hud`. If it's a *world authoring tool*, use `@features/worldTools`.

### Control Center vs. Generation
- **`@features/controlCenter`** owns:
  - Centralized settings/preferences UI
  - Quick access panels and launchers
  - User workspace configuration
  - Global app controls
- **`@features/generation`** (or `@lib/generation-ui`) owns:
  - Generation request forms and settings
  - Provider-specific UI (Pixverse, Runway, etc.)
  - Generation history and status
  - Template/prompt builders

**Rule:** If it's about *app-wide settings*, use `@features/controlCenter`. If it's about *creating/generating content*, use generation feature/lib.

### Scene vs. Interactions vs. Comic Panels
- **`@features/scene`** owns:
  - Scene graph structure and nodes
  - Scene playback and transitions
  - Comic panels (scene visualization)
  - Scene-level metadata
- **`@features/interactions`** owns:
  - NPC dialogue menus
  - Interaction history/chains
  - Turn-by-turn interaction UI
  - Character mood/relationship displays
- **Comic panels** (owned by `@features/scene`) are for:
  - Scene-level story beats (before/after gameplay)
  - Cutscene-style sequences
  - **NOT** for dialogue visualization (that's interactions)

**Rule:** If it shows *scene structure*, use `@features/scene`. If it shows *NPC conversations*, use `@features/interactions`. Comic panels are scene transitions, not interaction UI.

---

## 1. Code Inventory

### 1.1. Core Comic Panel Files

| File Path | Purpose | Dependencies | LOC |
|-----------|---------|--------------|-----|
| `apps/main/src/lib/gameplay-ui-core/comicPanels.ts` | Helper functions for panel selection/management | `@/modules/scene-builder` types | 159 |
| `apps/main/src/lib/ui/overlay/widgets/ComicPanelWidget.tsx` | Overlay widget renderer | `@lib/editing-core`, `@/modules/scene-builder` | 172 |
| `apps/main/src/modules/scene-builder/index.ts` (lines 168-231) | Type definitions (`SceneMetaComicPanel`, `ComicSessionFlags`) | None | ~63 |
| `docs/COMIC_PANELS.md` | Feature documentation | N/A | 313 |
| `claude-tasks/98-comic-panel-widget-and-scene-integration.md` | Implementation task spec | N/A | 219 |

**Total Implementation:** ~594 lines (types + logic + docs)

### 1.2. Integration Points

| Component | File | Integration Type |
|-----------|------|------------------|
| **Overlay Registry** | `apps/main/src/lib/ui/overlay/overlayWidgetRegistry.ts:238-254` | Factory registration (`comicPanelFactory`) |
| **Overlay Editor** | `apps/main/src/components/overlay-editor/TypeSpecificProperties.tsx:431-456` | Property editor (`ComicPanelProperties`) |
| **Scene Builder Types** | `apps/main/src/modules/scene-builder/index.ts` | Data schema (`DraftScene.comicPanels`, `SceneMetadata.comicPanels`) |
| **Gameplay UI Core** | `apps/main/src/lib/gameplay-ui-core/index.ts` | Barrel export |

### 1.3. Dependencies Summary

```
comicPanels.ts depends on:
  - @/modules/scene-builder (SceneMetaComicPanel, ComicSessionFlags)

ComicPanelWidget.tsx depends on:
  - @lib/ui/overlay (OverlayWidget, WidgetPosition, VisibilityConfig)
  - @lib/editing-core (DataBinding, resolveDataBinding)
  - @/modules/scene-builder (SceneMetaComicPanel)

No dependencies on:
  - @features/interactions (✓ good separation)
  - @features/scene (could be better integrated)
  - @lib/assetProvider (missing – should use this)
  - @pixsim7/shared.types/ids (missing – uses plain assetId strings)
```

---

## 2. Relationship to Existing Layers

### 2.1. Scenes

**Relationship:** Primary owner of comic panel data.

- **Storage:** `DraftScene.comicPanels` and `SceneMetadata.comicPanels`
- **Purpose:** Comic panels visualize **scene transitions** and **story beats**
- **Current State:** Types are defined in `@/modules/scene-builder` but no scene-specific UI helpers exist

**Finding:** Comic panels are fundamentally a **scene visualization** feature, not a standalone system.

### 2.2. Interactions

**Relationship:** None currently.

- Searched `apps/main/src/features/interactions/` – no references to comic panels
- Comic panels do **not** visualize dialogue/choices directly
- Could potentially be used to show interaction outcomes, but not implemented

**Finding:** Comic panels are **independent of interactions**. They serve scene-level storytelling, not turn-by-turn dialogue visualization.

### 2.3. Characters & Locations

**Current Approach:**
```typescript
interface SceneMetaComicPanel {
  id: string;
  assetId: string;  // ❌ Plain string, not AssetRef
  caption?: string;
  tags?: string[];  // ❌ Ad-hoc tags like "dramatic", "outdoor"
}
```

**Canonical ID System:**
```typescript
// From @pixsim7/shared.types/ids.ts
type AssetRef = `asset:${number}`;
type NpcRef = `npc:${number}`;
type LocationRef = `location:${number}`;

const Ref = {
  asset: (id: AssetId | number): AssetRef => `asset:${id}` as AssetRef,
  npc: (id: NpcId | number): NpcRef => `npc:${id}` as NpcRef,
  location: (id: LocationId | number): LocationRef => `location:${id}` as LocationRef,
};
```

**Finding:** Comic panels currently use **plain `assetId` strings** rather than typed `AssetRef`. The `tags` field is used for categorization but doesn't reference canonical NPCs or locations.

**Alignment Gap:**
- ❌ No use of `AssetRef`, `NpcRef`, or `LocationRef`
- ❌ Tags like `"dramatic"` or `"outdoor"` are user-defined strings, not linked to world entities
- ⚠️ Asset IDs could be gallery IDs or provider asset IDs (ambiguous format)

---

## 3. Asset & Generation Integration

### 3.1. Current Asset Handling

**In `ComicPanelWidget.tsx`:**
```typescript
// Line 151-156
<img
  src={`/api/assets/${panel.assetId}`}
  alt={panel.caption || `Comic panel ${index + 1}`}
  className="w-full h-auto object-contain"
/>
```

**Analysis:**
- ✅ Uses backend `/api/assets/` endpoint directly
- ❌ No use of `IAssetProvider` abstraction
- ❌ No preloading or caching strategy
- ❌ No fallback if asset is missing
- ⚠️ Asset ID format is ambiguous (could be gallery ID or provider-specific ID)

### 3.2. Asset Provider Abstraction

**Available in `@lib/assetProvider`:**
```typescript
interface IAssetProvider {
  getAsset(assetId: string): Promise<Asset>;
  requestAsset(request: AssetRequest): Promise<Asset>;
  checkAvailability(request: AssetRequest): Promise<AssetAvailability>;
}

interface Asset {
  id: string;
  url: string;
  type: MediaType;
  source: AssetSource; // 'pre-made' | 'generated' | 'cached'
  metadata: AssetMetadata;
}
```

**Gap Analysis:**
- ❌ Comic panels do **not** use `useAssetProvider()` hook
- ❌ No integration with `GeneratedAssetProvider` or `PreMadeAssetProvider`
- ⚠️ If an asset is deleted, the widget will show a broken image

### 3.3. Proposed Asset Integration

**Short-term:** Use `IAssetProvider.getAsset()` for robust asset fetching
```typescript
const assetProvider = useAssetProvider();
const asset = await assetProvider.getAsset(panel.assetId);
// Render: <img src={asset.url} />
```

**Medium-term:** Support dynamic panel generation
```typescript
const request: AssetRequest = {
  sceneId: scene.id,
  prompt: panel.caption,
  style: 'anime',
};
const asset = await assetProvider.requestAsset(request);
```

**Long-term:** Preload assets for panel sequences
```typescript
const assetIds = getComicPanelAssetIds(panels);
const availability = await Promise.all(
  assetIds.map(id => assetProvider.checkAvailability({ assetId: id }))
);
// Preload missing assets before showing panel sequence
```

---

## 4. Ownership & Folder Placement

### 4.1. Current Structure

```
apps/main/src/
├── lib/
│   ├── gameplay-ui-core/
│   │   ├── comicPanels.ts          ← Helper functions
│   │   └── index.ts
│   └── ui/overlay/widgets/
│       └── ComicPanelWidget.tsx    ← Widget renderer
├── modules/scene-builder/
│   └── index.ts                    ← Type definitions
└── components/overlay-editor/
    └── TypeSpecificProperties.tsx  ← Editor UI
```

**Issues:**
- Comic panel helpers are in `lib/gameplay-ui-core/` (generic name, not scene-specific)
- Widget is in `lib/ui/overlay/widgets/` (correct, but widget is too fat – contains rendering logic)
- No centralized owner in `@features/scene/`

### 4.2. Recommended Structure

**Phase 1: Create `@features/scene/ui/` layer**

```
apps/main/src/features/scene/
├── components/
│   ├── panels/              ← Existing scene panels
│   └── player/              ← Existing playback UI
├── lib/
│   └── core/                ← Existing scene types
└── ui/                      ← NEW: Scene UI helpers
    ├── comicPanels/
    │   ├── index.ts
    │   ├── types.ts         ← Re-export SceneMetaComicPanel from scene-builder
    │   ├── selection.ts     ← Move getActiveComicPanels, getComicPanelById, etc.
    │   ├── state.ts         ← Move setCurrentComicPanel, clearCurrentComicPanel
    │   └── ComicPanelView.tsx  ← Presentational component (rendering logic)
    └── index.ts             ← Barrel export
```

**Phase 2: Simplify widget to call scene UI**

```
apps/main/src/lib/ui/overlay/widgets/
└── ComicPanelWidget.tsx    ← Thin wrapper calling ComicPanelView
```

```typescript
// ComicPanelWidget.tsx (simplified)
import { ComicPanelView } from '@features/scene/ui';
import { getActiveComicPanels } from '@features/scene/ui';

export function createComicPanelWidget(config: ComicPanelWidgetConfig): OverlayWidget {
  return {
    // ... position, visibility, etc.
    render: (data, context) => {
      const panels = getActiveComicPanels(data.session, data.scene);
      return <ComicPanelView panels={panels} layout={config.layout} />;
    },
  };
}
```

**Benefits:**
- ✅ Comic panel logic is **owned by `@features/scene`**
- ✅ Overlay widget becomes a **thin integration layer**
- ✅ `ComicPanelView` can be reused in other contexts (HUD, storyboard editor, etc.)
- ✅ Aligns with architecture principle: features own their UI, lib/ provides cross-cutting infrastructure

### 4.3. Dependencies After Refactor

```
@features/scene/ui/comicPanels depends on:
  - @/modules/scene-builder (types)
  - @lib/assetProvider (asset fetching)
  - @pixsim7/shared.types/ids (canonical IDs)

lib/ui/overlay/widgets/ComicPanelWidget depends on:
  - @features/scene/ui (rendering)
  - @lib/editing-core (bindings)
  - @lib/ui/overlay (widget types)
```

---

## 5. Recommendations & Migration Steps

### 5.1. Short-Term: Align with Feature Architecture (Phase 1)

**Goal:** Move comic panel ownership to `@features/scene` without breaking changes.

**Tasks:**
1. ✅ **Create `apps/main/src/features/scene/ui/` directory**
2. ✅ **Move `comicPanels.ts` → `@features/scene/ui/comicPanels/`**
   - Split into `selection.ts`, `state.ts`, `types.ts`
3. ✅ **Create `ComicPanelView.tsx`** in `@features/scene/ui/comicPanels/`
   - Extract rendering logic from `ComicPanelWidget.tsx`
   - Make it a pure React component (no overlay coupling)
4. ✅ **Update imports** in `lib/gameplay-ui-core/index.ts`
   - Re-export from `@features/scene/ui` for backward compatibility
   - Add deprecation warning: `// @deprecated Import from @features/scene/ui instead`
5. ✅ **Update `@features/scene/index.ts`** to export new UI helpers

**Estimated Effort:** 2-3 hours
**Risk:** Low (backward-compatible re-exports)

---

### 5.2. Medium-Term: Refactor Asset Handling (Phase 2)

**Goal:** Use `IAssetProvider` for robust, future-proof asset fetching.

**Tasks:**
1. ✅ **Update `SceneMetaComicPanel` type** to use `AssetRef`
   ```typescript
   interface SceneMetaComicPanel {
     id: string;
     assetId: AssetRef;  // Changed from string
     caption?: string;
     tags?: string[];
   }
   ```
2. ✅ **Update `ComicPanelView.tsx`** to use `useAssetProvider()`
   ```typescript
   const assetProvider = useAssetProvider();
   const asset = await assetProvider.getAsset(panel.assetId);
   ```
3. ✅ **Add error handling** for missing assets
   - Show placeholder if asset fetch fails
   - Log warning to console
4. ✅ **Add preloading logic** in `getComicPanelAssetIds()`
   - Return `AssetRef[]` instead of `string[]`
   - Provide helper to preload all panel assets

**Migration Path:**
- Support both `string` and `AssetRef` during transition
- Add type guard: `isAssetRef(id)` to detect format
- Auto-upgrade plain strings to `AssetRef` format in helpers

**Estimated Effort:** 4-6 hours
**Risk:** Medium (requires data migration for existing scenes)

---

### 5.3. Long-Term: Full Visual Context Integration (Phase 3)

**Goal:** Integrate with Task 101 (Scene & World Visual Context Resolver) for unified asset resolution.

**Tasks:**
1. ✅ **Add character/location metadata** to `SceneMetaComicPanel`
   ```typescript
   interface SceneMetaComicPanel {
     id: string;
     assetId: AssetRef;
     caption?: string;
     tags?: string[];
     // NEW: Semantic metadata
     characters?: NpcRef[];     // NPCs shown in this panel
     location?: LocationRef;    // Location for this panel
     mood?: 'dramatic' | 'happy' | 'suspenseful';  // Replace ad-hoc tags
   }
   ```
2. ✅ **Use visual context resolver** for dynamic panel selection
   ```typescript
   import { resolveVisualContext } from '@lib/gameplay-ui-core/visualContext';

   const context = resolveVisualContext({
     world,
     sceneMeta,
     session,
     assets: galleryAssets,
   });

   // context.comicPanels already filtered by session state
   ```
3. ✅ **Support generation triggers** for missing panels
   ```typescript
   const request: AssetRequest = {
     sceneId: scene.id,
     characterId: panel.characters?.[0],
     locationId: panel.location,
     prompt: panel.caption,
   };
   const asset = await assetProvider.requestAsset(request);
   ```
4. ✅ **Add panel transition animations**
   - Fade/slide between panels
   - Configurable in `ComicPanelLayout` type

**Estimated Effort:** 8-12 hours
**Dependencies:** Task 101 completion
**Risk:** Low (additive changes)

---

## 6. Summary Table: Where Comic Panels Should Live

| Component | Current Location | Recommended Location | Reason |
|-----------|------------------|---------------------|--------|
| **Type Definitions** | `@/modules/scene-builder/index.ts` | Keep as-is | ✅ Correct – scenes own their schema |
| **Selection Helpers** | `@lib/gameplay-ui-core/comicPanels.ts` | `@features/scene/ui/comicPanels/selection.ts` | Scene-specific logic belongs in scene feature |
| **State Helpers** | `@lib/gameplay-ui-core/comicPanels.ts` | `@features/scene/ui/comicPanels/state.ts` | Session flag management is scene-related |
| **Rendering Component** | `@lib/ui/overlay/widgets/ComicPanelWidget.tsx` (fat) | `@features/scene/ui/comicPanels/ComicPanelView.tsx` (new) | Extract pure UI to scene feature |
| **Overlay Widget** | `@lib/ui/overlay/widgets/ComicPanelWidget.tsx` | Keep (but simplify) | ✅ Thin adapter calling scene UI |
| **Editor Properties** | `@components/overlay-editor/TypeSpecificProperties.tsx` | Keep as-is | ✅ Editor infrastructure is cross-cutting |
| **Documentation** | `docs/COMIC_PANELS.md` | Keep (update paths) | ✅ Top-level docs are correct |

---

## 7. Migration Checklist

### Phase 1: Feature Ownership (Short-term)
- [ ] Create `apps/main/src/features/scene/ui/` directory
- [ ] Create `apps/main/src/features/scene/ui/comicPanels/index.ts`
- [ ] Move helpers to `@features/scene/ui/comicPanels/`:
  - [ ] `selection.ts` (getActiveComicPanels, getComicPanelById, getComicPanelsByTags)
  - [ ] `state.ts` (setCurrentComicPanel, clearCurrentComicPanel)
  - [ ] `types.ts` (re-export SceneMetaComicPanel, ComicSessionFlags)
- [ ] Create `ComicPanelView.tsx` in `@features/scene/ui/comicPanels/`
- [ ] Update `ComicPanelWidget.tsx` to call `ComicPanelView`
- [ ] Add barrel exports to `@features/scene/index.ts`
- [ ] Update `lib/gameplay-ui-core/index.ts` with deprecation warnings

### Phase 2: Asset Integration (Medium-term)
- [ ] Update `SceneMetaComicPanel.assetId` to use `AssetRef` type
- [ ] Add migration helper for existing scenes (string → AssetRef)
- [ ] Update `ComicPanelView` to use `useAssetProvider()`
- [ ] Add error handling for missing assets
- [ ] Implement asset preloading in panel sequences
- [ ] Update documentation with new asset handling patterns

### Phase 3: Visual Context (Long-term)
- [ ] Add `characters`, `location`, `mood` fields to `SceneMetaComicPanel`
- [ ] Integrate with Task 101 visual context resolver
- [ ] Support dynamic panel generation via `IAssetProvider.requestAsset()`
- [ ] Add panel transition animations
- [ ] Document integration with world visual roles

---

## 8. Questions & Risks

### Open Questions
1. **Should comic panels support video panels?** Currently image-only.
   - **Answer:** Out of scope for now. Could add `type: 'image' | 'video'` later.

2. **Should panels reference multiple NPCs/locations?**
   - **Answer:** Yes (see Phase 3). Panel could show "Alex and Sam at the tavern".

3. **How to handle panel versioning?** If a scene's panels change, what happens to in-progress sessions?
   - **Answer:** Session flags (`current_panel` ID) are stable. If panel is removed, fall back to showing all panels.

### Risks
- **Data Migration Risk:** Changing `assetId: string` → `assetId: AssetRef` requires migrating existing scenes
  - **Mitigation:** Support both formats during transition, auto-upgrade on load
- **Breaking Changes:** Moving files could break external imports
  - **Mitigation:** Keep re-exports in old locations with deprecation warnings
- **Asset Provider Coupling:** Comic panels will depend on `IAssetProvider` being available
  - **Mitigation:** Provide fallback to direct `/api/assets/` endpoint if provider is not available

---

## 9. Related Documentation

- **[Comic Panels Documentation](../COMIC_PANELS.md)** – Feature overview and usage examples
- **[Task 98: Comic Panel Widget & Scene Integration](../../claude-tasks/98-comic-panel-widget-and-scene-integration.md)** – Original implementation spec
- **[Task 101: Scene & World Visual Context Resolver](../../claude-tasks/101-scene-and-world-visual-context-resolver.md)** – Future integration
- **[Editable UI Architecture](../EDITABLE_UI_ARCHITECTURE.md)** – Widget system overview
- **[Canonical IDs](../../packages/shared/types/src/ids.ts)** – Type-safe ID system
- **[Asset Provider](../../apps/main/src/lib/assetProvider/index.ts)** – Asset abstraction layer

---

## Appendix A: Example Migration

### Before (Current)
```typescript
// lib/gameplay-ui-core/comicPanels.ts
export function getActiveComicPanels(session, sceneMeta) {
  const comicPanels = sceneMeta.comicPanels || [];
  const currentPanelId = session.flags?.comic?.current_panel;
  if (currentPanelId) {
    return comicPanels.filter(p => p.id === currentPanelId);
  }
  return comicPanels;
}

// lib/ui/overlay/widgets/ComicPanelWidget.tsx
export function createComicPanelWidget(config) {
  return {
    render: (data) => {
      const panels = getActiveComicPanels(data.session, data.scene);
      return (
        <div>
          {panels.map(panel => (
            <img src={`/api/assets/${panel.assetId}`} />
          ))}
        </div>
      );
    },
  };
}
```

### After (Recommended)
```typescript
// features/scene/ui/comicPanels/selection.ts
import type { SceneMetaComicPanel, ComicSessionFlags } from '@/modules/scene-builder';

export function getActiveComicPanels(
  session: { flags?: { comic?: ComicSessionFlags } },
  sceneMeta: { comicPanels?: SceneMetaComicPanel[] }
): SceneMetaComicPanel[] {
  const comicPanels = sceneMeta.comicPanels || [];
  const currentPanelId = session.flags?.comic?.current_panel;

  if (currentPanelId) {
    return comicPanels.filter(p => p.id === currentPanelId);
  }
  return comicPanels;
}

// features/scene/ui/comicPanels/ComicPanelView.tsx
import { useAssetProvider } from '@lib/assetProvider';
import type { SceneMetaComicPanel } from '@/modules/scene-builder';

interface ComicPanelViewProps {
  panels: SceneMetaComicPanel[];
  layout?: 'single' | 'strip' | 'grid2';
  showCaption?: boolean;
}

export function ComicPanelView({ panels, layout = 'single', showCaption = true }: ComicPanelViewProps) {
  const assetProvider = useAssetProvider();
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all(
      panels.map(async (panel) => {
        const asset = await assetProvider.getAsset(panel.assetId);
        return [panel.assetId, asset.url];
      })
    ).then(entries => {
      setAssetUrls(Object.fromEntries(entries));
    });
  }, [panels]);

  return (
    <div className={layoutClasses[layout]}>
      {panels.map(panel => (
        <div key={panel.id}>
          <img src={assetUrls[panel.assetId] || '/placeholder.png'} />
          {showCaption && panel.caption && <p>{panel.caption}</p>}
        </div>
      ))}
    </div>
  );
}

// lib/ui/overlay/widgets/ComicPanelWidget.tsx (simplified)
import { getActiveComicPanels, ComicPanelView } from '@features/scene/ui';

export function createComicPanelWidget(config: ComicPanelWidgetConfig): OverlayWidget {
  return {
    render: (data) => {
      const panels = getActiveComicPanels(data.session, data.scene);
      return <ComicPanelView panels={panels} layout={config.layout} showCaption={config.showCaption} />;
    },
  };
}
```

---

**End of Review**
