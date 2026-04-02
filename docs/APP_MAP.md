---
id: app-map
title: App Map & Architecture Index
featureIds:
  - app-map
  - devtools
visibility: internal
tags:
  - architecture
  - app-map
summary: Canonical map of PixSim7 features, routes, backend, and tooling.
---

# App Map & Architecture Index

**Last Updated:** 2025-01-05

This document provides a high-level map of PixSim7 features, linking frontend modules, backend APIs, documentation, and routes.

## Overview

The App Map serves as a single source of truth for navigating the codebase. Each feature entry below connects:
- **Docs**: Relevant documentation files
- **Frontend**: React feature modules and libraries
- **Backend**: Python API modules and services
- **Routes**: Frontend route paths

For detailed repository structure, see [docs/repo-map.md](./repo-map.md).

---

## Sources of Truth

### Canonical API (Recommended)

The **canonical source** for architecture data is the backend API:

| Endpoint | Description |
|----------|-------------|
| `GET /dev/architecture/map` | Backend architecture (routes, services, plugins) |
| `GET /dev/architecture/frontend` | Frontend features (from module metadata) |
| `GET /dev/architecture/unified` | **Combined backend + frontend** (recommended) |

Both the frontend App Map panel and Python launcher GUI should consume these endpoints.

### Offline Fallback (JSON Files)

When the backend is not running, the launcher falls back to JSON files:

1) **Generated registry**
   `docs/app_map.generated.json` - produced from module JSDoc `@appMap.*` tags
   (with `page.appMap` as deprecated fallback).

2) **Manual registry (deprecated)**
   `docs/app_map.sources.json` - being phased out in favor of JSDoc `@appMap.*` tags.

The generator lives in `packages/shared/app-map` and is invoked via `pnpm docs:app-map`
(which runs `packages/shared/app-map/src/cli.ts`).

### Code-Derived Metadata

When generating `app_map.generated.json`, use:

- **Module pages**: `apps/main/src/app/modules/types.ts`  
  `Module.page` fields such as `route`, `description`, `category`, `featureId`, and
  `featurePrimary` provide feature/route metadata. Use `@appMap.*` JSDoc tags on
  module declarations for docs/backend/frontend mapping.

- **Actions**: `packages/shared/types/src/actions.ts`  
  `ActionDefinition` (and module `page.actions`) provide action metadata.  
  Use `contexts` and `visibility` to opt actions into specific UI surfaces.

### Add a Feature to the App Map

**Preferred approach (JSDoc, canonical):**

1) Add `@appMap.*` tags to the module declaration:
   ```typescript
   // apps/main/src/features/myFeature/module.ts
   /**
    * @appMap.docs docs/my-feature.md
    * @appMap.backend pixsim7.backend.main.api.v1.my_feature
    * @appMap.frontend apps/main/src/features/myFeature/
    * @appMap.notes Optional implementation notes
    */
   export const myModule: Module = {
     id: 'my-feature',
     name: 'My Feature',
     page: {
       route: '/my-feature',
       featureId: 'my-feature',
     },
   };
   ```

2) Run `pnpm docs:app-map` to regenerate `app_map.generated.json`

**Fallback (deprecated):**

- `page.appMap` is still supported as a fallback but will be removed once migrations are complete.
- `docs/app_map.sources.json` is legacy-only and should be avoided for new features.

### Comment Conventions (JSDoc)

Use short JSDoc tags on module declarations. Comma-separate lists for `docs`,
`backend`, and `frontend`. Use `|` to split multiple notes if needed.

See `docs/APP_MAP_JSDOC.md` for the canonical format.

## Live App Map Registry

The table below is auto-generated from module JSDoc `@appMap.*` tags (with legacy registry fallback).
Run `pnpm codegen --only app-map` to refresh.

