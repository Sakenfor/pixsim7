# Gallery Tools Plugin System

## Overview

The Gallery Tools Plugin system provides an extension point for adding new tools and features to the Assets gallery without modifying core gallery code. Tools can add capabilities like:

- **Lineage Visualizations**: Show asset relationships and provenance
- **Bulk Operations**: Tag, move, delete, or export multiple assets
- **AI Tagging Assistants**: Automatically suggest tags using AI
- **Custom Filters and Views**: Add specialized filtering and viewing modes
- **Analysis Tools**: Perform analytics on asset collections

## Architecture

The plugin system follows the same patterns as other plugin types in the codebase:

- **Type Definitions**: `apps/main/src/lib/gallery/types.ts`
- **Registry**: `GalleryToolRegistry` (singleton)
- **Auto-Discovery**: Plugin loader discovers tools in `apps/main/src/plugins/galleryTools/**`
- **Integration**: `GalleryToolsPanel` component renders tools in the Assets route

## Creating a Gallery Tool Plugin

### 1. Basic Structure

Create a new file in `apps/main/src/plugins/galleryTools/` (e.g., `myTool.tsx`):

```typescript
import type { GalleryToolPlugin, GalleryToolContext } from '../../lib/gallery/types';

/**
 * Your tool component
 */
function MyToolComponent({ context }: { context: GalleryToolContext }) {
  // Access gallery state
  const { assets, selectedAssets, filters } = context;

  return (
    <div>
      <h3>My Custom Tool</h3>
      <p>Selected: {selectedAssets.length} assets</p>
      {/* Your tool UI here */}
    </div>
  );
}

/**
 * Register the tool
 */
export function registerMyTool() {
  const { galleryToolRegistry } = require('../../lib/gallery/types');

  const myTool: GalleryToolPlugin = {
    id: 'my-tool',
    name: 'My Tool',
    description: 'Does something useful',
    icon: '🔧',
    category: 'utility',

    // Optional: control when tool is visible
    whenVisible: (context) => context.selectedAssets.length > 0,

    // Render the tool UI
    render: (context) => <MyToolComponent context={context} />,
  };

  galleryToolRegistry.register(myTool);
}
```

### 2. Gallery Tool Context

The `GalleryToolContext` provides access to:

```typescript
interface GalleryToolContext {
  /** Currently visible assets in the gallery */
  assets: GalleryAsset[];

  /** Currently selected assets (if any) */
  selectedAssets: GalleryAsset[];

  /** Current filter state */
  filters: {
    q?: string;
    tag?: string;
    provider_id?: string;
    sort?: 'new' | 'old' | 'alpha';
    media_type?: string;
  };

  /** Trigger a refresh of the asset list */
  refresh: () => void;

  /** Update filters */
  updateFilters: (filters: any) => void;

  /** Asset picker mode */
  isSelectionMode: boolean;
}
```

### 3. Plugin Interface

```typescript
interface GalleryToolPlugin {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Short description */
  description: string;

  /** Icon (emoji or icon name) */
  icon?: string;

  /** Category for grouping tools */
  category?: 'visualization' | 'automation' | 'analysis' | 'utility';

  /**
   * Predicate to determine when this tool should be visible
   * @returns true if the tool should be shown
   */
  whenVisible?: (context: GalleryToolContext) => boolean;

  /**
   * Render the tool UI
   * @param context - Current gallery context
   */
  render: (context: GalleryToolContext) => ReactNode;

  /** Optional: Initialize the tool when mounted */
  onMount?: (context: GalleryToolContext) => void | Promise<void>;

  /** Optional: Cleanup when tool is unmounted */
  onUnmount?: () => void | Promise<void>;
}
```

## Examples

### Example 1: Simple Info Tool

```typescript
export function registerAssetInfoTool() {
  const { galleryToolRegistry } = require('../../lib/gallery/types');

  const infoTool: GalleryToolPlugin = {
    id: 'asset-info',
    name: 'Asset Info',
    description: 'Display information about selected assets',
    icon: 'ℹ️',
    category: 'utility',

    whenVisible: (context) => context.selectedAssets.length === 1,

    render: (context) => {
      const asset = context.selectedAssets[0];
      return (
        <div className="space-y-2">
          <div className="text-sm"><strong>ID:</strong> {asset.id}</div>
          <div className="text-sm"><strong>Type:</strong> {asset.media_type}</div>
          <div className="text-sm"><strong>Tags:</strong> {asset.tags?.join(', ') || 'None'}</div>
        </div>
      );
    },
  };

  galleryToolRegistry.register(infoTool);
}
```

