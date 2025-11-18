# Dynamic Node Inspector System

## Overview

The node inspector UI is now dynamically resolved from the registry and plugin files, driven by `editorComponent` names in `nodeTypeRegistry` entries. This allows for automatic discovery of editor components without hard-coded imports.

## Architecture

### 1. NodeEditorRegistry (`frontend/src/lib/nodeEditorRegistry.ts`)

A central registry that manages node editor components with support for:

- **Lazy Loading**: Editors are loaded on-demand, not at startup
- **Auto-Discovery**: Uses Vite's `import.meta.glob` to find all editor components
- **Manual Registration**: Allows plugins to register custom editors programmatically

**Convention**:
- Editors are located in `/src/components/inspector/**/*.{tsx,ts}`
- File names map to editor IDs (e.g., `SeductionNodeEditor.tsx` → `"SeductionNodeEditor"`)
- Each editor must export a default component

### 2. InspectorPanel (`frontend/src/components/inspector/InspectorPanel.tsx`)

The main inspector panel now uses the registry to load editors dynamically:

- **DynamicEditor Component**: Handles async loading of editor components
- **Loading States**: Shows "Loading editor..." while the component loads
- **Error Handling**: Displays error messages if an editor fails to load
- **Fallback**: Shows generic node info if no editor is registered

### 3. Node Type Definitions

Each node type in the `nodeTypeRegistry` specifies its editor component:

```typescript
nodeTypeRegistry.register({
  id: 'seduction',
  name: 'Seduction',
  // ...
  editorComponent: 'SeductionNodeEditor', // Must match filename
});
```

## How It Works

### Flow Diagram

```
1. User selects node in graph
   ↓
2. InspectorPanel gets node type
   ↓
3. Look up nodeTypeDef.editorComponent
   ↓
4. Query nodeEditorRegistry.getEditor(editorComponentName)
   ↓
5. If found: Load editor module (lazy)
   ↓
6. Render editor component with node data
```

### Example: Seduction Node

1. **Node Type Registration** (`frontend/src/lib/plugins/seductionNode.ts`):
   ```typescript
   nodeTypeRegistry.register({
     id: 'seduction',
     editorComponent: 'SeductionNodeEditor',
   });
   ```

2. **Editor Component** (`frontend/src/components/inspector/SeductionNodeEditor.tsx`):
   ```typescript
   export function SeductionNodeEditor({ node, onUpdate }) {
     // Editor UI implementation
   }
   export default SeductionNodeEditor; // Required for registry
   ```

3. **Auto-Discovery**:
   - On startup, `nodeEditorRegistry` scans `/src/components/inspector/**/*.{tsx,ts}`
   - Finds `SeductionNodeEditor.tsx`
   - Registers it as `"SeductionNodeEditor"` → lazy loader

4. **Runtime**:
   - User clicks seduction node
   - Inspector looks up `editorComponent: "SeductionNodeEditor"`
   - Registry returns lazy loader
   - Component loads and renders

## Adding a New Editor

### Step 1: Create Editor Component

Create a new file in `frontend/src/components/inspector/`:

```typescript
// MyCustomNodeEditor.tsx
import { Button } from '@pixsim7/ui';
import type { DraftSceneNode } from '../../modules/scene-builder';

interface MyCustomNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function MyCustomNodeEditor({ node, onUpdate }: MyCustomNodeEditorProps) {
  // Your editor UI here
  return (
    <div>
      <h3>My Custom Editor</h3>
      {/* Editor fields */}
    </div>
  );
}

// IMPORTANT: Must export as default for registry
export default MyCustomNodeEditor;
```

### Step 2: Register Node Type

In your plugin or builtin types file:

```typescript
nodeTypeRegistry.register({
  id: 'my-custom-node',
  name: 'My Custom Node',
  editorComponent: 'MyCustomNodeEditor', // Must match filename (without .tsx)
  // ... other properties
});
```

### Step 3: Done!

The editor will be automatically discovered on next page reload. No need to modify `InspectorPanel.tsx`.

## Error Handling

### Editor Not Found

If an `editorComponent` name doesn't match any discovered file:

```
[InspectorPanel] Editor "FooEditor" not found. Available editors: VideoNodeEditor, ChoiceNodeEditor, ...
```

The inspector will show:
- Red error box with error message
- List of available editors in console
- Fallback to generic node info

### Loading Failure

If an editor module fails to load:

```
[InspectorPanel] Failed to load editor "SeductionNodeEditor": <error details>
```

The inspector will show:
- Red error box with failure message
- Console error for debugging

## Benefits

### Before (Hard-Coded)

```typescript
// InspectorPanel.tsx
import { VideoNodeEditor } from './VideoNodeEditor';
import { ChoiceNodeEditor } from './ChoiceNodeEditor';
import { SeductionNodeEditor } from './SeductionNodeEditor';
// ... 10+ imports

const EDITOR_COMPONENTS = {
  VideoNodeEditor,
  ChoiceNodeEditor,
  SeductionNodeEditor,
  // ... manual mapping
};
```

**Problems**:
- All editors loaded at startup (large bundle)
- Adding new editor requires modifying InspectorPanel
- Plugin editors must be hard-coded
- No lazy loading

### After (Dynamic Registry)

```typescript
// InspectorPanel.tsx
import { nodeEditorRegistry } from '../../lib/nodeEditorRegistry';

// Auto-discovers all editors
// Loads on-demand
```

**Benefits**:
- ✅ Lazy loading (smaller initial bundle)
- ✅ Auto-discovery (no manual imports)
- ✅ Plugin-friendly (drop file in folder)
- ✅ Graceful error handling
- ✅ Hot reload support (Vite HMR)

## Testing

### Acceptance Criteria

All criteria met:

1. ✅ **Selecting a seduction node renders `SeductionNodeEditor` from the registry**
   - No direct import in InspectorPanel
   - Loaded via `nodeEditorRegistry.getEditor('SeductionNodeEditor')`

2. ✅ **Adding a new editor file makes it available automatically**
   - Create `NewEditor.tsx` in `frontend/src/components/inspector/`
   - Add `export default NewEditor`
   - Set `nodeTypeDef.editorComponent = 'NewEditor'`
   - Reload page → editor available

3. ✅ **When an editor fails to load, inspector falls back gracefully**
   - Shows error message in red box
   - Logs error to console with available editors
   - Continues to function (doesn't crash)

## Future Enhancements

Potential improvements:

1. **Preloading**: Preload editors for visible nodes
2. **Editor Metadata**: Allow editors to declare their capabilities
3. **Hot Reload**: Improve HMR for editor updates
4. **Validation**: Validate editor exports at discovery time
5. **Plugin Manifest**: Allow plugins to declare their editors explicitly
