# Phase 3 - Inspector Panel Testing Guide

## Overview
The Inspector Panel provides type-specific property editors for all node types in the Scene Editor.

## Testing Steps

### 1. Open the Workspace

Navigate to `/workspace` route and ensure the Inspector panel is visible on the right side.

Layout: `Gallery | Graph | Inspector | Game`

### 2. Test Video Node

**Create a Video Node:**
1. Click "Palette" in Graph toolbar
2. Click "Video" node type
3. Select the newly created node

**Expected in Inspector:**
- Header shows node ID and label input
- Type badge shows "video"
- Selection Strategy dropdown (Ordered/Random/Pool)
- Progression Steps section with add/remove
- "Apply Changes" button

**Test Edits:**
1. Change label to "Opening Scene"
2. Press Enter or blur input
3. Verify node label updates in graph immediately
4. Change selection strategy to "Pool"
5. Add filter tags: "intro, cafe"
6. Add progression step
7. Click "Apply Changes"
8. Re-select node
9. Verify settings persisted

### 3. Test Choice Node

**Create a Choice Node:**
1. From palette, click "Choice"
2. Select the node

**Expected in Inspector:**
- Choice editor with configurable choices
- Each choice has: text and target node ID
- Add/Remove choice buttons

**Test Edits:**
1. Set first choice text: "Accept quest"
2. Set target: "video_1"
3. Add second choice
4. Set text: "Decline quest"
5. Apply changes
6. Re-select and verify persistence

### 4. Test Condition Node

**Create a Condition Node:**
1. From palette, click "Condition"
2. Select the node

**Expected in Inspector:**
- Logic mode selector (AND/OR)
- Conditions list with variable, operator, value
- Operators: ==, !=, >, <, >=, <=

**Test Edits:**
1. Set logic mode: AND
2. First condition: variable="score", operator=">", value="100"
3. Add second condition: variable="hasKey", operator="==", value="true"
4. Apply changes
5. Verify persistence

### 5. Test Mini-Game Node

**Create a Mini-Game Node:**
1. From palette, click "Mini-Game"
2. Select the node

**Expected in Inspector:**
- Game type dropdown (Reflex/Memory/Puzzle)
- Rounds slider (1-10)
- Difficulty dropdown (Easy/Medium/Hard)
- Time limit slider (10-120s)

**Test Edits:**
1. Set game type: Reflex Test
2. Set rounds: 5
3. Set difficulty: Hard
4. Set time limit: 60s
5. Apply changes
6. Verify persistence

### 6. Test End Node

**Create an End Node:**
1. From palette, click "End"
2. Select the node

**Expected in Inspector:**
- End type dropdown (Success/Failure/Neutral)
- End message textarea

**Test Edits:**
1. Set end type: Success
2. Enter message: "Congratulations! You completed the quest."
3. Apply changes
4. Verify persistence

### 7. Test Real-Time Updates

**With Debug Panel:**
1. Create two video nodes
2. Connect them with default handle
3. Click "Debug" button in toolbar
4. Verify edge appears in debug panel with ports
5. Select first node
6. Change label in inspector
7. Verify label updates in graph node immediately (no refresh needed)

**Expected Behavior:**
- Label changes reflect immediately in graph
- Node selection updates inspector instantly
- All edits persist across selection changes
- Subscription system keeps everything in sync

### 8. Test Edge Cases

**No Selection:**
- Deselect all nodes
- Inspector shows placeholder: "Select a node in the graph to edit its properties"

**Invalid Node:**
- Delete a selected node
- Inspector should handle gracefully

**Multiple Selections:**
- Select multiple nodes (if supported)
- Inspector should show first selected or placeholder

### 9. Verify Subscription System

**Auto-refresh test:**
1. Select a video node
2. Inspector loads its properties
3. In console, run: `sceneBuilderModule.updateNode('video_1', { metadata: { label: 'Changed' } })`
4. Inspector should auto-update with new label (no manual refresh)

## Success Criteria

✅ All node types have dedicated editors
✅ Label changes reflect immediately in graph
✅ Property changes persist across selections
✅ Inspector auto-refreshes on draft changes
✅ No manual refresh needed (subscription system works)
✅ Type-specific fields show/hide correctly
✅ Apply buttons save changes successfully
✅ Empty selection shows helpful placeholder

## Architecture Notes

### Components

```
apps/main/src/components/inspector/
  ├── InspectorPanel.tsx          # Main router component
  ├── VideoNodeEditor.tsx         # Video node editor
  ├── ChoiceNodeEditor.tsx        # Choice node editor
  ├── ConditionNodeEditor.tsx     # Condition node editor
  ├── MiniGameNodeEditor.tsx      # Mini-game node editor
  └── EndNodeEditor.tsx           # End node editor
```

### Data Flow

1. **Selection** → `useSelectionStore().selectedNodeId`
2. **Load Node** → `sceneBuilderModule.getDraft()?.nodes.find(...)`
3. **Edit** → Local state in editor
4. **Apply** → `sceneBuilderModule.updateNode(id, patch)`
5. **Emit** → `sceneBuilderModule._emit()`
6. **Subscribe** → Inspector & GraphPanel auto-refresh

### Subscription Pattern

```typescript
// Inspector subscribes to draft changes
useEffect(() => {
  const unsubscribe = sceneBuilderModule.subscribe?.(() => {
    setDraftVersion((v) => v + 1);
  });
  return () => unsubscribe?.();
}, []);

// Effect re-runs when draftVersion changes
useEffect(() => {
  const draft = sceneBuilderModule.getDraft?.();
  const node = draft?.nodes.find(n => n.id === selectedNodeId);
  setSelectedNode(node);
}, [selectedNodeId, draftVersion]);
```

## Integration with DockLayout

**layoutStore.ts:**
- Added `'inspector'` to `PanelType` union
- Added `p_inspector` panel to workspace preset
- Layout: 20% Gallery, 40% Graph, 20% Inspector, 20% Game

**DockLayout.tsx:**
- Imports `InspectorPanel`
- Routes `p_inspector` → `<InspectorPanel />`

## Known Limitations

1. **MiniGame mapping** - Currently maps to 'video' type in draft (needs separate type)
2. **Choice targets** - Target node IDs are manual strings (could be dropdown of available nodes)
3. **Condition variables** - No autocomplete for game state variables
4. **Validation** - No validation on condition values or choice targets

## Future Enhancements

- [ ] Autocomplete for node IDs in choice targets
- [ ] Variable picker for conditions
- [ ] Visual edge preview when configuring choices
- [ ] Validation warnings for invalid configurations
- [ ] Undo/redo support for inspector edits
- [ ] Bulk edit multiple nodes
