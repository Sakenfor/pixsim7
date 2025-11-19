# Plugin Workspace Phases 3-5 Implementation

Complete implementation details for extended plugin project support.

## Overview

Phases 3-5 extend the Plugin Workspace to support all plugin kinds, not just UI plugins:

- **Phase 3**: Interaction & Node Type projects with test harnesses
- **Phase 4**: Gallery Tool & World Tool projects
- **Phase 5**: Export/Import & sharing functionality

## Implementation Status

### ✅ Completed Components

#### 1. Extended Projects Store (`projects.ts`)

**File**: `frontend/src/lib/plugins/projects.ts`

**Features**:
- Discriminated union type for `PluginProject` supporting 5 kinds:
  - `ui-plugin` (Phase 2)
  - `interaction` (Phase 3)
  - `node-type` (Phase 3)
  - `gallery-tool` (Phase 4)
  - `world-tool` (Phase 4)
- Scaffold generators for each kind
- Export/Import functions (Phase 5)
- localStorage persistence

**Plugin Project Types**:

```typescript
export type PluginProjectKind =
  | 'ui-plugin'
  | 'interaction'
  | 'node-type'
  | 'gallery-tool'
  | 'world-tool';

// Each kind has its own interface:
interface UIPluginProject { ... }
interface InteractionPluginProject { ... }
interface NodeTypePluginProject { ... }
interface GalleryToolPluginProject { ... }
interface WorldToolPluginProject { ... }
```

#### 2. Scaffold Generators

Each plugin kind has a dedicated scaffold function:

**Interaction Scaffold**:
```typescript
createInteractionProject(label: string): InteractionPluginProject
```
- Creates `InteractionPlugin<T>` with:
  - Metadata (id, name, description, category, tags)
  - Config schema (form fields)
  - Execute function implementation
  - Validation function
  - isAvailable predicate

**Node Type Scaffold**:
```typescript
createNodeTypeProject(label: string): NodeTypePluginProject
```
- Creates `NodeTypeDefinition<T>` with:
  - Metadata (id, name, icon, category, scope)
  - Default data
  - Validation function
  - Port definitions (inputs/outputs)

**Gallery Tool Scaffold**:
```typescript
createGalleryToolProject(label: string): GalleryToolPluginProject
```
- Creates `GalleryToolPlugin` with:
  - Metadata (id, name, icon, category)
  - Render function (React elements)
  - whenVisible predicate

**World Tool Scaffold**:
```typescript
createWorldToolProject(label: string): WorldToolPluginProject
```
- Creates `WorldToolPlugin` with:
  - Metadata (id, name, icon, category)
  - Render function with world context
  - whenVisible predicate

#### 3. Test Harness Components

**File**: `frontend/src/components/plugins/PluginTestHarnesses.tsx`

**Components**:

**InteractionTestHarness**:
- Config JSON editor
- Stub context with fake GameSession, NPC, etc.
- Execute button to run interaction
- Result/error display
- Tests: config parsing, execute function, validation

**NodeTypeTestHarness**:
- Node data JSON editor
- Metadata display (icon, category, scope)
- Validation testing
- Visual feedback for valid/invalid data
- Note about dev-registration

**GalleryToolTestHarness**:
- Sample assets list (fake GalleryAsset[])
- Context with filters, refresh, etc.
- Render test button
- Render output display

**WorldToolTestHarness**:
- Sample world data (world, session, time, location, NPCs)
- Context simulation
- Render test button
- Output display

#### 4. Export/Import Functions (Phase 5)

**Export Format**:
```typescript
interface PluginExportFormat {
  kind: PluginProjectKind;
  version: string; // '1.0'
  data: any; // Kind-specific data
}
```

**Functions**:
```typescript
exportProject(project: PluginProject): PluginExportFormat
importProject(exportData: PluginExportFormat): PluginProject
downloadProjectAsJSON(project: PluginProject): void
```

**Export Format Examples**:

UI Plugin:
```json
{
  "kind": "ui-plugin",
  "version": "1.0",
  "data": {
    "manifest": { "id": "...", "name": "...", ... },
    "code": "..."
  }
}
```

