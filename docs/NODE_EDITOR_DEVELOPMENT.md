# Node-Based Scene Editor Development

## Scope

**This doc is for:** Developers working on the node-based scene graph editor, including the visual graph canvas, property inspector, asset/segment pickers, and validation tools.

**See also:**
- `SYSTEM_OVERVIEW.md` – High-level map of game systems
- `GRAPH_UI_LIFE_SIM_PHASES.md` – World/life-sim integration with the editor
- `HOTSPOT_ACTIONS_2D.md` – How scenes are triggered from hotspots in 2D gameplay
- `RELATIONSHIPS_AND_ARCS.md` – How scenes affect session state (flags, relationships)
- `GAME_WORLD_DISPLAY_MODES.md` – How scenes are presented in different contexts

---

## Architecture Overview

The scene editor has a clear separation of concerns:

### SceneBuilderPanel (`apps/main/src/components/legacy/SceneBuilderPanel.tsx`)
**Purpose:** Scene-level context and actions
- **Displays:** World/location context, current scene info
- **Actions:** Preview in Game, Play from Here in 2D
- **Embeds:** InspectorPanel for node editing

**DO NOT** add node-specific configuration here. Use InspectorPanel instead.

### InspectorPanel (`apps/main/src/components/inspector/InspectorPanel.tsx`)
**Purpose:** Node-specific configuration (PRIMARY EXTENSION POINT)
- Dynamic, registry-based editor loading
- Type-specific editors for each node type
- Shared header with node info and label editing

### Node Type Registry (`@pixsim7/types`)
**Purpose:** Define node types with metadata
- Node type definitions with `editorComponent` and `rendererComponent` properties
- Canonical registry for all node types in the system

### Node Editor Registry (`apps/main/src/lib/nodeEditorRegistry.ts`)
**Purpose:** Lazy-load editor components
- Auto-discovers editors in `apps/main/src/components/inspector/`
- Provides dynamic import for editor components

### Graph Editor Surfaces (`apps/main/src/lib/graph`)
**Purpose:** Modular graph editor UIs
- `GraphEditorRegistry` (`editorRegistry.ts`) tracks available graph editor surfaces
- Built-in editors are registered via `registerGraphEditors()`:
  - `scene-graph-v2` – Scene Graph Editor (legacy/core, ReactFlow-based)
  - `arc-graph` – Arc Graph Editor (arc/quest-focused)
- `GraphEditorHost` (`components/graph/GraphEditorHost.tsx`) renders the active editor by ID
- The workspace **Graph** panel uses `GraphEditorHost` and defaults to `scene-graph-v2`

---

## How to Add a New Node Type

### Step 1: Define Node Type in Registry

Add your node type to `@pixsim7/types/src/nodeTypeRegistry.ts`:

```typescript
nodeTypeRegistry.register({
  type: 'my-node',
  name: 'My Custom Node',
  description: 'Does something cool',
  icon: '🚀',
  color: 'text-purple-700',
  bgColor: 'bg-purple-100',
  editorComponent: 'MyNodeEditor',  // Editor component name
  rendererComponent: 'MyNodeRenderer' // Renderer component name (optional)
});
```

### Step 2: Create Node Editor Component

Create `apps/main/src/components/inspector/MyNodeEditor.tsx`:

```typescript
import type { DraftSceneNode } from '../../modules/scene-builder';

interface MyNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function MyNodeEditor({ node, onUpdate }: MyNodeEditorProps) {
  // Your editor UI here
  return (
    <div className="space-y-3">
      {/* Add your form fields */}
    </div>
  );
}

// IMPORTANT: Default export for dynamic loading
export default MyNodeEditor;
```

### Step 3: That's It!

The editor will be automatically discovered by `nodeEditorRegistry` and loaded when needed.

**Key Points:**
- ✅ File must be in `apps/main/src/components/inspector/`
- ✅ File must have default export
- ✅ Component receives `node` and `onUpdate` props
- ✅ Use `onUpdate()` to apply changes to the node
- ❌ DO NOT add fields to SceneBuilderPanel
- ❌ DO NOT modify InspectorPanel directly

---

## Vision

Visual authoring of branching, modular video scenes with:
- Node-based graph for scene flow
- Conditions, effects, and optional mini-games
- Clean serialization to compact runtime `Scene` (from `@pixsim7/types`)
- Rich editor-only metadata preserved
- Live preview in docked Game iframe
- Fast iteration with validation and guardrails

---

## Current State (as of Nov 12, 2025)

**Implemented:**
- `GraphPanel` (frontend) - Draggable nodes, connection mode, set start node
- `SceneBuilderPanel` (frontend) - Basic node config form (selection strategy, progression steps, mini-game stub)
- `DockLayout` - Includes Gallery, Scene Builder, Game iframe, Graph panels; `workspace` preset sets this up
- Game Frontend - Working `ScenePlayer` with real `<video>` playback, loop segments, progression, and Reflex mini-game

