# Next Session: QuickGenerateModule SmartDockview Migration

## Context

We created a reusable `SmartDockview` infrastructure and applied it to `AssetViewerPanel`. Now we need to migrate `QuickGenerateModule` to use the same pattern for consistency.

## What Was Built This Session

### 1. SmartDockview Infrastructure (`apps/main/src/lib/dockview/`)
- `LocalPanelRegistry.ts` - Type-safe, feature-scoped panel registry
- `SmartDockview.tsx` - Dockview wrapper with smart tab visibility
- `useSmartDockview.ts` - Hook for tab visibility (hides tabs when 1 panel, shows when 2+)
- `SmartDockview.module.css` - Minimal styling

### 2. AssetViewer Migration (`apps/main/src/components/media/viewer/`)
- `viewerPanelRegistry.ts` - Local registry with MediaPanel, QuickGeneratePanel, MetadataPanel
- `AssetViewerDockview.tsx` - Uses SmartDockview
- `panels/` - Individual panel components
- Integrated into `AssetViewerPanel.tsx` for side mode

## Task: Migrate QuickGenerateModule

### Current State
- **File**: `apps/main/src/features/controlCenter/components/QuickGenerateModule.tsx`
- Uses `DockviewReact` directly
- Has CSS hack to hide ALL tabs (`QuickGenerateModule.module.css`)
- Panels defined in `QuickGeneratePanels.tsx`
- Complex logic: operation-dependent layouts, asset queue integration

### Migration Goals
1. Create local panel registry for QuickGen panels
2. Replace direct dockview with SmartDockview
3. Remove CSS tab-hiding hack (SmartDockview handles this)
4. Potentially simplify/clean up panel context passing
5. Keep all existing functionality working

### Key Files to Review
```
apps/main/src/features/controlCenter/components/
├── QuickGenerateModule.tsx      # Main component - needs refactor
├── QuickGenerateModule.module.css # Remove tab-hiding CSS
├── QuickGeneratePanels.tsx      # Panel components - may need updates
└── hooks/
    └── useResizablePanels.ts    # May no longer be needed
```

### Current QuickGen Panels
1. **AssetPanel** - Shows queued assets, mousewheel navigation
2. **PromptPanel** - Text input for generation prompt
3. **SettingsPanel** - Generation settings (provider, params, go button)
4. **BlocksPanel** - Prompt companion/analysis tools

### Complexity Notes
- Layout changes based on `showAssetPanelInLayout` (operation type dependent)
- Panel context (`QuickGenPanelContext`) is complex with many props
- Layout persistence already exists (`LAYOUT_STORAGE_KEY`)
- Panels subscribe directly to stores for some data (queue state)

### Suggested Approach
1. Create `quickGenPanelRegistry.ts` following AssetViewer pattern
2. Update panel components to receive context via SmartDockview pattern
3. Create `QuickGenerateDockview.tsx` wrapper component
4. Update `QuickGenerateModule.tsx` to use new wrapper
5. Remove CSS tab-hiding from module.css
6. Test all operation types (image_to_video, video_extend, text_to_video, etc.)

### Architecture Decision (Option D - Hybrid)
- Features are self-contained workspace panels
- Each feature uses SmartDockview for internal sub-layout
- Smart tab visibility: tabs show only when 2+ panels grouped
- Users can resize panels, drag to regroup

## Related Files Changed This Session
- `apps/main/src/components/media/AssetViewerPanel.tsx`
- `apps/main/src/components/media/ViewerQuickGenerate.tsx` (added `alwaysExpanded` prop)
- `apps/main/src/features/assets/hooks/useAssetViewer.ts` (added `sourceGenerationId`)
- `pixsim7/backend/main/shared/schemas/asset_schemas.py` (added `source_generation_id`)

## How to Start Next Session
```
Hey Claude, let's continue the SmartDockview migration. We need to refactor
QuickGenerateModule to use the SmartDockview pattern we created.

Check docs/implementation/next-session-quickgen-refactor.md for context.

Key files:
- apps/main/src/lib/dockview/ (the pattern to follow)
- apps/main/src/components/media/viewer/ (example implementation)
- apps/main/src/features/controlCenter/components/QuickGenerateModule.tsx (to refactor)
```
