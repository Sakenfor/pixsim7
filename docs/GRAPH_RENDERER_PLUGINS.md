# Graph Renderer Plugin System

## Overview

The graph node rendering system has been transformed into a pluggable architecture, allowing custom visual representations for different node types without modifying core components.

## Architecture

### Core Components

1. **NodeRendererRegistry** (`frontend/src/lib/graph/nodeRendererRegistry.ts`)
   - Central registry for node renderers
   - Singleton pattern with `nodeRendererRegistry` instance
   - Methods: `register()`, `get()`, `getOrDefault()`, `has()`, `getAll()`

2. **Node Renderer Interface**
   ```typescript
   interface NodeRendererProps {
     node: DraftSceneNode;
     isSelected: boolean;
     isStart: boolean;
     hasErrors: boolean;
   }

   interface NodeRenderer {
     nodeType: string;
     component: ComponentType<NodeRendererProps>;
     defaultSize?: { width: number; height: number };
     customHeader?: boolean;
   }
   ```

3. **Built-in Renderers** (`frontend/src/lib/graph/builtinRenderers.ts`)
   - Registers all standard node renderers
   - Called on app initialization

## Built-in Renderers

### 1. DefaultNodeRenderer (Fallback)
**Location:** `frontend/src/components/graph/DefaultNodeRenderer.tsx`

- Used for unknown node types
- Shows node type badge with icon
- Displays NPC metadata (speaker role, NPC ID, state)
- Shows node ID and description

### 2. VideoNodeRenderer
**Location:** `frontend/src/components/graph/VideoNodeRenderer.tsx`

Features:
- **Video Thumbnail Preview** - Shows first media clip as preview
- **Playback Mode Badge** - Indicates loop/progression modes
- **Mini-Game Badge** - Visual indicator for mini-game nodes
- **Media Count** - Shows number of clips when multiple
- **Selection Strategy** - Displays ordered/random/pool selection
- **NPC Metadata** - Speaker role and NPC bindings

### 3. ChoiceNodeRenderer
**Location:** `frontend/src/components/graph/ChoiceNodeRenderer.tsx`

Features:
- **Choice Preview** - Shows up to 3 choices with labels
- **Target Preview** - Displays target node IDs
- **Choice Count** - Indicates total number of choices
- **Visual Hierarchy** - Numbered badges for each choice

## Usage

### Registering a Custom Renderer

```typescript
import { nodeRendererRegistry } from './lib/graph/nodeRendererRegistry';
import { MyCustomRenderer } from './components/graph/MyCustomRenderer';

// Register a custom renderer
nodeRendererRegistry.register({
  nodeType: 'my_custom_node',
  component: MyCustomRenderer,
  defaultSize: { width: 250, height: 200 },
  customHeader: false, // Use default header
});
```

### Creating a Custom Renderer Component

```typescript
// frontend/src/components/graph/MyCustomRenderer.tsx
import { NodeRendererProps } from '../../lib/graph/nodeRendererRegistry';

export function MyCustomRenderer({ node, isSelected, isStart, hasErrors }: NodeRendererProps) {
  // Access node data
  const customData = node.customField;

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Custom rendering logic */}
      <div className="text-sm font-medium">
        Custom Node: {customData}
      </div>

      {/* Use isSelected, isStart, hasErrors for conditional styling */}
      {hasErrors && (
        <div className="text-red-500 text-xs">Has validation errors</div>
      )}
    </div>
  );
}
```

## Integration with SceneNode

The `SceneNode` component (ReactFlow wrapper) now uses the registry:

```typescript
// In SceneNode.tsx
const renderer = nodeRendererRegistry.getOrDefault(data.nodeType);
const RendererComponent = renderer.component;

return (
  <div className="node-wrapper">
    {/* Header with label */}
    <div className="header">...</div>

    {/* Dynamic Body Content */}
    <RendererComponent
      node={data.draftNode}
      isSelected={selected}
      isStart={data.isStart}
      hasErrors={highestSeverity === 'error'}
    />

    {/* Handles (ports) */}
    {portConfig.outputs.map(...)}
  </div>
);
```

## Styling Guidelines

### Consistent Design Tokens

```css
/* Node wrapper - handled by SceneNode */
- Border: 2px solid
- Border radius: rounded-lg
- Background: bg-white dark:bg-neutral-800

/* Selected state */
- Border: border-blue-500
- Ring: ring-2 ring-blue-300

/* Typography */
- Labels: text-sm font-medium
- Metadata: text-xs text-neutral-500
- Headers: font-semibold

/* Badges */
- Padding: px-2 py-0.5
- Border radius: rounded
- Font: text-xs font-medium
```