Interaction:
```json
{
  "kind": "interaction",
  "version": "1.0",
  "data": {
    "metadata": { "id": "...", "name": "...", ... },
    "code": "...",
    "configSchema": "[...]"
  }
}
```

Node Type, Gallery Tool, World Tool follow similar patterns.

### 🚧 Integration Requirements

To fully activate Phases 3-5, the following UI integration is needed in `PluginWorkspace.tsx`:

#### 1. Project Creation UI

Extend the "New Plugin" dropdown to support all kinds:

```tsx
<Menu>
  <MenuItem onClick={() => createProject('ui-plugin')}>UI Plugin</MenuItem>
  <MenuItem onClick={() => createProject('interaction')}>Interaction</MenuItem>
  <MenuItem onClick={() => createProject('node-type')}>Node Type</MenuItem>
  <MenuItem onClick={() => createProject('gallery-tool')}>Gallery Tool</MenuItem>
  <MenuItem onClick={() => createProject('world-tool')}>World Tool</MenuItem>
</Menu>
```

#### 2. Kind-Specific Editors

Switch on `project.kind` to show the appropriate editor:

```tsx
{selectedProject.kind === 'ui-plugin' && (
  <UIPluginEditor project={selectedProject} onUpdate={updateProject} />
)}
{selectedProject.kind === 'interaction' && (
  <>
    <InteractionMetadataEditor project={selectedProject} onUpdate={updateProject} />
    <CodeEditor code={selectedProject.code} onChange={(code) => updateProject({...selectedProject, code})} />
    <InteractionTestHarness project={selectedProject} />
  </>
)}
{selectedProject.kind === 'node-type' && (
  <>
    <NodeTypeMetadataEditor project={selectedProject} onUpdate={updateProject} />
    <CodeEditor code={selectedProject.code} onChange={(code) => updateProject({...selectedProject, code})} />
    <NodeTypeTestHarness project={selectedProject} />
  </>
)}
// ... similar for gallery-tool and world-tool
```

#### 3. Export/Import UI

Add buttons to the workspace:

```tsx
// In project list or detail view
<button onClick={() => exportProject(project)}>
  Export Project
</button>

// At top level
<input
  type="file"
  accept=".json"
  onChange={(e) => handleImportProject(e.target.files[0])}
  ref={importInputRef}
  style={{ display: 'none' }}
/>
<button onClick={() => importInputRef.current?.click()}>
  Import Project
</button>
```

#### 4. Dev Registration (Phase 3 requirement)

For non-UI plugins, provide "Dev Register" / "Unregister" buttons:

**Interaction Dev Registration**:
```typescript
import { interactionRegistry } from '@/lib/registries';

function devRegisterInteraction(project: InteractionPluginProject) {
  // Eval code and register in interactionRegistry
  const plugin = evalPluginCode(project.code);
  interactionRegistry.register(plugin);
}

function devUnregisterInteraction(pluginId: string) {
  // Remove from registry (requires registry.unregister method)
}
```

**Node Type Dev Registration**:
```typescript
import { nodeTypeRegistry } from '@pixsim7/types';

function devRegisterNodeType(project: NodeTypePluginProject) {
  const nodeType = evalPluginCode(project.code);
  nodeTypeRegistry.register(nodeType);
}
```

**Gallery Tool Dev Registration**:
```typescript
import { galleryToolRegistry } from '@/lib/gallery/types';

function devRegisterGalleryTool(project: GalleryToolPluginProject) {
  const tool = evalPluginCode(project.code);
  galleryToolRegistry.register(tool);
}
```

**Important**: Dev registrations should be scoped to the workspace session and cleaned up on unmount to avoid polluting global registries.

### 📚 Scaffold Code Examples

#### Interaction Plugin Scaffold