**Reference Files:**
- Frontend:
  - `apps/main/src/components/GraphPanel.tsx` (React Flow wiring)
  - `apps/main/src/components/SceneBuilderPanel.tsx` (scene-level actions, embeds InspectorPanel)
  - `apps/main/src/components/inspector/InspectorPanel.tsx` (PRIMARY EXTENSION POINT)
  - `apps/main/src/lib/nodeEditorRegistry.ts` (editor auto-discovery)
  - `apps/main/src/components/inspector/VideoNodeEditor.tsx` (example editor)
  - `apps/main/src/components/nodes/SceneNode.tsx` (node component with handles)
  - `apps/main/src/modules/scene-builder/index.ts` (draft model + toRuntimeScene)
- Types:
  - `packages/types/src/index.ts` (Scene, SceneNode, SceneEdge, SelectionStrategy, PlaybackMode)
  - `packages/types/src/nodeTypeRegistry.ts` (node type definitions)
- Game Frontend:
  - `game-apps/main/src/components/ScenePlayer.tsx`
  - `game-apps/main/src/components/minigames/ReflexMiniGame.tsx`

---

## Development Roadmap

### Phase 1: Port-Aware Edges & Draft Edge Metadata

**Goal:** Connect nodes via ports (default/success/failure) and store edge metadata in draft; map to runtime `SceneEdge`.

**Deliverables:**
- Update `SceneNode.tsx` to enable success/failure handles (distinct colors and IDs)
- Update `GraphPanel.tsx` `onConnect` to capture `sourceHandle`/`targetHandle`
- Extend `scene-builder` draft model with `DraftEdge` type and `DraftEdgeMeta` (ports + future conditions/effects)
- Update `toRuntimeScene()` to include `isDefault` for edges from the `default` port

**Implementation:**
1. In `SceneNode.tsx`, enable the right-side success/failure handles (visible, interactive)
2. In `GraphPanel.tsx` `onConnect`, capture `sourceHandle`/`targetHandle` and store a `DraftEdge` with meta `{ fromPort, toPort }`
3. In scene-builder module, add types `DraftEdgeMeta`/`DraftEdge` and a list of edges in the draft
4. Stop synthesizing edges only from `node.connections`; migrate to `draft.edges`
5. Update `toRuntimeScene()` to output `SceneEdge.isDefault` when `fromPort === 'default'`

**Acceptance:**
- Connect nodes via bottom (default), right-top (success), right-bottom (failure) handles
- Draft persists port IDs; runtime `SceneEdge.isDefault === true` for default edges

---

### Phase 2: Node Palette and Creation Flow

**Goal:** Add a palette for node types and create nodes via click/drag.

**Deliverables:**
- New Palette component with entries: Video, Choice, Condition, MiniGame, End
- Support click-to-create at default position
- Optional drag-and-drop to set position
- Rename node label inline
- Delete/duplicate nodes
- Auto-focus new node

**Implementation:**
1. Create `NodePalette` component with node type buttons
2. Add click-to-create: creates node at default position
3. Add drag-from-palette: creates node at drop position
4. Update draft via `sceneBuilderModule.addNode/removeNode`
5. Add inline rename for node labels
6. Add delete/duplicate keyboard shortcuts

**Acceptance:**
- Add/rename/delete nodes without errors
- Drag nodes from palette to canvas at correct position
- Multi-select and move nodes together
- Canvas pan/zoom smooth at 60fps

---

### Phase 3: Property Inspector (Right Sidebar) ✅ COMPLETED

**Status:** IMPLEMENTED - InspectorPanel is now the primary node configuration system.

**Current Implementation:**
- ✅ InspectorPanel with dynamic editor loading
- ✅ Node Editor Registry with auto-discovery
- ✅ Type-specific editors (10+ editors implemented)
- ✅ Shared UI components from `@pixsim7/ui`
- ✅ SceneBuilderPanel refactored to embed InspectorPanel

**Extension Point:**
To add a new node type configuration UI:
1. Register node type in `@pixsim7/types` with `editorComponent` property
2. Create editor component in `apps/main/src/components/inspector/`
3. Export component as default export
4. Done! Auto-discovery handles the rest.

**Example Editors:**
- `VideoNodeEditor.tsx` - Selection strategy, progression, Life Sim metadata
- `ChoiceNodeEditor.tsx` - Player choice configuration
- `ConditionNodeEditor.tsx` - Conditional branching logic
- `MiniGameNodeEditor.tsx` - Mini-game configuration
- `SeductionNodeEditor.tsx` - Seduction mechanics
- And more...