<!-- APP_MAP:START -->
| Feature | Routes | Docs | Frontend | Backend |
|---------|--------|------|----------|---------|
| Provider Accounts | - | `provider-accounts.md`, `provider-capabilities.md` | `features/providers/` | `api.v1.providers`, `api.v1.accounts`, `api.v1.accounts_credits`, `services.provider` |
| Panel System | - | `COMPONENTS.md` | `features/panels/` | - |
| HUD System | - | `HUD_LAYOUT_DESIGNER.md` | `features/hud/` | - |
| Narrative Engine | - | `ENGINE_SPECIFICATION.md`, `ENGINE_USAGE.md`, `RUNTIME.md` | `features/narrative/`, `packages/game/engine/src/narrative/` | `services.narrative` |
| Control Center | - | `CONTROL_CUBES.md` | `features/controlCenter/` | - |
| Gallery | - | - | `features/gallery/` | - |
| Intimacy System | - | - | `features/intimacy/` | - |
| Scene Management | - | - | `features/scene/` | `api.v1.game_scenes` |
| Settings | `/settings` | - | `features/settings/` | - |
| Gallery | `/assets` | - | `features/assets/` | `api.v1.assets`, `api.v1.assets_bulk`, `api.v1.assets_tags`, `api.v1.assets_versions`, `api.v1.assets_maintenance`, `services.asset` |
| Automation | `/automation` | `automation.md` | `features/automation/` | `api.v1.automation`, `api.v1.device_agents`, `services.automation` |
| NPC Brain Lab | `/npc-brain-lab`, `/game-2d`, `/game-world` | - | `features/brainTools/`, `features/simulation/`, `features/worldTools/` | - |
| Generation | `/generate` | `overview.md`, `GENERATION_GUIDE.md` | `features/generation/` | `api.v1.generations`, `services.generation` |
| Gizmo Lab | `/gizmo-lab` | `GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md` | `features/gizmos/`, `lib/game/gizmos/`, `packages/interaction/gizmos/` | - |
| Arc Graph Editor | `/arc-graph`, `/graph/:id` | `NPC_RESPONSE_GRAPH_DESIGN.md` | `features/graph/` | `api.v1.game_scenes`, `api.v1.character_graph` |
| Interaction Demo | `/interaction-demo` | - | `features/interactions/` | - |
| Interaction Studio | `/interaction-studio` | `INTERACTION_AUTHORING_GUIDE.md`, `INTERACTION_PLUGIN_MANIFEST.md` | `features/interactions/` | `api.v1.npc_interactions`, `api.v1.npc_state`, `domain.game.interactions` |
| NPCs | `/npc-portraits` | - | `features/npcs/` | - |
| Plugins | `/plugins` | `PLUGIN_SYSTEM.md`, `PLUGIN_DEVELOPER_GUIDE.md` | `features/plugins/` | `api.v1.plugins`, `infrastructure.plugins` |
| Routine Graph Editor | `/routine-graph` | `npc-architecture.md` | `features/routine-graph/` | `domain.game.behavior.routine_resolver`, `domain.game.schemas.behavior`, `api.v1.game_behavior` |
| Simulation Playground | `/simulation` | `simulation.md` | `features/simulation/` | `services.simulation` |
| Scene Builder | `/workspace` | `README.md` | `features/workspace/`, `lib/dockview/` | - |
<!-- APP_MAP:END -->

## Panel Registry

Auto-generated from `definePanel()` calls. Run `pnpm docs:app-map` to refresh.