```javascript
// Default configuration
export const defaultConfig = {
  enabled: true,
  successChance: 75
};

// Config form fields
export const configFields = [
  {
    key: 'enabled',
    label: 'Enabled',
    type: 'boolean'
  },
  {
    key: 'successChance',
    label: 'Success Chance',
    type: 'number',
    min: 0,
    max: 100
  }
];

// Execute the interaction
export async function execute(config, context) {
  const { state, session, onSuccess, onError } = context;

  // Implementation...
  const success = Math.random() * 100 < config.successChance;

  if (success) {
    onSuccess('Interaction succeeded!');
    return { success: true, message: 'Success!' };
  } else {
    onError('Interaction failed');
    return { success: false, message: 'Failed' };
  }
}

// Export plugin
export default {
  id: 'dev-interaction-xxx',
  name: 'My Interaction',
  description: 'Custom interaction',
  category: 'custom',
  defaultConfig,
  configFields,
  execute
};
```

#### Node Type Plugin Scaffold

```javascript
// Default data for new nodes
export const defaultData = {
  value: '',
  enabled: true
};

// Node type definition
export default {
  id: 'dev-node-xxx',
  name: 'My Node Type',
  description: 'Custom node type',
  icon: '⚡',
  category: 'custom',
  scope: 'scene',
  defaultData,
  userCreatable: true,

  // Validation
  validate: (data) => {
    if (!data.value) {
      return 'Value is required';
    }
    return null;
  },

  // Custom ports
  ports: {
    inputs: [{ id: 'in', label: 'In', position: 'top' }],
    outputs: [{ id: 'out', label: 'Out', position: 'bottom' }]
  }
};
```

#### Gallery Tool Plugin Scaffold

```javascript
import { createElement } from 'react';

export function render(context) {
  const { assets, refresh } = context;

  return createElement('div', { className: 'p-4' }, [
    createElement('h3', { key: 'title' }, 'My Tool'),
    createElement('p', { key: 'count' }, `${assets.length} assets`),
    createElement('button', {
      key: 'btn',
      onClick: refresh,
      className: 'px-3 py-2 bg-blue-500 text-white rounded'
    }, 'Refresh')
  ]);
}

export default {
  id: 'dev-gallery-xxx',
  name: 'My Gallery Tool',
  description: 'Custom gallery tool',
  icon: '🔧',
  category: 'utility',
  render
};
```

#### World Tool Plugin Scaffold

```javascript
import { createElement } from 'react';

export function render(context) {
  const { world, worldTime, locationNpcs } = context;

  return createElement('div', { className: 'p-4' }, [
    createElement('h3', { key: 'title' }, 'My World Tool'),
    createElement('p', { key: 'world' }, `World: ${world?.title}`),
    createElement('p', { key: 'time' }, `Day ${worldTime.day}, Hour ${worldTime.hour}`),
    createElement('p', { key: 'npcs' }, `NPCs: ${locationNpcs.length}`)
  ]);
}

export default {
  id: 'dev-world-xxx',
  name: 'My World Tool',
  description: 'Custom world tool',
  icon: '🌍',
  category: 'custom',
  render
};
```

## Usage Workflow

### Phase 3: Interaction Plugin

1. Click "New Interaction Plugin"
2. Edit metadata (name, category, tags)
3. Edit code (execute function, config schema)
4. Edit config JSON in test harness
5. Click "Execute Interaction" to test
6. See results/errors
7. Optional: "Dev Register" to add to interactionRegistry temporarily

### Phase 3: Node Type Plugin

1. Click "New Node Type Plugin"
2. Edit metadata (name, icon, category, scope)
3. Edit code (defaultData, validate, ports)
4. Edit node data JSON in test harness
5. Click "Validate Node Data" to test
6. Optional: "Dev Register" to add to nodeTypeRegistry
7. Open graph editor to see node in palette

### Phase 4: Gallery Tool Plugin

1. Click "New Gallery Tool Plugin"
2. Edit metadata (name, icon, category)
3. Edit code (render function)
4. Click "Test Render" in harness
5. See render output in console
6. Optional: "Dev Register" to add to galleryToolRegistry
7. Open Assets route to see tool

### Phase 4: World Tool Plugin

1. Click "New World Tool Plugin"
2. Edit metadata (name, icon, category)
3. Edit code (render function)
4. Click "Test Render" in harness
5. See render output
6. Optional: "Dev Register" to add to worldToolRegistry
7. Open Game2D/GameWorld to see tool