### Example 2: Bulk Tag Tool

See `apps/main/src/plugins/galleryTools/bulkOperations.tsx` for a complete example.

### Example 3: Lineage Visualization

See `apps/main/src/plugins/galleryTools/lineageVisualization.tsx` for a complete example.

## Auto-Discovery

The plugin loader (`apps/main/src/lib/pluginLoader.ts`) automatically discovers and loads gallery tool plugins:

- Scans `apps/main/src/plugins/galleryTools/**/*.{ts,tsx,js,jsx}`
- Looks for functions named `register*Tool`
- Calls each registration function on startup

## Integration with Assets Route

The `AssetsRoute` component (`apps/main/src/routes/Assets.tsx`) integrates gallery tools:

1. **Selection State**: Tracks selected assets via Ctrl+Click
2. **Tools Panel Toggle**: Shows/hides tools panel with a button
3. **Gallery Context**: Builds context from current state
4. **Rendering**: Uses `GalleryToolsPanel` component to render active tools

## User Interaction

Users can:

1. **Select Assets**: Hold Ctrl/Cmd and click assets to select them
2. **Toggle Tools Panel**: Click the "🛠️ Tools" button in the header
3. **Expand Tools**: Click a tool header to expand/collapse it
4. **Use Tool Features**: Interact with tool-specific UI

## Best Practices

### 1. Visibility Predicates

Use `whenVisible` to show tools only when relevant:

```typescript
// Show only when multiple assets selected
whenVisible: (context) => context.selectedAssets.length > 1

// Show only for images
whenVisible: (context) =>
  context.selectedAssets.every(a => a.media_type === 'image')

// Always show
whenVisible: () => true  // or omit the property
```

### 2. Categories

Organize tools by category:

- `visualization`: Graph/chart based tools
- `automation`: Bulk operations, AI assistants
- `analysis`: Analytics, statistics
- `utility`: General purpose tools

### 3. Error Handling

Always handle errors gracefully:

```typescript
render: (context) => {
  try {
    // Your tool UI
    return <MyToolComponent context={context} />;
  } catch (error) {
    return (
      <div className="text-red-600">
        Error: {error.message}
      </div>
    );
  }
}
```

### 4. Performance

For expensive operations:

```typescript
function MyTool({ context }: { context: GalleryToolContext }) {
  const [processing, setProcessing] = useState(false);

  const handleProcess = async () => {
    setProcessing(true);
    try {
      // Expensive operation
      await processAssets(context.selectedAssets);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Button onClick={handleProcess} disabled={processing}>
      {processing ? 'Processing...' : 'Process Assets'}
    </Button>
  );
}
```

## Registry API

The `galleryToolRegistry` provides:

```typescript
// Register a tool
galleryToolRegistry.register(tool: GalleryToolPlugin): void

// Unregister a tool
galleryToolRegistry.unregister(id: string): boolean

// Get a specific tool
galleryToolRegistry.get(id: string): GalleryToolPlugin | undefined

// Get all registered tools
galleryToolRegistry.getAll(): GalleryToolPlugin[]

// Get tools by category
galleryToolRegistry.getByCategory(category): GalleryToolPlugin[]

// Get visible tools for context
galleryToolRegistry.getVisible(context: GalleryToolContext): GalleryToolPlugin[]

// Clear all tools (testing)
galleryToolRegistry.clear(): void
```

## Testing

To test your plugin:

1. Create your plugin file in `apps/main/src/plugins/galleryTools/`
2. Ensure it exports a `register*Tool` function
3. Restart the frontend dev server
4. Navigate to the Assets route
5. Select assets and click the Tools button
6. Your tool should appear in the panel

## Future Enhancements

Potential improvements:

- **Tool Settings**: Per-tool configuration UI
- **Tool Permissions**: Access control for sensitive operations
- **Tool API**: Standardized API for common operations
- **Tool Marketplace**: Share and discover community tools
- **Tool Analytics**: Track tool usage and performance

## Related Documentation

- [Plugin System Architecture](./PLUGIN_SYSTEM.md)
- [Frontend Tasks](./FRONTEND_CLAUDE_TASKS.md)
- [Assets Gallery Design](./ASSETS_GALLERY.md)

## Support

For questions or issues:
- File an issue on GitHub
- Check existing plugins for examples
- Review the plugin loader code in `apps/main/src/lib/pluginLoader.ts`
