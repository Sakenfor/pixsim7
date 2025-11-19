# UI Codebase Structure - Comprehensive Analysis

## Executive Summary
The pixsim7 codebase contains **multiple separate UI systems** across different packages and applications:
- **packages/ui**: Core reusable UI component library (React/TypeScript)
- **packages/game-ui**: Game-specific UI components  
- **frontend**: Large React-based admin/editor interface (134 components across 30 directories)
- **game-frontend**: Svelte-based game client (minimal components)
- **launcher/web**: Svelte-based launcher application

Key findings:
1. **Toast component duplication** - different implementations in packages/ui and frontend
2. **Large monolithic frontend** - 134 components with many panel/editor components
3. **Multiple technology stacks** - React (frontend, packages/ui, packages/game-ui) + Svelte (game-frontend, launcher)
4. **Potential refactoring in progress** - ExecutionList.tsx vs ExecutionList_new.tsx

---

## Detailed Structure

### 1. Core UI Package (packages/ui/src)
**Purpose**: Reusable, generic UI components
**Technology**: React + TypeScript
**Total Size**: ~1,400 lines across 16 component files

**Components**:
- Badge.tsx (27 lines)
- Button.tsx (37 lines)
- Dropdown.tsx (166 lines)
- FormField.tsx (116 lines)
- Input.tsx (51 lines)
- Modal.tsx (226 lines)
- Panel.tsx (21 lines)
- ProgressBar.tsx (79 lines)
- PromptInput.tsx (67 lines)
- Select.tsx (59 lines)
- StatusBadge.tsx (27 lines)
- Table.tsx (142 lines)
- Tabs.tsx (120 lines)
- ThemeToggle.tsx (12 lines)
- Toast.tsx (64 lines)
- Tooltip.tsx (186 lines)
- useToast.ts (custom hook)
- useTheme.ts (custom hook)

**Key Features**:
- Exports all components via index.ts
- Uses clsx for conditional styling
- Uses Zustand for state management (useToast hook)
- Peer dependencies on React >=18
- Includes CubeTooltip as legacy export alias for Tooltip

---

### 2. Game UI Package (packages/game-ui/src)
**Purpose**: Game-specific UI components
**Technology**: React + TypeScript
**Dependencies**: @pixsim7/ui, @pixsim7/game-core, @pixsim7/scene-gizmos, @pixsim7/types

**Components**:
- ScenePlayer.tsx
- MiniGameHost.tsx
- minigames/ReflexMiniGame.tsx
- minigames/registry.ts

**Status**: Very minimal - only 4 component files

---

### 3. Main Frontend (frontend/src)
**Purpose**: Admin/editor interface for game development
**Technology**: React + TypeScript + Vite
**Total Components**: 134 files across 30 directories
**Dependencies**: 
- @pixsim7/ui
- @pixsim7/game-ui
- @pixsim7/game-core
- @pixsim7/semantic-shapes
- @pixsim7/scene-gizmos
- pixcubes
- Tailwind CSS

**Directory Structure**:
```
frontend/src/components/
├── assets/              (4 files) - Media/gallery handling
├── automation/          (13 files) - Automation system UI
├── brain/              (1 file) - Brain tools
├── capabilities/       (6 files) - Capability browser/editor
├── common/             (3 files) - Shared components
│   ├── ErrorBoundary.tsx
│   ├── Toast.tsx
│   └── ToastContainer.tsx
├── control/            (27 files) - Control center/cube system
├── dev/                (1 file) - Dev tools
├── examples/           (1 file) - Examples
├── filters/            (1 file) - Filter UI
├── gallery/            (1 file) - Gallery tools
├── game/               (14 files) - Game-specific UI
├── gizmos/             (6 files) - Visual gizmos
├── graph/              (11 files) - Graph rendering
├── health/             (1 file) - Health monitoring
├── inspector/          (16 files) - Node editors
├── layout/             (2 files) - Layout management
├── media/              (1 file) - Media handling
├── minigames/          (5 files) - Minigame UI
├── navigation/         (1 file) - Navigation
├── nodes/              (8 files) - Graph node components
├── panels/             (1 file) - Panel library
├── plugins/            (5 files) - Plugin system UI
├── provider/           (1 file) - Provider settings
├── settings/           (1 file) - Settings
├── shapes/             (2 files) - Shape rendering
├── simulation/         (3 files) - Simulation UI
├── validation/         (1 file) - Validation UI
└── Root level:         (14 files) - Top-level panels
```

**Root Component Files**:
- ArcGraphPanel.tsx
- EdgeEffectsEditor.tsx
- GraphPanel.tsx
- HotspotEditor.tsx
- NpcPreferencesEditor.tsx
- NpcSlotEditor.tsx
- PluginCatalogPanel.tsx
- PluginConfigPanel.tsx
- PluginManager.tsx
- PluginOverlays.tsx
- SceneBuilderPanel.tsx
- SceneMetadataEditor.tsx
- SessionStateViewer.tsx
- WorldContextSelector.tsx

**CSS Files**:
- index.css - Tailwind + custom Mosaic theme styling
- App.css
- Various component-specific CSS files in gizmos/

