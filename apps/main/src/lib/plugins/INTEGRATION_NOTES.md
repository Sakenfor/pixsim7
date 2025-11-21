# Plugin Catalog Integration Notes

## Files Created

### Core Implementation

1. **`frontend/src/lib/plugins/catalog.ts`** (403 lines)
   - PluginKind type union (6 plugin types)
   - PluginMeta interface (unified metadata)
   - PluginCapabilities interface
   - Mapping functions for each plugin type
   - List functions (per-kind and unified)
   - Search, filter, and grouping utilities

2. **`frontend/src/components/PluginCatalogPanel.tsx`** (711 lines)
   - Full-featured catalog browser UI
   - List, Grid, and Grouped view modes
   - Search and multi-filter support
   - Detail panel with metadata and capabilities
   - Responsive dark mode support

3. **`docs/PLUGIN_CATALOG.md`** (507 lines)
   - Complete design documentation
   - Usage examples
   - Mapping function details
   - Extension guide
   - FAQ section

4. **`frontend/src/lib/plugins/__test_catalog.ts`** (test file)
   - Integration test for catalog functions
   - Validates all list/search/filter operations

## Integration Points

### Existing Systems (Unchanged)

The catalog is a **read-only metadata layer**. These systems continue to work as-is:

1. **Session Helpers**
   - Registry: `sessionHelperRegistry` (@pixsim7/game.engine)
   - Config: `pluginConfigStore`
   - UI: `PluginConfigPanel` (existing)

2. **Interactions**
   - Registry: `interactionRegistry` (frontend/src/lib/game/interactions)
   - Config: `pluginConfigStore`
   - UI: `PluginConfigPanel` (existing)

3. **Node Types**
   - Registry: `nodeTypeRegistry` (@pixsim7/types)
   - Config: N/A (always enabled)
   - UI: Scene/Arc/World graph editors

4. **Gallery Tools**
   - Registry: `galleryToolRegistry` (frontend/src/lib/gallery/types)
   - Config: N/A (conditional via `whenVisible`)
   - UI: `GalleryToolsPanel`

5. **UI Plugins**
   - Registry: `pluginManager` (frontend/src/lib/plugins/PluginManager)
   - Config: `PluginEntry.state` (enabled/disabled/error)
   - UI: `PluginManager` component

6. **Generation UI**
   - Registry: `generationUIPluginRegistry` (frontend/src/lib/providers/generationPlugins)
   - Config: N/A (always enabled)
   - UI: `QuickGenerateModule`

### New Capabilities

The catalog adds these new capabilities **without breaking existing code**:

1. **Unified Discovery**
   ```typescript
   import { listAllPlugins } from '@/lib/plugins/catalog';
   const allPlugins = listAllPlugins(); // All 6 plugin types in one array
   ```

2. **Cross-System Search**
   ```typescript
   import { searchPlugins } from '@/lib/plugins/catalog';
   const results = searchPlugins('inventory'); // Searches across all registries
   ```

3. **Metadata Normalization**
   - Every plugin gets a consistent `PluginMeta` shape
   - Semantic capabilities mapped from each type's native metadata
   - Enablement state unified across different tracking mechanisms

4. **UI Component**
   - `PluginCatalogPanel` provides a visual browser
   - Filter by kind, category, enabled state
   - View modes: List, Grid, Grouped
   - Links to existing config UIs for configurable plugins

## Verification Checklist

### Code Structure
- [x] `catalog.ts` compiles without errors
- [x] All imports resolve correctly
- [x] No circular dependencies
- [x] TypeScript types are strict (no `any`)

### Mapping Functions
- [x] `mapHelperToMeta` - extracts metadata from `HelperDefinition`
- [x] `mapInteractionToMeta` - maps `InteractionPlugin` capabilities
- [x] `mapNodeTypeToMeta` - filters to user-creatable/custom scope
- [x] `mapGalleryToolToMeta` - extracts gallery tool metadata
- [x] `mapUIPluginToMeta` - maps `PluginEntry` from PluginManager
- [x] `mapGenerationUIToMeta` - extracts generation plugin metadata

