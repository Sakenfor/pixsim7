# Panel Builder + Data Binding Integration Guide

This guide explains how **Task 50.4 (Panel Builder/Composer)** integrates with **Task 51 (Data Binding System)**.

## Overview

The integration connects two systems:
- **Panel Composer** (`lib/widgets/`) - Create custom panels from widgets
- **Data Binding System** (`lib/dataBinding/`) - Connect widgets to live data sources

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Panel Composition                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  Widget 1  │  │  Widget 2  │  │  Widget 3  │           │
│  │ (Metric)   │  │ (Chart)    │  │ (List)     │           │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘           │
│         │                │                │                  │
│         │ DataBinding    │ DataBinding    │ DataBinding     │
│         ▼                ▼                ▼                  │
│  ┌──────────────────────────────────────────────────┐      │
│  │         Data Binding System (Task 51)             │      │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐          │      │
│  │  │ Source  │  │ Source  │  │ Source  │          │      │
│  │  │   #1    │  │   #2    │  │   #3    │          │      │
│  │  └────┬────┘  └────┬────┘  └────┬────┘          │      │
│  └───────┼────────────┼────────────┼─────────────────┘      │
│          ▼            ▼            ▼                         │
│  ┌──────────────────────────────────────────────────┐      │
│  │           Zustand Stores (Live Data)              │      │
│  │     workspace • game-state • scene-builder        │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

### Panel Composer (Task 50.4)
- `lib/widgets/widgetRegistry.ts` - Widget definitions registry
- `lib/widgets/panelComposer.ts` - Panel composition logic (updated to use Task 51 types)
- `lib/widgets/ComposedPanel.tsx` - Renders compositions with live data
- `lib/widgets/examples/MetricWidget.tsx` - Example widget
- `lib/widgets/examples/ComposedPanelExample.tsx` - Complete example

### Data Binding (Task 51)
- `lib/dataBinding/index.ts` - Public API
- `lib/dataBinding/dataSourceRegistry.ts` - Data source registry
- `lib/dataBinding/dataResolver.ts` - Binding resolution
- `lib/dataBinding/storeAccessors.ts` - Safe store access
- `lib/dataBinding/useDataBindings.ts` - React hooks
- `lib/dataBinding/coreDataSources.ts` - Built-in sources

## Integration Points

### 1. Type Alignment

The `panelComposer.ts` now imports and uses the proper data binding types:

```typescript
import type { DataBinding, DataSourceDefinition } from '../dataBinding';

export interface WidgetInstance {
  id: string;
  widgetType: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
  dataBindings?: Record<string, DataBinding>; // ✅ Using Task 51 type
}

export interface PanelComposition {
  id: string;
  name: string;
  layout: GridLayout;
  widgets: WidgetInstance[];
  dataSources?: DataSourceDefinition[]; // ✅ Using Task 51 type
  // ...
}
```

### 2. Live Data Rendering

The `ComposedPanel` component connects compositions to live data:

```typescript
import { useBindingValues, dataSourceRegistry } from '../dataBinding';

function WidgetRenderer({ widget }) {
  // Resolve all data bindings for this widget
  const bindingValues = useBindingValues(widget.dataBindings);

  // Merge static config with live data
  const props = {
    config: widget.config,
    ...bindingValues, // Live data from stores
  };

  return <WidgetComponent {...props} />;
}
```

### 3. Widget Development

Widgets receive data through props:

```typescript
interface MetricWidgetProps extends WidgetProps {
  config: MetricWidgetConfig; // Static configuration
  value?: number; // Live data from binding
}

function MetricWidget({ config, value }: MetricWidgetProps) {
  // `value` is automatically updated when store data changes
  return <div>{value}</div>;
}
```

## Usage Example

### 1. Initialize

```typescript
import { initializeCoreDataSources } from './lib/dataBinding';
import { widgetRegistry } from './lib/widgets/widgetRegistry';
import { metricWidgetDefinition } from './lib/widgets/examples/MetricWidget';

// Initialize data sources (once at app startup)
initializeCoreDataSources();

// Register widgets
widgetRegistry.register(metricWidgetDefinition);
```

### 2. Create a Composition

```typescript
import { createComposition, addWidget } from './lib/widgets/panelComposer';
import { createStoreSource, createBinding } from './lib/dataBinding';

// Create composition
let composition = createComposition('my-dashboard', 'My Dashboard', 12, 6);

// Add data source
composition.dataSources = [
  createStoreSource(
    'panel-count',
    'Panel Count',
    'workspace',
    'closedPanels.length'
  ),
];

// Add widget
composition = addWidget(composition, 'metric', { x: 0, y: 0, w: 4, h: 2 }, {
  label: 'Closed Panels',
  color: '#ef4444',
});

// Bind widget to data source
composition.widgets[0].dataBindings = {
  value: createBinding('binding-1', 'panel-count', 'value', {
    fallbackValue: 0,
  }),
};
```

### 3. Render the Composition

```typescript
import { ComposedPanel } from './lib/widgets/ComposedPanel';

function MyDashboard() {
  return <ComposedPanel composition={composition} />;
}
```

## Data Flow

1. **Composition Creation**
   - Define grid layout
   - Add widgets with positions
   - Add data sources
   - Create bindings between widgets and sources

2. **Data Source Registration**
   - `ComposedPanel` registers all data sources from the composition
   - Sources are added to the global `dataSourceRegistry`
   - Sources can be store-based, static, or computed