<!-- PANEL_REGISTRY:START -->
| Panel | Category | Zone | Type | Available In | Flags | Description |
|-------|----------|------|------|-------------|-------|-------------|
| Community | community | - | - | - | - | Browse shared content, chat, and discover packages |
| Console | dev | - | - | - | - | Interactive command console for the pixsim namespace (Blender-style) |
| Context Hub | dev | - | - | - | - | Inspect active context providers and overrides |
| Dev Tools | dev | - | - | - | - | Developer tools and diagnostics |
| Character Creator | game | center | zone-panel | - | - | Create and manage reusable character definitions |
| Game | game | - | - | - | role:game-view | Core Game View (Game2D) embedded in the workspace. |
| Game Theming | game | - | - | - | - | Game theme and appearance customization |
| Game World | game | center | zone-panel | - | - | Configure locations and hotspots for 3D scenes |
| Interaction Studio | game | center | zone-panel | - | - | Design and prototype NPC interactions visually |
| NPC Portraits | game | center | zone-panel | - | - | Configure NPC expressions mapped to assets |
| Scene Plan | game | right | - | - | multi | Build a behavior-driven scene plan preview with canonical anchors, beats, and camera intent. |
| World Context | game | - | - | - | compact | Select active world and location for the editor context. |
| World Visual Roles | game | - | - | - | - | Bind gallery assets to world visual roles (portraits, POV, backgrounds) |
| Composition Roles | generation | - | - | - | - | Browse composition role definitions and tag mappings |
| Execution Presets | generation | right | - | - | multi | Manage reusable execution presets for fanout (Each) and future chain/sequential runs. |
| Gen Workflow Graph | generation | right | - | - | multi | Plan and run simple generation workflows using backend fanout and chain executors (POC). |
| Prompt Library | generation | - | - | - | - | Inspect content packs, prompt templates, and blocks with package-focused diagnostics. |
| Quick Generate | generation | - | - | asset-viewer | - | Quick generation panel that adapts to current context (asset or scene) |
| QuickGen Asset | generation | - | - | - | compact | Asset input panel for quick generation workflows |
| QuickGen Blocks | generation | - | - | - | - | Prompt companion blocks for quick generation |
| QuickGen History | generation | - | - | - | internal, compact | Asset history panel for quick generation workflows |
| QuickGen Prompt | generation | - | - | - | - | Prompt editor for quick generation workflows |
| QuickGen Settings | generation | - | - | - | - | Generation settings and Go button for quick workflows |
| Recent Assets | generation | - | - | - | internal, compact | Browse recently generated assets |
| Scene Prep | generation | right | - | - | multi | Prepare scene batches with cast bindings, guidance refs, candidate assets, and template-fanout launch. |
| Block Explorer | prompts | - | - | - | - | Browse and search prompt blocks from content packs |
| Block Matrix | prompts | - | - | - | multi | Explore prompt block coverage with 2D matrix views |
| Chain Builder | prompts | center | zone-panel | - | - | Build and execute multi-step generation chains (txt2img → refine → upscale) |
| Prompt Resolver Workbench | prompts | right | zone-panel | - | multi | Fixture-backed workbench for inspecting ResolutionRequest/Result/Trace and experimenting with next_v1 resolver behavior. |
| Template Builder | prompts | center | zone-panel | - | - | Create and manage block templates for random prompt composition |
| Edge Effects | scene | - | - | - | - | Inspect and edit edge effects for the active scene graph. |
| Scene Builder | scene | - | - | - | - | Build and edit individual scenes |
| Scene Management | scene | - | - | - | - | Unified scene workflow management |
| Control Center | system | left | dockview-container | - | internal | Control Center dock and generation modules |
| Health | system | - | - | - | compact | System health and validation |
| Provider Settings | system | - | - | - | - | API provider settings and configuration |
| Asset Sets | tools | left | - | - | - | Create and manage named asset collections (manual or smart/tag-based) for use with generation combination strategies. |
| Asset Tags | tools | - | - | - | - | Manage tags for selected assets |
| Automation | tools | center | zone-panel | - | - | Manage Android devices and automation loops |
| Game Tools | tools | - | - | - | - | Browse world tools, interactions, HUD widgets, and dev plugins |
| Gizmo Browser | tools | - | - | gizmo-lab | - | Browse and select gizmos from the registry |
| Gizmo Lab | tools | center | dockview-container | - | - | Gizmo testing laboratory |
| Gizmo Playground | tools | - | - | gizmo-lab | - | Interactive playground for the selected gizmo |
| HUD Designer | tools | - | - | - | - | Design HUD layouts using widget compositions |
| Info | tools | - | - | asset-viewer | - | Information panel that shows metadata for the current context |
| Interactive Surface | tools | - | - | - | - | Interactive overlay for mask creation, annotations, and image tagging |
| Mini Gallery | tools | - | - | - | multi, compact | Compact gallery panel for browsing and filtering assets |
| Model Inspector | tools | - | - | - | multi | View 3D models, animations, and configure contact zones |
| NPC Brain Lab | tools | - | - | - | - | NPC behavior testing and debugging |
| Surface Workbench | tools | - | - | - | - | Inspect available surfaces (HUD, overlay, gizmo) for the active context |
| Template Library | tools | left | - | - | - | Browse and manage templates and runtime entities via the generic CRUD API. Create, edit, and delete location templates, item templates, NPCs, scenes, and more. |
| Tool Browser | tools | - | - | gizmo-lab | - | Browse and select interactive tools from the registry |
| Tool Playground | tools | - | - | gizmo-lab | - | Interactive playground for the selected tool |
| Panel Browser | utilities | - | - | workspace, control-center | - | Browse all available panels and launch them docked or floating |
| Settings | utilities | - | - | - | - | Application settings and preferences |
| Shortcuts | utilities | - | - | workspace, control-center | compact | Quick navigation shortcuts to common areas |
| Arc Graph | workspace | center | zone-panel | - | - | Manage story arcs, quests, and narrative flow |
| Asset Viewer | workspace | center | dockview-container | - | internal | Asset viewer with docked sub-panels |
| Gallery | workspace | center | zone-panel | - | - | Browse and manage project assets |
| Generations | workspace | - | - | - | - | Track and manage generation jobs |
| Graph | workspace | center | zone-panel | - | role:flow-view | Visual node-based editor |
| Inspector | workspace | - | - | - | - | Inspect and edit node properties |
| Media Preview | workspace | - | - | asset-viewer | multi | Lightweight media preview panel for selected assets |
| Project | workspace | left | - | - | - | Project-level save/load for world bundles and authoring extensions. |
| Routine Graph | workspace | center | zone-panel | - | - | Design NPC daily routines and schedules |
<!-- PANEL_REGISTRY:END -->

## Modules

Auto-generated from `features/*/module.ts`. Shows all modules including infrastructure (non-route).