---

### Phase 4: Edges - Conditions and Effects

**Goal:** Add conditions to edges and effects to nodes.

**Deliverables:**
- Edge condition builder (flag presence, equality, threshold, last mini-game result)
- Node enter/exit effects editor (set/unset flags, update counters, set variables)
- Edge inspector UI
- Extend draft edge metadata
- Map conditions/effects to runtime `SceneEdge`

**Implementation:**
1. Create `EdgeInspector` component
2. Add condition builder UI with:
   - Flag presence checks
   - Equality comparisons
   - Threshold checks
   - Mini-game result checks
3. Add effects editor UI with:
   - Set/unset flags
   - Update counters
   - Set variables
4. Store in `DraftEdgeMeta` and `DraftNodeMeta`
5. Update `toRuntimeScene()` to include conditions/effects

**Acceptance:**
- Create edge with condition X and effect Y
- Runtime scene contains correct condition/effect data
- Conditions evaluate correctly in player
- Effects apply correctly during playback

---

### Phase 5: Asset/Segment Picker Integration

**Goal:** Integrate asset browser and segment selection.

**Deliverables:**
- Open asset browser from node inspector
- Pick assets and derive segments
- Tag management
- Simple segment timeline scrubber
- Segments array per node populated

**Implementation:**
1. Add "Select Asset" button in Video node inspector
2. Open Gallery module picker
3. Return selected asset(s) to scene builder
4. Auto-generate segments from asset metadata
5. Add segment timeline UI with scrubber
6. Store segments in draft node

**Acceptance:**
- Chosen assets/segments appear under node
- Segments reflected in runtime scene
- Player loads and plays selected segments correctly
- Timeline scrubber shows accurate durations

---

### Phase 6: Validation & Testing Tools

**Goal:** Add validation, error checking, and testing tools.

**Deliverables:**
- Graph validation (cycles, unreachable nodes, missing start)
- Node validation (missing required fields, invalid segment IDs)
- Edge validation (conflicting conditions, unreachable branches)
- Visual indicators for errors/warnings
- Test scene button (quick preview)

**Implementation:**
1. Create validation service with rules:
   - No cycles in graph
   - All nodes reachable from start
   - Required fields filled
   - Valid segment references
2. Add warning/error badges to nodes
3. Show validation panel with issues list
4. Add "Test Scene" button for quick preview
5. Block save/publish if critical errors exist

**Acceptance:**
- Invalid graphs show clear error messages
- Warnings don't block save but show in UI
- Test button launches preview immediately
- Fixed errors clear from UI instantly

---

### Phase 7: Advanced Features

**Goal:** Polish and advanced editing features.

**Deliverables:**
- Undo/redo stack
- Clipboard operations (copy/paste nodes)
- Graph minimap
- Node search/filter
- Keyboard shortcuts panel
- Export/import scenes

**Implementation:**
1. Add undo/redo with history stack
2. Implement clipboard for nodes/edges
3. Add minimap component (React Flow built-in)
4. Create search bar for nodes
5. Add keyboard shortcuts:
   - `Ctrl+Z` - Undo
   - `Ctrl+Y` - Redo
   - `Ctrl+C/V` - Copy/Paste
   - `Delete` - Remove selected
   - `Space+Drag` - Pan
6. Add scene export/import (JSON)

**Acceptance:**
- Undo/redo works for all operations
- Copy/paste nodes with connections preserved
- Minimap shows full graph overview
- Search finds nodes by label/type
- All shortcuts documented and working

---

## UI Tasks (Scene Player & Game Frontend)

### ScenePlayer Video Element

**Tasks:**
1. Replace placeholder with `<video>` tag
2. Add source selection from `selectedSegment.url` fallback to `mediaUrl`
3. Implement `loopSegment`: on `timeupdate`, if `currentTime > end`, set `currentTime = start`
4. Add basic loading state + error fallback
5. Controls: minimal overlay (Play/Pause button)

**Acceptance:**
- ScenePlayer shows actual video
- Loops correctly for loopSegment
- Loading states display properly
- Error states handled gracefully

### Segment Indicator UI

**Tasks:**
1. Display selected segment name/ID with a small pill
2. If `selection.kind = 'pool'`, show tag chips from the segment
3. If progression step defines `segmentIds`, highlight which one is active

**Acceptance:**
- Segment info visible and matches active selection
- Tags display correctly for pool selections
- Active segment highlighted in progression

### Mini-Game Polish

**Tasks:**
1. Style `ReflexMiniGame` with centered layout
2. Clearer success/fail state
3. Expose `onResult` callback with detailed score
4. Show toast-like banner inside the Panel

**Acceptance:**
- Mini-game looks polished
- State changes clearly communicated
- Scores passed to parent correctly
- Success/failure animations smooth

