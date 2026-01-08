# Data Binding Demo Compositions

This guide explains how to use the demo compositions that showcase the Task 51 data binding system integrated with Task 50.4 Panel Builder widgets.

## Overview

The demo compositions demonstrate three key capabilities:

1. **Binding to Workspace State** - Display live data from the workspace store
2. **Binding to Game State** - Display live data from the game state store
3. **Using Transforms** - Apply data transformations (formatting, calculations, etc.)

## Available Demos

### 1. Workspace Status Dashboard

**Composition ID:** `demo-workspace-status`

**What it shows:**
- Workspace lock status (with transform to display "Locked" or "Unlocked")
- Count of closed panels
- Count of floating panels
- Count of active presets
- Searchable/sortable lists of closed and floating panels
- Active profile name

**Data Sources Used:**
- `workspace.isLocked` - Boolean lock state
- `workspace.closedPanels` - Array of closed panels
- `workspace.closedPanels.count` - Computed count
- `workspace.floatingPanels` - Array of floating panels
- `workspace.floatingPanels.count` - Computed count
- `workspace.presets` - Array of presets
- `workspace.presets.count` - Computed count
- `workspace.activeProfile.name` - Profile name

**Transforms Used:**
- `bool-to-lock-status` - Converts boolean to "Locked"/"Unlocked"

### 2. Game State Monitor

**Composition ID:** `demo-game-state`

**What it shows:**
- Current game mode (uppercase)
- World ID
- Session ID
- Full game context as formatted JSON

**Data Sources Used:**
- `game.context.mode` - Game mode string
- `game.context.worldId` - World ID
- `game.context.sessionId` - Session ID
- `game.context` - Full context object

**Transforms Used:**
- `uppercase` - Converts mode to uppercase
- `to-string` - Converts IDs to strings
- `to-json` - Formats full context as JSON

### 3. Mixed Data Dashboard

**Composition ID:** `demo-mixed-data`

**What it shows:**
- Combined workspace and game state data
- Organized into two sections with clear headings
- Demonstrates using multiple data sources in one panel

**Combines:**
- Workspace lock status, panel counts, and presets
- Game mode, world ID, and session ID

## How to Load a Demo

### In the Panel Builder UI

1. Open the Panel Builder
2. Click the "Load Demo" button (green button in the header)
3. Select one of the three demo compositions
4. The demo will load and automatically switch to preview mode

### Programmatically

```typescript
import { getDemoComposition, ComposedPanel } from '@lib/ui/composer';

function MyComponent() {
  const composition = getDemoComposition('demo-workspace-status');

  return <ComposedPanel composition={composition} />;
}
```

## Understanding the Structure

Each demo composition follows this pattern:

```typescript
{
  id: 'demo-id',
  name: 'Demo Name',
  layout: {
    columns: 12,  // 12-column grid
    rows: 8,      // 8 rows
    gap: 8,       // 8px gap between widgets
  },
  dataSources: [], // Usually empty - uses core sources
  widgets: [
    {
      id: 'w1',
      widgetType: 'metric', // or 'text', 'list'
      position: { x: 0, y: 0, w: 3, h: 2 }, // Grid placement
      config: {
        // Static widget configuration
        label: 'Metric Label',
        format: 'text',
      },
      dataBindings: {
        // Live data bindings
        value: createBinding(
          'b1',                    // Binding ID
          'workspace.isLocked',    // Source ID
          'value',                 // Target prop
          {
            transformId: 'bool-to-lock-status', // Optional transform
            fallbackValue: 'Unknown',           // Fallback if source fails
          }
        ),
      },
    },
  ],
}
```

## Key Concepts

### Data Bindings

A data binding connects a widget property to a data source:

- **Source ID**: The ID of the registered data source (e.g., `workspace.isLocked`)
- **Target Prop**: The widget property to bind to (e.g., `value`, `content`, `items`)
- **Transform** (optional): A function to transform the data before displaying
- **Fallback** (optional): Value to use if the source is unavailable

### Core Data Sources

These sources are automatically registered when `ComposedPanel` mounts:

**Workspace Sources:**
- `workspace.isLocked` - Boolean
- `workspace.closedPanels` - Array
- `workspace.closedPanels.count` - Number
- `workspace.floatingPanels` - Array
- `workspace.floatingPanels.count` - Number
- `workspace.presets` - Array
- `workspace.presets.count` - Number
- `workspace.activeProfile.name` - String

**Game State Sources:**
- `game.context` - Full context object
- `game.context.mode` - String
- `game.context.worldId` - String
- `game.context.sessionId` - String

### Available Transforms

Common transforms you can use:

- **Type Conversions**: `to-string`, `to-number`, `to-boolean`, `to-json`, `from-json`
- **String Operations**: `uppercase`, `lowercase`, `trim`, `string-length`
- **Boolean Display**: `bool-to-yes-no`, `bool-to-lock-status`, `bool-to-emoji`
- **Array Operations**: `array-length`, `array-first`, `array-last`, `array-join`
- **Math Operations**: `sum`, `average`, `min`, `max`, `abs`, `round`, `floor`, `ceil`
- **Logic**: `not`, `is-null`, `is-empty`

## Widget Types and Bindings

### MetricWidget

**Bindable Props:**
- `value` (string | number) - The metric value

**Example:**
```typescript
{
  widgetType: 'metric',
  config: {
    label: 'Panel Count',
    format: 'number',
  },
  dataBindings: {
    value: createBinding('b1', 'workspace.closedPanels.count', 'value'),
  },
}
```

### TextWidget

**Bindable Props:**
- `content` (string) - The text to display

**Example:**
```typescript
{
  widgetType: 'text',
  config: {
    align: 'center',
    size: 'lg',
    weight: 'bold',
  },
  dataBindings: {
    content: createBinding('b1', 'workspace.activeProfile.name', 'content'),
  },
}
```

### ListWidget

**Bindable Props:**
- `items` (any[]) - The array of items to display

**Example:**
```typescript
{
  widgetType: 'list',
  config: {
    title: 'Closed Panels',
    itemKey: 'id',
    searchable: true,
    sortable: true,
  },
  dataBindings: {
    items: createBinding('b1', 'workspace.closedPanels', 'items'),
  },
}
```

## Creating Your Own Composition

1. Define the layout (grid dimensions)
2. Add widgets with their static configuration
3. Create data bindings for dynamic properties
4. Register any custom data sources (if needed)
5. Test with live data

Example:

```typescript
import { createComposition, addWidget } from '@lib/ui/composer';
import { createBinding } from '@/lib/dataBinding';

// Create base composition
let myComposition = createComposition('my-panel', 'My Panel', 12, 8);

// Add a metric widget
myComposition = addWidget(
  myComposition,
  'metric',
  { x: 0, y: 0, w: 3, h: 2 },
  {
    label: 'Lock Status',
    format: 'text',
  }
);

// Add data binding to the widget
myComposition.widgets[0].dataBindings = {
  value: createBinding(
    'b1',
    'workspace.isLocked',
    'value',
    {
      transformId: 'bool-to-lock-status',
      fallbackValue: 'Unknown',
    }
  ),
};
```

## Troubleshooting

### Data Not Showing

1. Check that core data sources are initialized: `initializeCoreDataSources()` should be called in `ComposedPanel`
2. Verify the source ID exists: Check available sources in the registry
3. Check the workspace/game state stores have data
4. Look for binding errors in the console

### Transform Not Working

1. Verify the transform ID is correct (check `coreDataSources.ts`)
2. Ensure the transform is registered
3. Check that the input data type matches what the transform expects

### Widget Not Updating

1. Data bindings use React hooks that subscribe to store changes
2. Make sure the source data is actually changing
3. Check that the widget is using the bound prop correctly

## Next Steps

- Explore the source code of demo compositions in `demoCompositions.ts`
- Review the data binding system docs in `DATA_BINDING_GUIDE.md`
- Create your own custom compositions
- Add custom data sources for your specific use cases
- Create custom transforms for specialized data formatting
