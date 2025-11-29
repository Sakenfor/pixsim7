# Panel Organization Audit

**Date:** 2025-11-28
**Status:** 🔴 **SCATTERED** - Needs reorganization

## Executive Summary

The panel system is **highly scattered** across the codebase with **56+ panel files** spread across **30+ directories**. This makes it difficult to:
- Find panels
- Understand panel relationships
- Maintain consistent patterns
- Onboard new developers

---

## Current State

### Panel Distribution

| Location | Count | Purpose |
|----------|-------|---------|
| `components/panels/` | **3** | ✅ Should be main location |
| `components/game/` | **10** | Game-specific panels |
| `components/dev/` | **8** | Dev tools panels |
| `components/settings/` | **2** | Settings panels |
| `components/legacy/` | **5** | ⚠️ Legacy (should clean up?) |
| **Other 25+ directories** | **36** | 🔴 Scattered everywhere |
| **TOTAL** | **56+** | |

---

### Detailed Breakdown

#### ✅ Components/Panels (Main Location - Only 3 files!)
```
components/panels/
├── ComposedPanel.tsx
├── HudDesignerPanel.tsx
└── SceneLibraryPanel.tsx
```

#### Components/Game (10 panels)
```
components/game/
├── DynamicThemeRulesPanel.tsx
├── GameThemingPanel.tsx
├── HudCustomizationPanel.tsx
├── InteractionPresetUsagePanel.tsx
├── InventoryPanel.tsx
├── NpcInteractionPanel.tsx
├── SessionOverridePanel.tsx
├── ThemePacksPanel.tsx
├── UserPreferencesPanel.tsx
└── WorldToolsPanel.tsx
```

#### Components/Dev (8 dev tool panels)
```
components/dev/
├── AppMapPanel.tsx
├── BackendArchitecturePanel.tsx
├── CapabilityTestingPanel.tsx
├── DependencyGraphPanel.tsx
├── DevToolDynamicPanel.tsx
├── DevToolsPanel.tsx
├── GenerationDevPanel.tsx
└── TemplateAnalyticsPanel.tsx
```

#### ⚠️ Components/Legacy (5 panels - Should these be removed?)
```
components/legacy/
├── ArcGraphPanel.tsx
├── GraphPanel.tsx
├── PluginCatalogPanel.tsx
├── PluginConfigPanel.tsx
└── SceneBuilderPanel.tsx
```

#### 🔴 Scattered Across 25+ Other Directories
```
components/arc-graph/ArcGraphPanel.tsx
components/assets/LocalFoldersPanel.tsx
components/brain/BrainToolsPanel.tsx
components/builder/SimplePanelBuilder.tsx
components/campaign/CampaignPanel.tsx
components/control/CubeSettingsPanel.tsx
components/control/PanelActionEditor.tsx
components/control/PanelLauncherModule.tsx
components/devtools/GizmoSurfacesPanel.tsx
components/gallery/GalleryToolsPanel.tsx
components/generation/SocialContextPanel.tsx
components/health/HealthPanel.tsx
components/inspector/InspectorPanel.tsx
components/interactions/PendingDialoguePanel.tsx
components/intimacy/GatePreviewPanel.tsx
components/intimacy/GenerationPreviewPanel.tsx
components/intimacy/PlaytestingPanel.tsx
components/layout/FloatingPanelsManager.tsx
components/provider/ProviderSettingsPanel.tsx
components/scene/SceneManagementPanel.tsx
components/scene-collection/SceneCollectionPanel.tsx
components/scene-player/ScenePlaybackPanel.tsx
components/simulation/ExportImportPanel.tsx
components/simulation/SimulationPluginsPanel.tsx
components/validation/ValidationPanel.tsx
components/workspace/QuickPanelSwitcher.tsx
... and more
```

---

## Core Panel System

### Panel Registry & Infrastructure

```
lib/panels/
├── PANEL_PLUGINS_AND_REGISTRY.md   # Documentation
├── panelRegistry.ts                 # Central registry
├── panelPlugin.ts                   # Plugin system
├── corePanelsPlugin.tsx             # Core panels
└── initializePanels.ts              # Initialization
```