### Phase 5: Export/Import

**Export**:
1. Select any project
2. Click "Export"
3. Downloads `plugin-{kind}-{id}.json`

**Import**:
1. Click "Import Project"
2. Select `.json` file
3. Project appears in list
4. Edit and test as normal

## File Structure

```
frontend/src/
├── lib/
│   └── plugins/
│       ├── projects.ts               # Extended (all kinds, export/import)
│       ├── catalog.ts                # (Existing) Unified catalog
│       ├── PluginManager.ts          # (Existing) UI plugin manager
│       └── types.ts                  # (Existing) Plugin types
├── components/
│   └── plugins/
│       ├── PluginBrowser.tsx         # (Existing) Phase 1
│       └── PluginTestHarnesses.tsx   # NEW: Test harnesses for all kinds
└── routes/
    └── PluginWorkspace.tsx           # NEEDS UPDATE: Multi-kind support

docs/
├── PLUGIN_CATALOG.md                 # (Existing)
├── PLUGIN_WORKSPACE.md               # (Existing) Phase 1-2
└── PLUGIN_WORKSPACE_PHASES_3_5.md    # (This file)
```

## Migration from Phase 2

The extended `projects.ts` is backward-compatible with Phase 2:

- `UIPluginProject` structure unchanged
- `loadProjects()` / `saveProjects()` unchanged
- `createUiPluginProject()` unchanged
- `installUiPluginProject()` unchanged

Existing UI plugin projects will load normally. New kinds are additive.

## Security & Safety

### Dev Registration Scope

Dev-registered plugins should:
- Only exist during workspace session
- Be unregistered on workspace unmount
- Not persist to production registries
- Be clearly marked as "dev" in the UI

### Code Evaluation

All plugin code is evaluated with `eval()` in test harnesses:
- This is intentional for dev environments
- Users are editing their own code
- No remote code execution
- Errors are caught and displayed

Production installation (for UI plugins only) uses the existing PluginManager sandbox.

## Testing

### Unit Tests (Future)

- `projects.ts`: Test scaffold generation, export/import
- Test harnesses: Mock contexts, verify outputs

### Manual Testing

1. Create projects of each kind
2. Edit code and metadata
3. Test with harnesses
4. Export and re-import
5. Verify data integrity

## Known Limitations

1. **No Multi-File Support**: Scaffolds are single-file only
2. **No TypeScript Compilation**: Code is JavaScript strings
3. **Limited Editor**: Textarea, no syntax highlighting
4. **Dev Registration Manual**: Must click "Dev Register" button
5. **No Hot Reload**: Must re-register after code changes

## Future Enhancements

### Short-Term

- Monaco Editor integration (syntax highlighting)
- TypeScript support with compilation
- Auto-dev-registration on project select
- Hot reload for dev-registered plugins

### Medium-Term

- Multi-file project support
- Dependency management
- Template library per kind
- Better test harness visualizations

### Long-Term

- Backend sync (store projects in database)
- Collaboration & sharing
- Plugin marketplace
- Automated testing frameworks

## Summary

Phases 3-5 provide:

✅ **Complete Infrastructure**:
- Extended projects store
- Scaffolds for all 5 plugin kinds
- Test harnesses for dev testing
- Export/Import for sharing

🚧 **UI Integration Needed**:
- Multi-kind project creation UI
- Kind-specific metadata editors
- Test harness integration
- Dev register/unregister buttons
- Export/Import UI

The backend is complete and ready. The UI integration can be done incrementally, starting with one kind at a time.

## References

- [Plugin Catalog](./PLUGIN_CATALOG.md) - Unified metadata layer
- [Plugin Workspace](./PLUGIN_WORKSPACE.md) - Phase 1-2 basics
- [Session Helper Reference](./SESSION_HELPER_REFERENCE.md)
- [Interaction Plugin Manifest](./INTERACTION_PLUGIN_MANIFEST.md)
- [Gallery Tools Plugin](./GALLERY_TOOLS_PLUGIN.md)