### List Functions
- [x] `listHelperPlugins()` - returns session helpers
- [x] `listInteractionPlugins()` - returns interactions
- [x] `listNodeTypePlugins()` - returns node types (filtered)
- [x] `listGalleryToolPlugins()` - returns gallery tools
- [x] `listUIPlugins()` - returns UI plugins
- [x] `listGenerationUIPlugins()` - returns generation plugins
- [x] `listAllPlugins()` - unified array of all plugins

### Utility Functions
- [x] `searchPlugins(query)` - full-text search
- [x] `filterByKind(kind)` - filter by PluginKind
- [x] `filterByCategory(category)` - filter by category
- [x] `filterByEnabled(enabled)` - filter by enabled state
- [x] `getPluginCounts()` - counts by kind
- [x] `getUniqueCategories()` - all categories
- [x] `getUniqueTags()` - all tags
- [x] `groupByKind()` - group plugins by kind
- [x] `groupByCategory()` - group plugins by category
- [x] `getPluginById(id, kind?)` - lookup by ID

### UI Component
- [x] `PluginCatalogPanel` component created
- [x] Search input
- [x] Kind filter dropdown
- [x] Category filter dropdown
- [x] Enabled state filter
- [x] View mode toggle (List/Grid/Grouped)
- [x] Plugin list/grid rendering
- [x] Detail panel with metadata
- [x] Dark mode support
- [x] Responsive design

### Documentation
- [x] `PLUGIN_CATALOG.md` created
- [x] Overview and design principles
- [x] Core types documented
- [x] Usage examples
- [x] Mapping function details
- [x] Extension guide
- [x] FAQ section

## Usage Example

```typescript
// Import the catalog
import { listAllPlugins, searchPlugins, filterByKind } from '@/lib/plugins/catalog';

// Get all plugins
const allPlugins = listAllPlugins();
console.log(`Total plugins: ${allPlugins.length}`);

// Search for inventory-related plugins
const inventoryPlugins = searchPlugins('inventory');
console.log(`Inventory plugins: ${inventoryPlugins.length}`);

// Get only interactions
const interactions = filterByKind('interaction');
console.log(`Interactions: ${interactions.length}`);

// Use in UI
import { PluginCatalogPanel } from '@/components/PluginCatalogPanel';

function MyPage() {
  return <PluginCatalogPanel />;
}
```

## Testing Strategy

### Manual Testing
1. **Import Test**: Check that catalog imports work
   ```bash
   cd frontend
   npm run build  # Verify no import errors
   ```

2. **Runtime Test**: Use the test file
   ```typescript
   // Run the integration test
   import { testCatalog } from '@/lib/plugins/__test_catalog';
   testCatalog(); // Prints results to console
   ```

3. **UI Test**: Add PluginCatalogPanel to a route
   ```typescript
   // In any route file
   import { PluginCatalogPanel } from '@/components/PluginCatalogPanel';

   export function PluginsPage() {
     return <PluginCatalogPanel />;
   }
   ```

### Automated Testing (Future)
- Unit tests for mapping functions
- Integration tests for search/filter
- Component tests for PluginCatalogPanel
- E2E tests for full catalog flow

## Known Limitations

1. **No Real-Time Updates**: Catalog reads from registries on-demand. If plugins are registered/unregistered at runtime, call `listAllPlugins()` again to refresh.

2. **Node Type Filtering**: Only `userCreatable` or `scope === 'custom'` node types are included to avoid flooding the catalog with built-in types.

3. **Read-Only**: The catalog provides discovery and metadata. Configuration changes must go through existing UIs (`PluginConfigPanel`, `PluginManager`).

4. **No Persistence**: Plugin counts/metadata are computed on-the-fly. For performance-critical use cases, consider adding a reactive store.

## Next Steps

1. **Add Route**: Create a dedicated "/plugins" route with PluginCatalogPanel
2. **Link to Config**: Wire up "Configure Plugin" buttons in detail panel
3. **Add Icons**: Replace emoji icons with proper icon library
4. **Performance**: Add React Query or similar for caching if needed
5. **Testing**: Add unit and integration tests
6. **Extend**: Add more plugin kinds as new systems are added

## Breaking Changes

**None.** This is a purely additive change. All existing plugin systems, registries, and UIs continue to work exactly as before.

## Migration Guide

**No migration needed.** Existing code is unaffected. To use the catalog:

1. Import from `@/lib/plugins/catalog`
2. Call `listAllPlugins()` or specific list functions
3. Optionally use `PluginCatalogPanel` component

That's it!