<!-- MODULES:START -->
| Module | Priority | Dependencies | Lifecycle | Route | CC Panels |
|--------|----------|-------------|-----------|-------|-----------|
| Context Hub | 80 | - | ready | - | - |
| Graph System Module | 75 | plugin-bootstrap | - | - | - |
| Routine Graph Module | 70 | graph-system, plugin-bootstrap | - | - | - |
| Cubes Module | 60 | - | - | - | - |
| Gizmos | 60 | - | - | - | - |
| Interactions | 60 | - | - | - | - |
| Automation | - | - | - | `/automation` | - |
| Control Center Module | 50 | - | - | - | 3 |
| DevTools Module | - | - | - | - | - |
| Gallery | - | - | - | `/assets` | - |
| Gallery Module | - | - | init, ready | - | 1 |
| Game World | - | - | - | `/game-world` | - |
| Generation Module | - | - | - | - | - |
| NPCs | - | - | - | `/npc-portraits` | - |
| Plugins Module | - | - | - | - | 1 |
| Scene Builder | - | - | - | `/workspace` | 1 |
<!-- MODULES:END -->

## Store Inventory

Auto-generated by scanning Zustand stores across features.

<!-- STORES:START -->
| Store | Feature | Source |
|-------|---------|--------|
| `useAppearanceStore` | appearance | `features/appearance/stores/appearanceStore.ts` |
| `useAssetDetailStore` | assets | `features/assets/stores/assetDetailStore.ts` |
| `useAssetPickerStore` | assets | `features/assets/stores/assetPickerStore.ts` |
| `useAssetSelectionStore` | assets | `features/assets/stores/assetSelectionStore.ts` |
| `useAssetSetStore` | assets | `features/assets/stores/assetSetStore.ts` |
| `useAssetSettingsStore` | assets | `features/assets/stores/assetSettingsStore.ts` |
| `useAssetViewerStore` | assets | `features/assets/stores/assetViewerStore.ts` |
| `useCollapsedGroupsStore` | assets | `features/assets/stores/collapsedGroupsStore.ts` |
| `useDeleteModalStore` | assets | `features/assets/stores/deleteModalStore.ts` |
| `useFilterPresetStore` | assets | `features/assets/stores/filterPresetStore.ts` |
| `useGalleryApplyTargetStore` | assets | `features/assets/stores/galleryApplyTargetStore.ts` |
| `useLocalFolderSettingsStore` | assets | `features/assets/stores/localFolderSettingsStore.ts` |
| `useMediaSettingsStore` | assets | `features/assets/stores/mediaSettingsStore.ts` |
| `usePinnedFiltersStore` | assets | `features/assets/stores/pinnedFiltersStore.ts` |
| `useQuickTagStore` | assets | `features/assets/lib/quickTagStore.ts` |
| `useRelatedAssetsStore` | assets | `features/assets/stores/relatedAssetsStore.ts` |
| `useUploadProviderStore` | assets | `features/assets/stores/uploadProviderStore.ts` |
| `useChainStore` | chains | `features/chains/stores/chainStore.ts` |
| `useComponentSettingsStore` | componentSettings | `features/componentSettings/stores/componentSettingsStore.ts` |
| `useContextHubOverridesStore` | contextHub | `features/contextHub/stores/contextHubOverridesStore.ts` |
| `useContextHubSettingsStore` | contextHub | `features/contextHub/stores/contextHubSettingsStore.ts` |
| `useControlCenterStore` | controlCenter | `features/controlCenter/stores/controlCenterStore.ts` |
| `useCubeSettingsStore` | cubes | `features/cubes/stores/cubeSettingsStore.ts` |
| `useFanoutPresetStore` | generation | `features/generation/stores/fanoutPresetStore.ts` |
| `useGenerationHistoryStore` | generation | `features/generation/stores/generationHistoryStore.ts` |
| `useGenerationPresetStore` | generation | `features/generation/stores/generationPresetStore.ts` |
| `useGenerationsStore` | generation | `features/generation/stores/generationsStore.ts` |
| `useGizmoLabStore` | gizmos | `features/gizmos/stores/gizmoLabStore.ts` |
| `useGizmoSurfaceStore` | gizmos | `features/gizmos/stores/gizmoSurfaceStore.ts` |
| `useInteractionStatsStore` | gizmos | `features/gizmos/stores/interactionStatsStore.ts` |
| `useSurfaceDimensionStore` | gizmos | `features/gizmos/stores/surfaceDimensionStore.ts` |
| `useToolConfigStore` | gizmos | `features/gizmos/stores/toolConfigStore.ts` |
| `useToolConsoleStore` | gizmos | `features/gizmos/lib/core/console.ts` |
| `useArcGraphStore` | graph | `features/graph/stores/arcGraphStore/index.ts` |
| `useGraphStore` | graph | `features/graph/stores/graphStore/index.ts` |
| `useSelectionStore` | graph | `features/graph/stores/selectionStore.ts` |
| `useTemplateAnalyticsStore` | graph | `features/graph/stores/templateAnalyticsStore.ts` |
| `useTemplateStore` | graph | `features/graph/stores/templatesStore.ts` |
| `useHudLayoutStore` | hud | `features/hud/stores/hudLayoutStore.ts` |
| `useAssetViewerOverlayStore` | mediaViewer | `features/mediaViewer/stores/assetViewerOverlayStore.ts` |
| `usePanelConfigStore` | panels | `features/panels/stores/panelConfigStore.ts` |
| `usePanelInstanceSettingsStore` | panels | `features/panels/stores/panelInstanceSettingsStore.ts` |
| `usePoseBoardStore` | poseBoard | `features/poseBoard/stores/poseBoardStore.ts` |
| `useBlockTemplateStore` | prompts | `features/prompts/stores/blockTemplateStore.ts` |
| `usePromptSettingsStore` | prompts | `features/prompts/stores/promptSettingsStore.ts` |
| `useModelBadgeStore` | providers | `features/providers/stores/modelBadgeStore.ts` |
| `useRoutineGraphSelectionStore` | routine-graph | `features/routine-graph/stores/selectionStore.ts` |
| `useRoutineGraphStore` | routine-graph | `features/routine-graph/stores/routineGraphStore.ts` |
| `useProjectIndexStore` | scene | `features/scene/stores/projectIndexStore.ts` |
| `useProjectSessionStore` | scene | `features/scene/stores/projectSessionStore.ts` |
| `useWorldContextStore` | scene | `features/scene/stores/worldContextStore.ts` |
| `useModel3DStore` | scene3d | `features/scene3d/stores/model3DStore.ts` |
| `usePanelInteractionSettingsStore` | settings | `features/settings/stores/panelInteractionSettingsStore.ts` |
| `usePanelSettingsUiStore` | settings | `features/settings/stores/panelSettingsUiStore.ts` |
| `useSettingsUiStore` | settings | `features/settings/stores/settingsUiStore.ts` |
| `useContextMenuHistoryStore` | workspace | `features/workspace/stores/contextMenuHistoryStore.ts` |
<!-- STORES:END -->