### Editor Sandbox Skeleton

**Tasks:**
1. Add a `Workspace` preset that shows three panels: Gallery, Scene Builder, Game
2. Scene Builder form with:
   - Node ID, Label, Selection strategy (ordered/random/pool)
   - For pool: filter tags input (comma-separated)
   - Progression steps: editable list of step labels and optional segmentIds
   - Save-to-Draft button updating `sceneBuilderModule` draft
3. "Preview in Game" button triggers `sceneBuilderModule.toRuntimeScene()` and shows it in Game iframe

**Acceptance:**
- Workspace route offers basic editable form for a node
- Updates draft in scene-builder module
- Preview button launches game with current draft
- No backend changes required

---

## Technical Guidelines

### Styling
- Keep Tailwind utility classes for styling
- Use `@pixsim7/ui` primitives where helpful
- Maintain consistent spacing and colors
- Responsive design for all screen sizes

### State Management
- Use `sceneBuilderModule` draft for all editor state
- Debounce frequent updates (e.g., text inputs)
- Auto-save to localStorage
- Clear separation between editor and runtime state

### Performance
- Canvas operations at 60fps
- Lazy load node details
- Virtualize large node lists
- Debounce expensive operations

### Testing
- Unit tests for validation logic
- Integration tests for save/load
- E2E tests for critical paths
- Manual testing checklist for UI

---

## Migration & Rollout

### Phase 1-2: Foundation
- Can be developed in parallel with current system
- Feature flag: `ENABLE_NODE_EDITOR_V2`
- Roll out to dev environment first

### Phase 3-4: Core Features
- Beta flag for early testers
- Gather feedback on inspector UX
- Iterate on condition builder

### Phase 5-6: Production Ready
- Full validation suite complete
- Documentation updated
- Training materials prepared
- Gradual rollout to users

### Phase 7: Polish
- Based on user feedback
- Optional enhancements
- Performance optimizations

---

## Best Practices

### For Node Editor Components

1. **Use the standard interface:**
   ```typescript
   interface EditorProps {
     node: DraftSceneNode;
     onUpdate: (patch: Partial<DraftSceneNode>) => void;
   }
   ```

2. **Load node data in useEffect:**
   ```typescript
   useEffect(() => {
     // Load fields from node.metadata, node.selection, etc.
     setMyField(node.metadata?.myField ?? '');
   }, [node]);
   ```

3. **Apply changes with onUpdate:**
   ```typescript
   function handleApply() {
     onUpdate({
       metadata: { ...node.metadata, myField: myFieldValue }
     });
   }
   ```

4. **Use `@pixsim7/ui` components:** Button, Select, Input, etc.

5. **Default export required:** `export default MyNodeEditor;`

### Common Patterns

- **Selection Strategy:** See `VideoNodeEditor.tsx`
- **Progression Steps:** See `VideoNodeEditor.tsx`
- **Flag Checks:** See `ConditionNodeEditor.tsx`
- **Choice Options:** See `ChoiceNodeEditor.tsx`
- **Asset Picking:** See `VideoNodeEditor.tsx` (uses `useAssetPickerStore`)

---

## Resources

- **InspectorPanel:** `apps/main/src/components/inspector/InspectorPanel.tsx` (PRIMARY EXTENSION POINT)
- **Node Editor Registry:** `apps/main/src/lib/nodeEditorRegistry.ts`
- **Example Editors:** `apps/main/src/components/inspector/` (10+ examples)
- **Node Type Registry:** `packages/types/src/nodeTypeRegistry.ts`
- React Flow Docs: https://reactflow.dev/
- Types Package: `packages/types/src/index.ts`
- UI Primitives: `packages/ui/`
- Scene Player: `game-apps/main/src/components/ScenePlayer.tsx`
- Backend API: `http://localhost:8001/docs`

---

## Quick Start: Adding a Node Type

1. **Define in registry** (`@pixsim7/types/src/nodeTypeRegistry.ts`):
   ```typescript
   nodeTypeRegistry.register({
     type: 'my-node',
     editorComponent: 'MyNodeEditor',
     // ... other metadata
   });
   ```

2. **Create editor** (`apps/main/src/components/inspector/MyNodeEditor.tsx`):
   ```typescript
   export function MyNodeEditor({ node, onUpdate }) {
     return <div>...</div>;
   }
   export default MyNodeEditor;
   ```

3. **Done!** Editor auto-discovered and loaded when needed.

---

## Next Steps

1. Start with Phase 1 (Port-Aware Edges)
2. Create feature branch: `feat/node-editor-ports`
3. Implement changes incrementally
4. Add tests for each deliverable
5. Review and merge to main
6. Repeat for subsequent phases