---

### 4. Game Frontend (game-frontend/src)
**Purpose**: Svelte-based game client
**Technology**: Svelte
**Minimal structure**: Only 1 component file
- Game3DView.tsx
- Mostly Svelte components in game content

---

### 5. Launcher (launcher/web/src)
**Purpose**: Svelte-based service launcher
**Technology**: Svelte
**Components**:
- LogViewer.svelte - Display and filter logs
- ServiceCard.svelte - Display service status/controls

**Supporting Files**:
- lib/api/client.js - API client
- lib/stores/services.js - Service store
- lib/stores/websocket.js - WebSocket handling
- routes/ - SvelteKit routing

---

## Component Patterns and Statistics

### Panel Components (26 total)
Scattered across different directories:
- Root level: ArcGraphPanel, GraphPanel, PluginCatalogPanel, PluginConfigPanel, SceneBuilderPanel
- assets/: LocalFoldersPanel
- brain/: BrainToolsPanel
- control/: CubeSettingsPanel, PanelLauncherModule
- dev/: AppMapPanel
- gallery/: GalleryToolsPanel
- game/: HudCustomizationPanel, InteractionPresetUsagePanel, InventoryPanel, UserPreferencesPanel, WorldToolsPanel
- health/: HealthPanel
- inspector/: InspectorPanel
- layout/: FloatingPanelsManager (panel management)
- panels/: SceneLibraryPanel
- provider/: ProviderSettingsPanel
- settings/: SettingsPanel
- validation/: ValidationPanel

**Consolidation Opportunity**: Consider whether these should use a common Panel wrapper or base component.

### Editor Components (23 total)
- Root level: EdgeEffectsEditor, HotspotEditor, NpcPreferencesEditor, NpcSlotEditor, SceneMetadataEditor
- automation/: ActionParamsEditor
- capabilities/: CapabilityReferenceEditor
- control/: PanelActionEditor
- game/: HudLayoutEditor, InteractionPresetEditor, WorldThemeEditor
- inspector/: ChoiceNodeEditor, ConditionNodeEditor, EndNodeEditor, GenerationNodeEditor, MiniGameNodeEditor, NpcResponseNodeEditor, QuestTriggerEditor, ReturnNodeEditor, SceneCallNodeEditor, SeductionNodeEditor, VideoNodeEditor, useNodeEditor.ts

**Pattern**: Many inspector editors appear to share common patterns - could benefit from a base editor component.

### List Components (5 total)
- automation/: DeviceList, ExecutionList, ExecutionList_new, LoopList, PresetList

**Duplication Alert**: ExecutionList.tsx and ExecutionList_new.tsx are nearly identical (~282 vs 268 lines) - appears to be refactoring in progress.

---

## CRITICAL DUPLICATION FINDINGS

### 1. Toast Component Duplication [HIGH PRIORITY]
**Location 1**: `/packages/ui/src/Toast.tsx` (64 lines)
- Simple interface: id, message, type, duration, onClose
- Auto-dismiss via useEffect
- Basic styling with Tailwind

**Location 2**: `/frontend/src/components/common/Toast.tsx` (94 lines)
- More feature-rich: supports title, icon, cube-message type
- Uses toastStore (Zustand) for state management
- Enhanced styling with animations and exit states
- Imports custom Toast type from toastStore

**Status**: Frontend version is MORE ADVANCED and uses a different API (store-based vs callback-based)

**Consolidation Path**: Potentially merge into a single, enhanced Toast component in @pixsim7/ui

### 2. ExecutionList Duplication [MEDIUM PRIORITY]
**Location 1**: `/frontend/src/components/automation/ExecutionList.tsx` (282 lines)
**Location 2**: `/frontend/src/components/automation/ExecutionList_new.tsx` (268 lines)

**Difference**: 
- Old version uses useRef for execution tracking
- New version simplifies by removing useRef pattern
- Both have identical exports and props

**Status**: Appears to be active refactoring - _new version is cleaner

---

## Toast/Notification System Architecture

**Two Parallel Systems**:

1. **packages/ui Toast System**:
   ```typescript
   // Simple callback-based API
   interface ToastProps {
     id: string;
     message: string;
     type?: ToastType;
     duration?: number;
     onClose: () => void;
   }
   ```

2. **frontend Toast System**:
   ```typescript
   // Store-based API
   export interface Toast {
     id: string;
     message: string;
     type: ToastType;
     duration?: number;
     title?: string;
     icon?: string;
     fromCubeId?: string;
     toCubeId?: string;
   }
   ```

**Usage**:
- packages/ui exports: useToast hook (never used in found files)
- frontend uses: custom useToast hook from toastStore (21 files use it)
- packages/ui toast exported but not imported anywhere in codebase

---

## CSS/Styling Approach

**Primary**: Tailwind CSS with utility classes
**Secondary**: Custom CSS in index.css for Mosaic layout library overrides