## Hook Index

Auto-generated by scanning exported hooks across features.

<!-- HOOKS:START -->
| Hook | Feature | Source |
|------|---------|--------|
| `useAccentButtonClasses` | appearance | `features/appearance/useAccentButtonClasses.ts` |
| `useApplyAppearance` | appearance | `features/appearance/useApplyAppearance.ts` |
| `useAsset` | assets | `features/assets/hooks/useAsset.ts` |
| `useAssetContextMenu` | assets | `features/assets/lib/assetContextResolver.ts` |
| `useAssets` | assets | `features/assets/hooks/useAssets.ts` |
| `useAssetsController` | assets | `features/assets/hooks/useAssetsController.ts` |
| `useAssetViewer` | assets | `features/assets/hooks/useAssetViewer.ts` |
| `useCloudSourceController` | assets | `features/assets/context/SourceControllerContext.tsx` |
| `useFavoriteToggle` | assets | `features/assets/hooks/useFavoriteToggle.ts` |
| `useFilterMetadata` | assets | `features/assets/hooks/useFilterMetadata.ts` |
| `useFolderSourceController` | assets | `features/assets/context/SourceControllerContext.tsx` |
| `useGalleryAssetPicker` | assets | `features/assets/components/pickers/useGalleryAssetPicker.ts` |
| `useImportSourceController` | assets | `features/assets/context/SourceControllerContext.tsx` |
| `useInfiniteScroll` | assets | `features/assets/components/shared/LoadMoreSection.tsx` |
| `useLinkedCardAssetAdapter` | assets | `features/assets/lib/useLinkedCardAssetAdapter.ts` |
| `useLocalAssetPreview` | assets | `features/assets/hooks/useLocalAssetPreview.ts` |
| `useLocalFolderCallbacks` | assets | `features/assets/components/localFolders/useLocalFolderCallbacks.ts` |
| `useLocalFolderCardAssetAdapter` | assets | `features/assets/components/localFolders/useLocalFolderCardAssetAdapter.ts` |
| `useLocalFolders` | assets | `features/assets/stores/localFoldersStore.ts` |
| `useLocalFoldersController` | assets | `features/assets/hooks/useLocalFoldersController.ts` |
| `useRegisterAssetContext` | assets | `features/assets/lib/assetContextResolver.ts` |
| `useSourceController` | assets | `features/assets/context/SourceControllerContext.tsx` |
| `useSourceControllerOptional` | assets | `features/assets/context/SourceControllerContext.tsx` |
| `useSourceControllerType` | assets | `features/assets/context/SourceControllerContext.tsx` |
| `useTagAutocomplete` | assets | `features/assets/lib/useTagAutocomplete.ts` |
| `useViewerScopeSync` | assets | `features/assets/hooks/useAssetViewer.ts` |
| `useAuthoringContext` | contextHub | `features/contextHub/hooks/useAuthoringContext.ts` |
| `useCapability` | contextHub | `features/contextHub/hooks/useCapability.ts` |
| `useCapabilityAll` | contextHub | `features/contextHub/hooks/useCapability.ts` |
| `useContextHubHostId` | contextHub | `features/contextHub/hooks/contextHubContext.ts` |
| `useContextHubState` | contextHub | `features/contextHub/hooks/contextHubContext.ts` |
| `usePanelContext` | contextHub | `features/contextHub/hooks/useCapability.ts` |
| `useProjectContext` | contextHub | `features/contextHub/hooks/useProjectContext.ts` |
| `useProvideCapability` | contextHub | `features/contextHub/hooks/useCapability.ts` |
| `useRequiredAuthoringWorld` | contextHub | `features/contextHub/hooks/useRequiredAuthoringWorld.ts` |
| `useUnifiedCapabilities` | contextHub | `features/contextHub/hooks/useUnifiedCapabilities.ts` |
| `useUnifiedCapability` | contextHub | `features/contextHub/hooks/useUnifiedCapabilities.ts` |
| `useControlCenterLayout` | controlCenter | `features/controlCenter/hooks/useControlCenterLayout.ts` |
| `useDockBehavior` | controlCenter | `features/controlCenter/components/hooks/useDockBehavior.ts` |
| `useResizablePanels` | controlCenter | `features/controlCenter/components/hooks/useResizablePanels.ts` |
| `useCubeAssetBinding` | cubes | `features/cubes/integration/contextHub.ts` |
| `useCubeContext` | cubes | `features/cubes/integration/contextHub.ts` |
| `useClientFilterPersistence` | gallery | `features/gallery/lib/useClientFilterPersistence.ts` |
| `useClientFilters` | gallery | `features/gallery/lib/useClientFilters.ts` |
| `useFilterChipState` | gallery | `features/gallery/lib/useFilterChipState.ts` |
| `useGallerySurfaceController` | gallery | `features/gallery/hooks/useGallerySurfaceController.ts` |
| `usePagedItems` | gallery | `features/gallery/lib/usePagedItems.ts` |
| `useScrollToTopOnChange` | gallery | `features/gallery/lib/useScrollToTopOnChange.ts` |
| `useAssetPanelState` | generation | `features/generation/components/useAssetPanelState.tsx` |
| `useBatchCancelGenerations` | generation | `features/generation/hooks/useBatchCancelGenerations.ts` |
| `useClickOutside` | generation | `features/generation/components/generationSettingsPanel/constants.ts` |
| `useGenerationDevController` | generation | `features/generation/hooks/useGenerationDevController.ts` |
| `useGenerationPresets` | generation | `features/generation/hooks/useGenerationPresets.ts` |
| `useGenerationScopeStores` | generation | `features/generation/hooks/useGenerationScope.tsx` |
| `useGenerationStatus` | generation | `features/generation/hooks/useGenerationStatus.ts` |
| `useGenerationWebSocket` | generation | `features/generation/hooks/useGenerationWebSocket.ts` |
| `useGenerationWorkbench` | generation | `features/generation/hooks/useGenerationWorkbench.ts` |
| `useHistoryGalleryItems` | generation | `features/generation/hooks/useHistoryGalleryItems.ts` |
| `useMediaCardGenerationStatus` | generation | `features/generation/hooks/useMediaCardGenerationStatus.ts` |
| `useMediaCardGenerationStatusBatch` | generation | `features/generation/hooks/useMediaCardGenerationStatus.ts` |
| `useMediaGenerationActions` | generation | `features/generation/hooks/useMediaGenerationActions.ts` |
| `usePersistedScopeState` | generation | `features/generation/hooks/usePersistedScopeState.ts` |
| `useProvideGenerationWidget` | generation | `features/generation/hooks/useProvideGenerationWidget.ts` |
| `useQuickGenerateController` | generation | `features/generation/hooks/useQuickGenerateController.ts` |
| `useQuickGenPanelLayout` | generation | `features/generation/hooks/useQuickGenPanelLayout.ts` |
| `useQuickGenScopeSync` | generation | `features/generation/hooks/useQuickGenScopeSync.ts` |
| `useRecentGenerations` | generation | `features/generation/hooks/useRecentGenerations.ts` |
| `useAllToolsWithOverrides` | gizmos | `features/gizmos/hooks/useToolWithOverrides.ts` |
| `useEnabledGizmoSurfaces` | gizmos | `features/gizmos/hooks/gizmoSurfaceHooks.ts` |
| `useIsSurfaceEnabled` | gizmos | `features/gizmos/hooks/gizmoSurfaceHooks.ts` |
| `useSelectedGizmo` | gizmos | `features/gizmos/stores/gizmoLabStore.ts` |
| `useSelectedTool` | gizmos | `features/gizmos/stores/gizmoLabStore.ts` |
| `useToggleSurface` | gizmos | `features/gizmos/hooks/gizmoSurfaceHooks.ts` |
| `useToolHasOverrides` | gizmos | `features/gizmos/hooks/useToolWithOverrides.ts` |
| `useToolInstanceWithOverrides` | gizmos | `features/gizmos/hooks/useToolWithOverrides.ts` |
| `useToolWithOverrides` | gizmos | `features/gizmos/hooks/useToolWithOverrides.ts` |
| `useArcGraphStoreCanRedo` | graph | `features/graph/stores/arcGraphStore/index.ts` |
| `useArcGraphStoreCanUndo` | graph | `features/graph/stores/arcGraphStore/index.ts` |
| `useArcGraphStoreRedo` | graph | `features/graph/stores/arcGraphStore/index.ts` |
| `useArcGraphStoreUndo` | graph | `features/graph/stores/arcGraphStore/index.ts` |
| `useGraphCanvasAdapter` | graph | `features/graph/hooks/useGraphCanvasAdapter.ts` |
| `useGraphCapabilityBridge` | graph | `features/graph/lib/capabilities/useGraphCapabilityBridge.ts` |
| `useGraphStoreCanRedo` | graph | `features/graph/stores/graphStore/index.ts` |
| `useGraphStoreCanUndo` | graph | `features/graph/stores/graphStore/index.ts` |
| `useGraphStoreRedo` | graph | `features/graph/stores/graphStore/index.ts` |
| `useGraphStoreUndo` | graph | `features/graph/stores/graphStore/index.ts` |
| `useLineageGraph` | graph | `features/graph/hooks/useLineageGraph.ts` |
| `useNodeValidation` | graph | `features/graph/hooks/useSceneValidation.ts` |
| `useSceneGraphPanelHandlers` | graph | `features/graph/components/scene-graph-v2/useSceneGraphPanelHandlers.ts` |
| `useSceneValidation` | graph | `features/graph/hooks/useSceneValidation.ts` |
| `useValidationContext` | graph | `features/graph/hooks/useValidationContext.ts` |
| `useValidationContextOptional` | graph | `features/graph/hooks/useValidationContext.ts` |
| `useActivePanelInZone` | panels | `features/panels/hooks/usePanelManager.ts` |
| `useInitializePanelSystem` | panels | `features/panels/hooks/usePanelSystemInitialization.ts` |
| `useOpenPanels` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanel` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanelGroup` | panels | `features/panels/hooks/usePanelGroups.ts` |
| `usePanelGroups` | panels | `features/panels/hooks/usePanelGroups.ts` |
| `usePanelGroupsByCategory` | panels | `features/panels/hooks/usePanelGroups.ts` |
| `usePanelIdentity` | panels | `features/panels/hooks/usePanelState.ts` |
| `usePanelIs` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanelManagerActions` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanelManagerEvents` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanelManagerInstance` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanelManagerState` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanelPersistedState` | panels | `features/panels/hooks/usePanelState.ts` |
| `usePanelRegistryActions` | panels | `features/panels/lib/actions.ts` |
| `usePanelSettingsHelpers` | panels | `features/panels/lib/panelSettingsHelpers.ts` |
| `usePanelsInZone` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanelState` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePanelStateObject` | panels | `features/panels/hooks/usePanelState.ts` |
| `usePanelSystemInitialization` | panels | `features/panels/hooks/usePanelSystemInitialization.ts` |
| `useProjectAvailability` | panels | `features/panels/components/tools/useProjectAvailability.ts` |
| `useProjectInventory` | panels | `features/panels/components/tools/useProjectInventory.ts` |
| `useResolveAllComponentSettings` | panels | `features/panels/lib/instanceSettingsResolver.ts` |
| `useResolveComponentSettings` | panels | `features/panels/lib/instanceSettingsResolver.ts` |
| `useResolvedPanelAsset` | panels | `features/panels/hooks/useResolvedPanelAsset.ts` |
| `useResolvedPanelScene` | panels | `features/panels/hooks/useResolvedPanelScene.ts` |
| `useResolvedRuntimeSource` | panels | `features/panels/hooks/useResolvedRuntimeSource.ts` |
| `useResolvePanelSettings` | panels | `features/panels/lib/instanceSettingsResolver.ts` |
| `useScopeInstanceId` | panels | `features/panels/components/scope/scopeInstanceContext.ts` |
| `useVocabResolver` | panels | `features/panels/domain/definitions/block-explorer/useVocabResolver.ts` |
| `useZoneActions` | panels | `features/panels/hooks/usePanelManager.ts` |
| `useZoneState` | panels | `features/panels/hooks/usePanelManager.ts` |
| `usePreviewScopeStores` | preview | `features/preview/hooks/usePreviewScope.tsx` |
| `usePromptAiEdit` | prompts | `features/prompts/hooks/usePromptAiEdit.ts` |
| `usePromptHistory` | prompts | `features/prompts/hooks/usePromptHistory.ts` |
| `usePromptInspection` | prompts | `features/prompts/hooks/usePromptInspection.ts` |
| `useQuickGenerateBindings` | prompts | `features/prompts/hooks/useQuickGenerateBindings.ts` |
| `useSemanticActionBlocks` | prompts | `features/prompts/hooks/useSemanticActionBlocks.ts` |
| `useShadowAnalysis` | prompts | `features/prompts/hooks/useShadowAnalysis.ts` |
| `useAiProviders` | providers | `features/providers/hooks/useAiProviders.ts` |
| `useAspectRatios` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useCostEstimate` | providers | `features/providers/hooks/useCostEstimate.ts` |
| `useCostHints` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useGenerationPlugins` | providers | `features/providers/hooks/useGenerationPlugins.tsx` |
| `useOperationSpec` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `usePluginValidation` | providers | `features/providers/hooks/useGenerationPlugins.tsx` |
| `usePromptLimit` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useProviderAccounts` | providers | `features/providers/hooks/useProviderAccounts.ts` |
| `useProviderCapabilities` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useProviderCapability` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useProviderCapacity` | providers | `features/providers/hooks/useProviderAccounts.ts` |
| `useProviderFeature` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useProviderIdForModel` | providers | `features/providers/hooks/useProviderIdForModel.ts` |
| `useProviderLimits` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useProviders` | providers | `features/providers/hooks/useProviders.ts` |
| `useProviderSpecs` | providers | `features/providers/hooks/useProviderSpecs.ts` |
| `useQualityPresets` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useRenderPlugins` | providers | `features/providers/hooks/useGenerationPlugins.tsx` |
| `useSupportedOperations` | providers | `features/providers/hooks/useProviderCapabilities.ts` |
| `useUnlimitedModels` | providers | `features/providers/hooks/useUnlimitedModels.ts` |
| `useRoutineGraphRedo` | routine-graph | `features/routine-graph/stores/routineGraphStore.ts` |
| `useRoutineGraphUndo` | routine-graph | `features/routine-graph/stores/routineGraphStore.ts` |
| `useAppearanceSettingsAdapter` | settings | `features/settings/lib/schemas/appearance.adapter.ts` |
| `useInteractionOverride` | settings | `features/settings/stores/panelInteractionSettingsStore.ts` |
| `usePanelSettings` | settings | `features/settings/stores/panelInteractionSettingsStore.ts` |
| `useSimulationRuns` | simulation | `features/simulation/components/useSimulationRuns.ts` |
| `useSimulationScenarios` | simulation | `features/simulation/components/useSimulationScenarios.ts` |
| `useSimulationTime` | simulation | `features/simulation/components/useSimulationTime.ts` |
| `useAppDockviewIntegration` | workspace | `features/workspace/hooks/useAppDockviewIntegration.ts` |
| `useDockPlacementExclusions` | workspace | `features/workspace/hooks/useFloatingPanelPlacement.ts` |
| `useDockviewDockedPanelDefinitionIds` | workspace | `features/workspace/hooks/useFloatingPanelPlacement.ts` |
| `useFloatingExcludedPanelIds` | workspace | `features/workspace/hooks/useFloatingPanelPlacement.ts` |
| `useFloatingPanelDefinitionIds` | workspace | `features/workspace/hooks/useFloatingPanelPlacement.ts` |
| `useFloatingPanelDefinitionIdSet` | workspace | `features/workspace/hooks/useFloatingPanelPlacement.ts` |
| `usePanelPlacementDiagnostics` | workspace | `features/workspace/hooks/useFloatingPanelPlacement.ts` |
| `usePanelPlacements` | workspace | `features/workspace/hooks/useFloatingPanelPlacement.ts` |
| `useWorkspacePresets` | workspace | `features/workspace/hooks/useWorkspacePresets.ts` |
<!-- HOOKS:END -->

---

## How to Use This Map

1. **Find a feature**: Look up the feature in the table above
2. **Navigate to code**: Use the Frontend/Backend columns to find source files
3. **Read documentation**: Follow doc links for detailed guides
4. **Test in browser**: Visit the route path in the running app

## Maintaining This Document

- **Registry**: Prefer JSDoc `@appMap.*` tags in feature modules; use `docs/app_map.sources.json` only as legacy fallback
- **Regenerate**: Run `pnpm docs:app-map` to update the table
- **Validate**: Run `pnpm docs:app-map:check` to verify outputs are current

---

## Related Documentation

- [Repository Map](./repo-map.md) - Detailed codebase structure
- [Architecture Overview](./architecture/) - System design documents
- [Development Guide](../DEVELOPMENT_GUIDE.md) - Setup and workflow
- [API Endpoints](./api/ENDPOINTS.md) - Generated API reference (run `pnpm docs:openapi`)
