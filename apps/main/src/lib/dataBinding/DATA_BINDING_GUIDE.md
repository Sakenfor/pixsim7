# Data Binding System - Usage Guide

This guide explains how to use the Panel Builder data binding system (Task 51).

## Table of Contents

1. [Overview](#overview)
2. [Initialization](#initialization)
3. [Data Sources](#data-sources)
4. [Transforms](#transforms)
5. [Data Bindings](#data-bindings)
6. [Using in Widgets](#using-in-widgets)
7. [Advanced Usage](#advanced-usage)

---

## Overview

The data binding system allows Panel Builder widgets to connect to live data sources without directly accessing stores or making ad-hoc API calls. It provides:

- **Type-safe** data source definitions
- **Serializable** bindings that persist with panel compositions
- **Reactive** updates when underlying data changes
- **Transform** capabilities for data manipulation
- **Safe** access to whitelisted stores only

### Architecture

```
DataSourceDefinition → DataBinding → ResolvedBinding → Widget Props
         ↓                  ↓               ↓
    (static/store/     (references    (actual value
     computed)          source)        + error)
```

---

## Initialization

Initialize the core data sources and transforms once at application startup:

```typescript
import { initializeCoreDataSources } from './lib/dataBinding';

// In your app initialization (e.g., main.tsx or App.tsx)
initializeCoreDataSources();
```

This registers:
- Common workspace sources (lock state, panels, presets)
- Game state sources (context, mode, world/session IDs)
- Utility transforms (to-string, array-length, sum, etc.)

---

## Data Sources

### Types of Data Sources

#### 1. Static Sources

Static, unchanging values:

```typescript
import { dataSourceRegistry, createStaticSource } from './lib/dataBinding';

dataSourceRegistry.registerSource(
  createStaticSource('config.appName', 'Application Name', 'PixSim7')
);
```

#### 2. Store Sources

Read from Zustand stores:

```typescript
import { createStoreSource } from './lib/dataBinding';

dataSourceRegistry.registerSource(
  createStoreSource(
    'workspace.isLocked',
    'Workspace Lock State',
    'workspace',      // storeId (must be whitelisted)
    'isLocked',       // path within the store
    {
      description: 'Whether the workspace is locked',
      tags: ['workspace', 'state'],
    }
  )
);
```

**Whitelisted stores:**
- `workspace` - Workspace layout and state
- `game-state` - Current game context and mode

**Path syntax:**
- Dot notation: `'currentLayout.direction'`
- Nested: `'context.mode'`
- Array length: `'closedPanels.length'`

#### 3. Computed Sources

Combine other sources with transforms:

```typescript
import { createComputedSource } from './lib/dataBinding';

// First, ensure dependencies are registered
dataSourceRegistry.registerSource(
  createStoreSource('workspace.closedPanels.count', 'Closed Panels Count', 'workspace', 'closedPanels.length')
);

dataSourceRegistry.registerSource(
  createStoreSource('workspace.floatingPanels.count', 'Floating Panels Count', 'workspace', 'floatingPanels.length')
);

// Create computed source
dataSourceRegistry.registerSource(
  createComputedSource(
    'workspace.totalSpecialPanels',
    'Total Special Panels',
    ['workspace.closedPanels.count', 'workspace.floatingPanels.count'],
    'sum'  // transform to apply
  )
);
```

### Registering Data Sources

```typescript
import { dataSourceRegistry } from './lib/dataBinding';
import type { DataSourceDefinition } from './lib/dataBinding';

const mySource: DataSourceDefinition = {
  id: 'my-custom-source',
  type: 'store',
  label: 'My Custom Source',
  description: 'Description of what this provides',
  tags: ['custom', 'example'],
  storeId: 'workspace',
  path: 'someProperty',
};

dataSourceRegistry.registerSource(mySource);
```

---

## Transforms

Transforms are pure functions that manipulate data. They can be applied at the binding level or used in computed sources.

### Built-in Transforms

**Type conversions:**
- `to-string`, `to-number`, `to-boolean`

**Array operations:**
- `array-length`, `array-first`, `array-last`, `array-join`

**Logical operations:**
- `not`, `is-null`, `is-empty`

**Numeric operations:**
- `abs`, `round`, `floor`, `ceil`

**String operations:**
- `uppercase`, `lowercase`, `trim`, `string-length`

**Aggregation (for computed sources):**
- `sum`, `average`, `min`, `max`, `concat`

### Registering Custom Transforms

```typescript
import { dataSourceRegistry } from './lib/dataBinding';
import type { DataTransform } from './lib/dataBinding';

const myTransform: DataTransform = {
  id: 'double',
  label: 'Double Value',
  description: 'Multiplies a number by 2',
  apply: (input: unknown) => Number(input) * 2,
};

dataSourceRegistry.registerTransform(myTransform);
```

**Important:** Transforms should be:
- **Pure** - Same input always produces same output
- **Deterministic** - No side effects
- **Safe** - Handle invalid input gracefully

---

## Data Bindings

Data bindings connect widget properties to data sources.

### Creating Bindings

```typescript
import { createBinding } from './lib/dataBinding';
import type { DataBinding } from './lib/dataBinding';

const binding: DataBinding = createBinding(
  'binding-1',              // unique ID
  'workspace.isLocked',     // source ID
  'isLocked',               // target widget prop
  {
    fallbackValue: false,   // used if resolution fails
    transformId: 'not',     // optional transform
  }
);
```

### Widget Instance with Bindings

```typescript
interface WidgetInstance {
  id: string;
  type: string;
  dataBindings: Record<string, DataBinding>;
  // ... other properties
}

const widget: WidgetInstance = {
  id: 'widget-1',
  type: 'status-badge',
  dataBindings: {
    isLocked: createBinding('b1', 'workspace.isLocked', 'isLocked'),
    panelCount: createBinding('b2', 'workspace.closedPanels.count', 'count', {
      fallbackValue: 0,
    }),
  },
};
```

---

## Using in Widgets

### Basic Usage with Hooks

```typescript
import { useBindingValue, useBindingValues } from './lib/dataBinding';
import type { DataBinding } from './lib/dataBinding';

// Single binding
function StatusIndicator({ binding }: { binding: DataBinding }) {
  const isLocked = useBindingValue<boolean>(binding);

  return <div>{isLocked ? '🔒' : '🔓'}</div>;
}

// Multiple bindings
interface WidgetProps {
  dataBindings: Record<string, DataBinding>;
}

function MyWidget({ dataBindings }: WidgetProps) {
  const values = useBindingValues(dataBindings);

  return (
    <div>
      <div>Locked: {values.isLocked ? 'Yes' : 'No'}</div>
      <div>Panel Count: {values.panelCount || 0}</div>
    </div>
  );
}
```

### Advanced Usage with Full Resolution

```typescript
import { useResolvedBinding, useResolvedBindings } from './lib/dataBinding';

function DebugWidget({ dataBindings }: WidgetProps) {
  const resolved = useResolvedBindings(dataBindings);

  return (
    <div>
      {Object.entries(resolved).map(([key, result]) => (
        <div key={key}>
          <strong>{key}:</strong>
          {result.error ? (
            <span style={{ color: 'red' }}>Error: {result.error.message}</span>
          ) : (
            <span>{JSON.stringify(result.value)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Using the Registry in Builder UI

```typescript
import { useDataSourceRegistry } from './lib/dataBinding';

function DataSourcePicker() {
  const { sources, searchSources } = useDataSourceRegistry();

  return (
    <select>
      {sources.map((source) => (
        <option key={source.id} value={source.id}>
          {source.label}
        </option>
      ))}
    </select>
  );
}
```

---

## Advanced Usage

### Custom Store Integration

To add a new store to the whitelist:

1. **Update the StoreId type** in `storeAccessors.ts`:

```typescript
export type StoreId = 'workspace' | 'game-state' | 'my-new-store';
```

2. **Register the accessor**:

```typescript
import { storeAccessorRegistry } from './lib/dataBinding';
import { useMyNewStore } from '../../stores/myNewStore';

storeAccessorRegistry.registerAccessor({
  id: 'my-new-store',
  getSnapshot: () => useMyNewStore.getState(),
});
```

3. **Add subscription support** in `storeAccessors.ts`:

```typescript
export function subscribeToStore(storeId: StoreId, callback: () => void): () => void {
  switch (storeId) {
    // ... existing cases
    case 'my-new-store':
      return useMyNewStore.subscribe(callback);
    // ...
  }
}
```

### Error Handling

Bindings with errors fall back to `fallbackValue`:

```typescript
const binding = createBinding('b1', 'invalid-source', 'value', {
  fallbackValue: 'default',
});

const resolved = useResolvedBinding(binding);
// resolved.value === 'default'
// resolved.error === Error('Data source "invalid-source" not found')
```

### Manual Resolution (without React)

```typescript
import { resolveBinding } from './lib/dataBinding';

const binding = createBinding('b1', 'workspace.isLocked', 'isLocked');
const resolved = resolveBinding(binding);

console.log(resolved.value); // true or false
console.log(resolved.error); // Error object if resolution failed
```

### Creating Complex Computed Sources

```typescript
// 1. Register a custom aggregation transform
dataSourceRegistry.registerTransform({
  id: 'multiply-first-two',
  label: 'Multiply First Two',
  apply: (input: unknown) => {
    if (!Array.isArray(input) || input.length < 2) return 0;
    return Number(input[0]) * Number(input[1]);
  },
});

// 2. Create the computed source
dataSourceRegistry.registerSource(
  createComputedSource(
    'my-calculation',
    'My Custom Calculation',
    ['source-a', 'source-b'],
    'multiply-first-two'
  )
);
```

---

## Best Practices

1. **Use descriptive IDs**: `workspace.closedPanels.count` is better than `wpc`
2. **Always provide fallback values**: Prevents undefined errors in widgets
3. **Keep transforms pure**: No API calls, no state mutations
4. **Tag your sources**: Makes searching easier in the builder UI
5. **Document complex sources**: Add clear descriptions
6. **Test error cases**: Ensure bindings handle missing data gracefully

---

## Integration with Panel Builder (Task 50.4)

The Panel Builder should:

1. **List available sources** using `useDataSourceRegistry()`
2. **Create bindings** for widget properties
3. **Pass bindings to widgets** via props
4. **Serialize bindings** with panel compositions

Example builder integration:

```typescript
function BindingEditor({ widget, onUpdate }) {
  const { sources } = useDataSourceRegistry();

  const addBinding = (propName: string, sourceId: string) => {
    const binding = createBinding(
      `${widget.id}-${propName}`,
      sourceId,
      propName
    );

    onUpdate({
      ...widget,
      dataBindings: {
        ...widget.dataBindings,
        [propName]: binding,
      },
    });
  };

  // UI for selecting sources and creating bindings...
}
```

---

## Troubleshooting

**Q: My binding returns undefined**
- Check that the source ID is correct
- Verify the path exists in the store
- Add a fallback value

**Q: My computed source has a circular dependency**
- The resolver detects this and throws an error
- Check your dependency chain

**Q: Transform not found**
- Ensure the transform is registered before creating the binding
- Call `initializeCoreDataSources()` at startup

**Q: Store not whitelisted**
- Add the store to the StoreId type
- Register it in the storeAccessorRegistry
- Add subscription support

---

## Future Extensions (Phase 51.4)

Planned enhancements:
- API-based sources (with rate limiting)
- Plugin-contributed sources and transforms
- Advanced caching strategies
- GraphQL-style query builder