3. **Binding Resolution**
   - Each widget's `dataBindings` are resolved by `useBindingValues` hook
   - Hook subscribes to relevant Zustand stores
   - When store data changes, hook re-resolves and triggers re-render

4. **Widget Rendering**
   - Widget receives both static `config` and live data as props
   - Widget re-renders automatically when bound data changes
   - Errors are handled gracefully with fallback values

## Built-in Data Sources

The system comes with pre-registered data sources for common use cases:

**Workspace:**
- `workspace.isLocked` - Workspace lock state
- `workspace.closedPanels.count` - Number of closed panels
- `workspace.floatingPanels.count` - Number of floating panels
- `workspace.presets.count` - Number of saved presets

**Game State:**
- `game.context.mode` - Current game mode
- `game.context.worldId` - Current world ID
- `game.context.sessionId` - Current session ID

See `lib/dataBinding/coreDataSources.ts` for the full list.

## Creating Custom Widgets

### 1. Define the Widget Component

```typescript
import type { WidgetProps, WidgetDefinition } from './lib/widgets/widgetRegistry';

interface MyWidgetConfig {
  title?: string;
  color?: string;
}

interface MyWidgetProps extends WidgetProps {
  config: MyWidgetConfig;
  data?: any; // From data binding
}

function MyWidget({ config, data }: MyWidgetProps) {
  return (
    <div>
      <h3>{config.title}</h3>
      <pre>{JSON.stringify(data)}</pre>
    </div>
  );
}
```

### 2. Create Widget Definition

```typescript
export const myWidgetDefinition: WidgetDefinition = {
  id: 'my-widget',
  type: 'custom',
  title: 'My Custom Widget',
  component: MyWidget,
  category: 'custom',

  configSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Title' },
      color: { type: 'string', title: 'Color', default: '#000' },
    },
  },

  defaultConfig: {
    color: '#000',
  },

  requiresData: true,
  minWidth: 200,
  minHeight: 150,

  description: 'My custom widget',
  tags: ['custom'],
};
```

### 3. Register the Widget

```typescript
import { widgetRegistry } from './lib/widgets/widgetRegistry';

widgetRegistry.register(myWidgetDefinition);
```

## Creating Custom Data Sources

### Store-Based Source

```typescript
import { dataSourceRegistry, createStoreSource } from './lib/dataBinding';

dataSourceRegistry.registerSource(
  createStoreSource(
    'my-source',
    'My Data Source',
    'workspace', // Store ID
    'some.nested.path', // Path within store
    {
      description: 'Description of what this provides',
      tags: ['custom'],
    }
  )
);
```

### Static Source

```typescript
import { createStaticSource } from './lib/dataBinding';

dataSourceRegistry.registerSource(
  createStaticSource(
    'static-value',
    'Static Value',
    { foo: 'bar' },
    { description: 'A static value' }
  )
);
```

### Computed Source

```typescript
import { createComputedSource } from './lib/dataBinding';

// First register dependencies
dataSourceRegistry.registerSource(createStoreSource('dep1', 'Dep 1', 'workspace', 'value1'));
dataSourceRegistry.registerSource(createStoreSource('dep2', 'Dep 2', 'workspace', 'value2'));

// Then create computed source
dataSourceRegistry.registerSource(
  createComputedSource(
    'computed-total',
    'Computed Total',
    ['dep1', 'dep2'],
    'sum' // Transform ID
  )
);
```

## Best Practices

### Widget Development

1. **Accept data through props** - Don't access stores directly
2. **Use fallback values** - Handle missing/undefined data gracefully
3. **Keep config separate from data** - Static settings in config, dynamic values from bindings
4. **Support multiple data props** - Allow binding multiple data sources

### Data Binding

1. **Use descriptive IDs** - `workspace.closedPanels.count` is better than `wpc`
2. **Always provide fallbacks** - Prevents undefined errors
3. **Tag your sources** - Makes searching easier in builder UI
4. **Keep transforms pure** - No side effects, same input = same output

### Composition Design

1. **Validate compositions** - Use `validateComposition()` before rendering
2. **Export/import compositions** - Allow saving/loading custom dashboards
3. **Version your schemas** - Include version field for future migrations
4. **Document data requirements** - Clearly specify what data each widget needs

## Troubleshooting

**Widget shows "Unknown widget: X"**
- Widget not registered. Call `widgetRegistry.register(widgetDefinition)`

**Data binding returns undefined**
- Check data source ID is correct
- Verify path exists in store
- Add fallback value to binding

**Composition validation fails**
- Use `validateComposition()` to see detailed errors
- Check for widget overlaps
- Verify all data sources exist

**Widget doesn't update when data changes**
- Ensure you're using `useBindingValues` hook
- Check that data source is properly registered
- Verify store is whitelisted in `storeAccessors.ts`

## Next Steps

1. **Build the Visual Builder UI** - Drag-drop interface for creating compositions
2. **Add more built-in widgets** - Charts, tables, forms, etc.
3. **Implement API-based data sources** - Fetch data from backend
4. **Add composition marketplace** - Share and discover custom panels
5. **Support responsive layouts** - Breakpoints and mobile-friendly grids

## References

- [Task 50.4 Spec](../../../claude-tasks/50-workspace-panel-system-enhancement.md)
- [Task 51 Spec](../../../claude-tasks/51-builder-data-sources.md)
- [Data Binding Guide](../dataBinding/DATA_BINDING_GUIDE.md)
- [Example Implementation](./examples/ComposedPanelExample.tsx)