### Color Palette by Node Type

Follow the node type registry colors:
- Video: Blue (`bg-blue-100`, `text-blue-700`)
- Choice: Purple (`bg-purple-100`, `text-purple-700`)
- Condition: Amber (`bg-amber-100`, `text-amber-700`)
- End: Red (`bg-red-100`, `text-red-700`)
- Scene Call: Cyan (`bg-cyan-100`, `text-cyan-700`)
- Action: Yellow (`bg-yellow-100`, `text-yellow-700`)

## Advanced Features

### Dynamic Sizing

Renderers can specify default sizes that may be used by layout algorithms:

```typescript
nodeRendererRegistry.register({
  nodeType: 'large_video',
  component: LargeVideoRenderer,
  defaultSize: { width: 300, height: 250 }, // Larger size for big previews
});
```

### Custom Headers

For complete control over node appearance:

```typescript
nodeRendererRegistry.register({
  nodeType: 'special_node',
  component: SpecialNodeRenderer,
  customHeader: true, // Renderer handles its own header
});
```

When `customHeader: true`, the renderer is responsible for the entire node appearance including header, badges, and wrapper styling.

## Performance Optimization

### Async Loading with getAsync

Use `getAsync()` to load renderers asynchronously, enabling lazy loading for heavy components:

```typescript
// In SceneNode.tsx or graph component
const SceneNode = ({ data }) => {
  const [renderer, setRenderer] = useState(null);

  useEffect(() => {
    // Async load renderer (supports lazy loading)
    nodeRendererRegistry.getAsync(data.nodeType).then(setRenderer);
  }, [data.nodeType]);

  if (!renderer) {
    return <LoadingPlaceholder />;
  }

  const RendererComponent = renderer.component;
  return <RendererComponent node={data} />;
};
```

### Lazy Loading Renderers

For heavy renderer components (large chart libraries, video players, etc.), use lazy loading:

```typescript
// Stub registration (lightweight, loaded immediately)
nodeRendererRegistry.register({
  nodeType: 'heavy-chart',
  component: PlaceholderRenderer, // Lightweight placeholder
  defaultSize: { width: 300, height: 250 },

  // Lazy load full renderer on demand
  loader: async () => {
    // Heavy import (Chart.js, D3, etc.)
    const module = await import('./HeavyChartRenderer.full');
    return module.HeavyChartRenderer;
  },

  // Preload priority (0-10, higher = sooner)
  preloadPriority: 6,
});
```

**When to use lazy loading:**
- Heavy visualization libraries (Chart.js, D3, Three.js)
- Rich media players
- Complex data transformations
- Conditionally used renderers

**When NOT to use lazy loading:**
- Simple, frequently-used renderers (video preview, choice list)
- Core built-in renderers
- Lightweight components

### Preloading Renderers

Improve UX by preloading renderers before they're needed:

```typescript
// In graph editor initialization
async function initializeGraphEditor() {
  // Preload commonly used renderers
  await nodeRendererRegistry.preload([
    'video',
    'choice',
    'condition',
    'quest-trigger'
  ]);

  // Or preload by priority (top 10 highest priority)
  await nodeRendererRegistry.preload();
}

// In route/scene loading
async function loadScene(sceneId) {
  const scene = await fetchScene(sceneId);

  // Preload renderers for node types in this scene
  const nodeTypes = scene.nodes.map(n => n.type);
  await nodeRendererRegistry.preload(nodeTypes);

  return scene;
}
```

### Caching

The registry uses an LRU cache (max 50 entries) for frequently accessed renderers:

```typescript
// First access - loads from registry
const renderer1 = await nodeRendererRegistry.getAsync('video');

// Second access - returns from cache (instant)
const renderer2 = await nodeRendererRegistry.getAsync('video');

// Get cache statistics
const stats = nodeRendererRegistry.getCacheStats();
console.log(stats); // { size: 25, maxSize: 50 }

// Clear cache if needed (e.g., hot reload during development)
nodeRendererRegistry.clearCache();
```

## Plugin Flow Example

Complete example showing node type + renderer plugin flow:

### 1. Create Plugin with CLI

```bash
# Generate node type
node scripts/create-plugin/index.js \
  --type node \
  --name quest-trigger

# Generate renderer
node scripts/create-plugin/index.js \
  --type renderer \
  --name quest-trigger
```

### 2. Implement Plugin

See `examples/plugins/quest-trigger/` for full example:

**Node Type (`quest-trigger.ts`):**
```typescript
export const questTriggerNodeType: NodeTypeDefinition = {
  id: 'quest-trigger',
  name: 'Quest Trigger',
  icon: '📜',
  category: 'action',
  scope: 'arc', // Arc-level organization
  defaultData: { /* ... */ },
  preloadPriority: 7,
};
```

**Renderer (`quest-trigger.tsx`):**
```typescript
export const questTriggerRenderer: NodeRenderer = {
  nodeType: 'quest-trigger',
  component: QuestTriggerRenderer,
  defaultSize: { width: 280, height: 200 },
  preloadPriority: 7,
};
```

### 3. Register Plugin

```typescript
import { questTriggerNodeType } from './examples/plugins/quest-trigger/quest-trigger';
import { questTriggerRenderer } from './examples/plugins/quest-trigger/quest-trigger.tsx';
import { nodeTypeRegistry } from '@pixsim7/types';
import { nodeRendererRegistry } from '@/lib/graph/nodeRendererRegistry';

// Register node type
nodeTypeRegistry.register(questTriggerNodeType);

// Register renderer
nodeRendererRegistry.register(questTriggerRenderer);
```

### 4. Use in Graph

```typescript
// SceneNode component automatically uses registry
const SceneNode = ({ data }) => {
  const renderer = await nodeRendererRegistry.getAsync(data.nodeType);
  const RendererComponent = renderer?.component ?? DefaultNodeRenderer;

  return (
    <div className="scene-node">
      <RendererComponent
        node={data.draftNode}
        isSelected={selected}
        isStart={data.isStart}
        hasErrors={hasErrors}
      />
    </div>
  );
};
```

## Future Enhancements

### Runtime Registration

```typescript
// Future: Load renderers from plugins
async function loadRendererPlugins() {
  const plugins = await loadPluginsFromDirectory('./plugins/renderers');

  plugins.forEach(plugin => {
    plugin.registerRenderers(nodeRendererRegistry);
  });
}
```

### Renderer Hot Reload

```typescript
// Future: Update renderers without page refresh
if (import.meta.hot) {
  import.meta.hot.accept('./MyCustomRenderer', (newModule) => {
    nodeRendererRegistry.register({
      nodeType: 'my_custom',
      component: newModule.MyCustomRenderer,
    });
  });
}
```

## Benefits

1. **Visual Customization** - Rich, type-specific node representations
2. **Plugin Architecture** - Add renderers without touching core code
3. **Performance** - Lazy-loaded renderer components
4. **Consistency** - Shared wrapper maintains uniform handles/badges
5. **Developer Experience** - Clear separation of concerns

## Migration Notes

- Old `SceneNode` body content has been extracted into `DefaultNodeRenderer`
- All node types now render through the registry
- Custom renderers automatically inherit:
  - Border and selection styling
  - Start node badge
  - Validation error badges
  - Dynamic port handles
  - Label editing

## Testing

Verify the renderer system:

1. ✅ All node types render correctly
2. ✅ Video nodes show thumbnails
3. ✅ Choice nodes display options
4. ✅ Unknown types use fallback renderer
5. ✅ Selection states work across all renderers

## Example: Custom "Quiz" Node Renderer

```typescript
// QuizNodeRenderer.tsx
export function QuizNodeRenderer({ node, isSelected, hasErrors }: NodeRendererProps) {
  const questions = node.quizQuestions || [];

  return (
    <div className="px-3 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-2xl">❓</span>
        <div className="text-sm font-medium">Quiz Node</div>
      </div>

      <div className="text-xs text-neutral-600">
        {questions.length} question{questions.length !== 1 ? 's' : ''}
      </div>

      {questions.slice(0, 2).map((q, i) => (
        <div key={i} className="p-2 bg-blue-50 rounded text-xs">
          {q.text}
        </div>
      ))}
    </div>
  );
}

// Register it
nodeRendererRegistry.register({
  nodeType: 'quiz',
  component: QuizNodeRenderer,
  defaultSize: { width: 220, height: 160 },
});
```

## Files Modified

- `frontend/src/lib/graph/nodeRendererRegistry.ts` (NEW)
- `frontend/src/lib/graph/builtinRenderers.ts` (NEW)
- `frontend/src/components/graph/DefaultNodeRenderer.tsx` (NEW)
- `frontend/src/components/graph/VideoNodeRenderer.tsx` (NEW)
- `frontend/src/components/graph/ChoiceNodeRenderer.tsx` (NEW)
- `frontend/src/components/nodes/SceneNode.tsx` (MODIFIED)
- `frontend/src/App.tsx` (MODIFIED)

The graph is now fully pluggable and ready for custom visual experiences!