**CSS Files Found**:
- frontend/src/index.css (243 lines) - Main Tailwind + Mosaic theme
- frontend/src/App.css
- frontend/src/components/gizmos/*.css (6 component-specific CSS files)
- frontend/src/components/shapes/BrainShape.css
- frontend/src/components/examples/BrainShapeExample.css
- game-frontend/src/index.css
- launcher/web/src/app.css
- chrome-extension/widget.css

**No @apply usage found** - components use inline Tailwind class names

---

## Form/Input Components

**Locations**:
- packages/ui: Input.tsx, Select.tsx, FormField.tsx
- frontend/src/components/control: ArrayFieldInput.tsx, DynamicParamForm.tsx
- frontend/src/components/automation: LoopForm.tsx, PresetForm.tsx

**Pattern**: Generic inputs in packages/ui, specialized forms in frontend components

---

## Styling Utilities

**Key Patterns**:
- Color definitions using Tailwind dark: variants
- Animation classes (animate-slide-in, fade-in, etc.)
- Clsx for conditional classes
- Type-based styling maps (TypeStyles, VariantStyles, etc.)

**Example** (from Toast):
```typescript
const typeStyles = {
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
};
```

---

## Custom Hooks

**In packages/ui**:
- useToast - Zustand-based store hook
- useTheme - Theme management

**In frontend/src/hooks**:
- useAsset.ts
- useAssets.ts
- useCubeDocking.ts
- useHoverScrubVideo.ts
- useJobStatus.ts
- useJobsSocket.ts
- useLineageGraph.ts
- useModal.ts
- useProviderAccounts.ts
- useProviderSpecs.ts
- useProviders.ts
- useRegisterPanelActions.ts

**In frontend/src/components/inspector**:
- useNodeEditor.ts - Shared logic for node editors

---

## Module Organization

Frontend organized into logical modules:
```
frontend/src/modules/
├── app-map
├── arc-graph
├── assets
├── automation
├── control-center
├── gallery
├── game
├── game-session
├── generation
├── graph-system
├── plugin-bootstrap
├── plugins
├── scene-builder
└── workspace
```

Each module appears to contain:
- Module-specific state/stores
- Module-specific utilities
- Module-specific components integration

---

## Potential Consolidation Opportunities

### 1. **CRITICAL: Toast Component** [High Impact]
- Merge frontend's enhanced Toast into @pixsim7/ui
- Or abandon packages/ui version if frontend version is standardized
- Impact: Reduces duplication, standardizes notifications
- Effort: Medium

### 2. **Automation List Duplication** [Medium Impact]
- Remove ExecutionList_new.tsx or complete migration
- Impact: Reduces confusion, cleaner codebase
- Effort: Low (already refactored)

### 3. **Editor Component Base** [High Impact]
- 23 editor components (mostly in inspector/) could share base
- Opportunity: Create EditorBase or useEditor hook
- Extends: useNodeEditor pattern already present
- Impact: Reduces code duplication in inspector editors
- Effort: High

### 4. **Panel Component Standardization** [Medium Impact]
- 26 panel components scattered across directories
- Some use @pixsim7/ui Panel, some don't
- Opportunity: Ensure all use base Panel component
- Impact: Consistent styling, easier theming
- Effort: Medium

### 5. **Form Components** [Low-Medium Impact]
- ArrayFieldInput, DynamicParamForm patterns replicate
- Could be parameterized/made more generic
- Impact: Reduces maintenance burden
- Effort: Medium-High

### 6. **Styling Constants Extraction** [Low Impact]
- Color maps repeated across components
- Opportunity: Extract to theme constants
- Impact: Easier to theme, reduce CSS duplication
- Effort: Low-Medium

---

## Technology Stack Summary

| System | Framework | Language | CSS | State | Component Count |
|--------|-----------|----------|-----|-------|-----------------|
| packages/ui | React 18 | TypeScript | Tailwind | Zustand | 16 components |
| packages/game-ui | React 18 | TypeScript | Tailwind | - | 4 components |
| frontend | React 19 | TypeScript | Tailwind | Zustand + custom | 134 components |
| game-frontend | Svelte | SvelteScript | Tailwind | - | 1 component |
| launcher | SvelteKit | SvelteScript | Tailwind | Svelte stores | 2 components |

---

## Import Patterns

**Frontend Usage of @pixsim7/ui**:
- Button: 8 files
- Panel: 8 files
- Select: 3 files
- Badge: 3 files
- Modal: 2 files
- PromptInput: 1 file
- Tooltip/CubeTooltip: 2 files
- FormField, Input: Game components
- ProgressBar, Table: Game/UI components

**NOT Imported**:
- Toast (frontend has own)
- useToast (frontend has own via toastStore)
- Dropdown
- StatusBadge
- Tabs
- ThemeToggle

---

## Configuration Files

**Tailwind**: 
- @pixsim7/config-tailwind package
- Applied to frontend, game-frontend, launcher

**TypeScript**:
- tsconfig.json in root
- Each package has own tsconfig.json

**Build**:
- packages/ui: TypeScript compiler only
- packages/game-ui: TypeScript compiler only
- frontend: Vite + TypeScript
- game-frontend: SvelteKit (assumed)
- launcher: SvelteKit