### Panel Configuration

```
stores/
├── workspaceStore.ts                # Workspace layout & panel state
└── panelConfigStore.ts              # Panel-specific configs
```

**Supported Panel IDs (from workspaceStore.ts:6-20):**
```typescript
type PanelId =
  | 'gallery'
  | 'scene'
  | 'graph'
  | 'inspector'
  | 'health'
  | 'game'
  | 'providers'
  | 'settings'
  | 'gizmo-lab'
  | 'npc-brain-lab'
  | 'game-theming'
  | 'scene-management'
  | 'dev-tools'
  | 'hud-designer';
```

---

## Issues Identified

### 1. 🔴 Extreme Scattering
- Only **3 panels** in `components/panels/` (the intended location)
- **53+ panels scattered** across 30+ other directories
- No clear organizational principle

### 2. ⚠️ Category Confusion
Some categories overlap or are unclear:
- `components/dev/` vs `components/devtools/`
- `components/scene/` vs `components/scene-collection/` vs `components/scene-player/`
- `components/health/` (single panel - why its own directory?)
- `components/workspace/` (has workspace-related panels)

### 3. 🔴 Legacy Cleanup Needed
- 5 panels in `components/legacy/` with unclear status
- Are these still used? Can they be removed?
- One `.bak` file: `components/health/HealthPanel.tsx.bak`

### 4. ⚠️ Panel vs Non-Panel Files
Some directories have panel files mixed with non-panel components:
- `components/control/` - Has 3 panel-related files + control center logic
- `components/layout/` - Has workspace toolbar with panel dropdowns
- `components/workspace/` - Has quick panel switcher

### 5. 🔴 No Clear Main Panels vs Dev Panels Separation
- Dev panels scattered: some in `components/dev/`, some in `components/devtools/`
- Main panels scattered everywhere else

---

## Recommended Organization

### Option A: Feature-Based (Current Implicit Structure)

Keep panels co-located with their features, but be more intentional:

```
components/
├── panels/                          # Generic/reusable panels only
│   ├── ComposedPanel.tsx
│   └── SimplePanelBuilder.tsx
│
├── game/                            # Game panels (keep together)
│   └── panels/
│       ├── InventoryPanel.tsx
│       ├── NpcInteractionPanel.tsx
│       ├── WorldToolsPanel.tsx
│       └── ...
│
├── scene/                           # Scene panels (consolidate)
│   └── panels/
│       ├── SceneManagementPanel.tsx
│       ├── SceneCollectionPanel.tsx
│       ├── SceneLibraryPanel.tsx
│       └── ScenePlaybackPanel.tsx
│
├── dev/                             # All dev panels (consolidate)
│   └── panels/
│       ├── AppMapPanel.tsx
│       ├── DevToolsPanel.tsx
│       ├── GizmoSurfacesPanel.tsx
│       └── ...
│
└── settings/                        # Settings panels
    └── panels/
        ├── SettingsPanel.tsx
        └── PanelConfigurationPanel.tsx
```

**Pros:**
- Features stay together (game stuff with game, scene stuff with scene)
- Easy to find related panels
- Natural boundaries

**Cons:**
- Still somewhat scattered
- Need conventions (`/panels/` subfolder)

---

### Option B: Centralized (Clean Reorganization)

Move all panels to `components/panels/` with category subfolders:

```
components/panels/
├── core/                            # Core workspace panels
│   ├── GalleryPanel.tsx
│   ├── InspectorPanel.tsx
│   ├── HealthPanel.tsx
│   └── SettingsPanel.tsx
│
├── game/                            # Game-specific panels
│   ├── InventoryPanel.tsx
│   ├── NpcInteractionPanel.tsx
│   ├── WorldToolsPanel.tsx
│   ├── GameThemingPanel.tsx
│   └── ...
│
├── scene/                           # Scene-related panels
│   ├── SceneManagementPanel.tsx
│   ├── SceneCollectionPanel.tsx
│   ├── SceneLibraryPanel.tsx
│   └── ScenePlaybackPanel.tsx
│
├── dev/                             # Dev/debug panels
│   ├── AppMapPanel.tsx
│   ├── DevToolsPanel.tsx
│   ├── DependencyGraphPanel.tsx
│   ├── GizmoSurfacesPanel.tsx
│   └── ...
│
├── generation/                      # AI/generation panels
│   ├── GenerationPreviewPanel.tsx
│   ├── SocialContextPanel.tsx
│   └── ...
│
├── tools/                           # Utility panels
│   ├── ExportImportPanel.tsx
│   ├── ValidationPanel.tsx
│   └── ...
│
└── shared/                          # Reusable panel components
    ├── ComposedPanel.tsx
    ├── SimplePanelBuilder.tsx
    └── FloatingPanelsManager.tsx
```

**Pros:**
- ✅ Single source of truth for panels
- ✅ Easy to find any panel
- ✅ Clear categories
- ✅ Better for IDE navigation

**Cons:**
- Large migration effort
- Need to update imports across codebase
- May feel "too centralized" for some features

---

### Option C: Hybrid (Recommended)

Keep domain-specific panels with their features, but centralize generic/shared panels:

```
components/panels/                   # Generic & shared panels
├── shared/
│   ├── ComposedPanel.tsx
│   ├── SimplePanelBuilder.tsx
│   └── FloatingPanelsManager.tsx
├── dev/                             # All dev panels (centralize)
│   ├── AppMapPanel.tsx
│   ├── DevToolsPanel.tsx
│   └── ...
└── tools/                           # Utility panels (centralize)
    ├── ExportImportPanel.tsx
    ├── ValidationPanel.tsx
    └── SettingsPanel.tsx

components/game/panels/              # Game panels stay with game
components/scene/panels/             # Scene panels stay with scene
components/gallery/panels/           # Gallery panels stay with gallery
```

**Pros:**
- ✅ Domain panels stay with domain logic
- ✅ Dev/utility panels centralized (easier to find)
- ✅ Shared panels clearly marked
- ✅ Smaller migration effort

**Cons:**
- Still requires some reorganization
- Need clear conventions

---

## Action Items

### Immediate (Quick Wins)

1. **Clean up legacy**
   - Delete or document `components/legacy/` panels
   - Remove `.bak` files

2. **Consolidate dev panels**
   - Move all dev panels to `components/panels/dev/`
   - Update imports

3. **Document panel locations**
   - Add README.md to each panel directory
   - Explain what goes where

### Short-Term

4. **Establish conventions**
   - Domain panels → `components/{domain}/panels/`
   - Shared/generic → `components/panels/shared/`
   - Dev/tools → `components/panels/dev/` and `components/panels/tools/`

5. **Update panel registry**
   - Ensure all panels are registered in `lib/panels/panelRegistry.ts`
   - Verify PanelId types match actual panels

### Long-Term

6. **Gradual migration to Option C**
   - Move panels as they're touched
   - Update imports using `@/` path alias
   - Track progress with a migration checklist

---

## Migration Checklist (if pursuing Option C)

- [ ] Move dev panels (8 files) → `components/panels/dev/`
- [ ] Move tool/utility panels (6 files) → `components/panels/tools/`
- [ ] Move shared panels (3 files) → `components/panels/shared/`
- [ ] Consolidate scene panels → `components/scene/panels/`
- [ ] Organize game panels → `components/game/panels/`
- [ ] Update all imports to use `@/` paths
- [ ] Remove empty directories
- [ ] Update `panelRegistry.ts` paths
- [ ] Update documentation
- [ ] Test all panels load correctly

---

## Conclusion

The current panel organization is **highly scattered** with 56+ panels across 30+ directories. This makes maintenance difficult and creates confusion.

**Recommended Path:**
1. **Short-term:** Clean up legacy and consolidate dev panels
2. **Medium-term:** Adopt **Option C (Hybrid)** approach
3. **Long-term:** Document conventions and migrate gradually

**Priority:** MEDIUM - Not blocking, but impacts developer experience significantly

---

**Last Updated:** 2025-11-28
**Author:** Claude (Task 102 audit)
