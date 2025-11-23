# HUD Layout Designer

**Task 58: HUD Builder Integration**

Complete system for designing and rendering HUD layouts in game frontends using widget compositions.

## Overview

The HUD Layout Designer allows you to create custom HUD layouts for game worlds using a widget-based composition system. HUDs are built using the same Panel Builder infrastructure (Task 50) and data binding system (Task 51) as workspace panels.

## Quick Start

1. **Open HUD Designer**
   - Add the "HUD Designer" panel to your workspace
   - Or access via Game2D → "HUD Layout" button

2. **Select a World**
   - Choose which world's HUD you want to design
   - Each world can have multiple HUD layouts

3. **Design Your HUD**
   - Select a region (top, bottom, left, right, center)
   - Add widgets from the library
   - Configure widgets and bindings
   - Save your layout

4. **Test in Game**
   - Open Game2D
   - Toggle "New HUD" to enable the widget-based HUD system
   - Use the HUD switcher to test different layouts

## HUD Regions

HUDs are organized into 5 standard regions:

### Region Positions

| Region   | Position      | Typical Use                          |
|----------|---------------|--------------------------------------|
| **top**    | Top center    | Objectives, quest info, notifications |
| **bottom** | Bottom center | Actions, dialogue, controls          |
| **left**   | Center left   | Inventory, character stats           |
| **right**  | Center right  | Minimap, enemy info, party status    |
| **center** | Center        | Alerts, prompts, tutorials           |

### Region Properties

Each region supports:
- **Widget composition**: Grid-based widget layout
- **Enable/disable**: Toggle region visibility
- **Z-index**: Control layering for overlapping regions
- **Custom styles**: Additional CSS styling

## Widgets

Widgets are reusable UI components that can display data:

### Built-in Widgets

#### Text Widget
Display static or dynamic text.

```typescript
{
  widgetType: 'text',
  config: {
    content: 'Hello World',
    align: 'center',        // 'left' | 'center' | 'right'
    size: 'lg',             // 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl'
    weight: 'bold',         // 'normal' | 'medium' | 'semibold' | 'bold'
    color: '#ffffff'
  }
}
```

#### Metric Widget
Display a single metric/KPI with optional trend.

```typescript
{
  widgetType: 'metric',
  config: {
    label: 'Health',
    value: 100,              // Can be bound to data
    format: 'number',        // 'number' | 'currency' | 'percentage' | 'text'
    trend: 'up',             // 'up' | 'down' | 'neutral'
    trendValue: '+5',
    color: '#10b981'
  }
}
```

#### List Widget
Display a list of items.

```typescript
{
  widgetType: 'list',
  config: {
    title: 'Quest Log',
    items: [],               // Can be bound to data
    itemStyle: 'bordered'   // 'plain' | 'bordered' | 'striped'
  }
}
```

## Data Binding

Widgets can be connected to live data sources using the Task 51 data binding system.

### Example: Bind Metric to Session Data

```typescript
// 1. Define a data source
{
  id: 'player-health',
  name: 'Player Health',
  type: 'store',
  store: 'game-state',
  path: 'session.playerStats.health'
}

// 2. Bind to widget
widget.dataBindings = {
  value: {
    id: 'health-binding',
    sourceId: 'player-health',
    targetProperty: 'value',
    fallbackValue: 100
  }
}
```

### Available Data Sources

- **Store sources**: Access Zustand store data
  - `workspace` - Workspace state
  - `game-state` - Game session data
  - Custom stores via registration

- **Computed sources**: Derived data
  - Transform and combine multiple sources
  - Apply custom logic

## HUD Presets

Three built-in presets provide quick starting points:

### Story HUD
Minimal UI for story-focused gameplay.
- **Region**: Bottom bar only
- **Widgets**: Essential dialogue and choices
- **Use case**: Visual novels, story-driven games

### Debug HUD
Comprehensive metrics and debug info.
- **Regions**: Top, left, right
- **Widgets**: Metrics, lists, debug data
- **Use case**: Development and testing

### Playtest HUD
Balanced middle ground.
- **Regions**: Top and bottom
- **Widgets**: Common game metrics
- **Use case**: Playtesting, general gameplay

## Workflows

### Creating a HUD from Scratch

1. **Create Layout**
   - Click "New" in HUD Designer
   - Name your layout

2. **Add Regions**
   - Select a region (e.g., "top")
   - Click "Create Top Region"

3. **Add Widgets**
   - Browse widget library
   - Click widget to add to current region
   - Widgets auto-place in available grid space

4. **Configure Widgets**
   - Select widget on canvas
   - Edit properties in inspector
   - Add data bindings for live data

5. **Test & Iterate**
   - Save layout
   - Test in Game2D
   - Switch between layouts to compare

### Applying a Preset

1. **Select Preset**
   - Click "Presets" dropdown
   - Choose preset (Story/Debug/Playtest)

2. **Customize**
   - Preset creates base layout
   - Modify regions and widgets as needed

3. **Set as Default**
   - Click "Set Default" to use for this world
   - Or keep as alternate layout for testing

### Temporary Override (Dev Testing)

1. **Enable New HUD System**
   - In Game2D, toggle "New HUD"

2. **Switch Layouts**
   - Use HUD dropdown to select layout
   - Changes don't affect world defaults

3. **Reset**
   - Click "Reset" to return to default layout

## Advanced Features

### Grid System

Each region uses a grid-based layout:
- **Columns**: Typically 12 (adjustable)
- **Rows**: 2 for top/bottom, 8 for sides
- **Gap**: 8px spacing between widgets

Widget positions use grid units:
```typescript
position: {
  x: 0,        // Column (0-indexed)
  y: 0,        // Row (0-indexed)
  w: 3,        // Width in columns
  h: 2         // Height in rows
}
```

### Export/Import

Export layouts as JSON to share or backup:

```typescript
const layout = store.exportLayout(layoutId);
// Save to file or share

const imported = store.importLayout(jsonString);
// Imports with new ID to avoid conflicts
```

### Multiple Layouts Per World

Create different HUD configurations:
- Combat HUD (lots of metrics)
- Exploration HUD (minimal distractions)
- Cutscene HUD (hidden or minimal)

Switch between them programmatically or via UI.

## API Reference

### HudLayoutStore

```typescript
// Create layout
const layout = store.createLayout(worldId, 'My HUD');

// Add region
store.addRegion(layout.id, {
  region: 'top',
  composition: createComposition('top-bar', 'Top Bar', 12, 2),
  enabled: true
});

// Set as default
store.setDefaultLayout(worldId, layout.id);

// Apply preset
const presetLayout = store.applyPreset(worldId, 'story-hud');

// Get layouts
const layouts = store.getLayoutsForWorld(worldId);
const defaultLayout = store.getDefaultLayoutForWorld(worldId);
```

### HudRenderer

```typescript
// In Game2D or Game3D
<HudRenderer
  worldId={selectedWorldId}
  layoutId={hudLayoutOverride}  // Optional override
/>
```

## Integration with Game2D

The HUD system integrates seamlessly with Game2D:

1. **Toggle System**
   - "New HUD" button switches between old and new systems
   - Old system: Tool-based (Task 01)
   - New system: Widget-based (Task 58)

2. **Layout Switcher**
   - Appears when new HUD is active
   - Dropdown to select layouts
   - Presets menu for quick application
   - Reset button for defaults

3. **Live Updates**
   - Changes in HUD Designer reflect immediately
   - Data bindings update in real-time
   - No page refresh needed

## Best Practices

### Performance
- Keep widget count reasonable (< 20 per region)
- Use data bindings sparingly for frequently updating data
- Disable unused regions

### Design
- Follow region conventions (top for objectives, etc.)
- Keep critical info in center or bottom regions
- Use consistent styling across widgets

### Development
- Start with a preset, then customize
- Test with real game data early
- Create separate layouts for different game modes
- Use temporary overrides for A/B testing

### Maintenance
- Document custom widgets
- Version your layouts (use export/import)
- Keep region compositions focused and simple

## Troubleshooting

### Widget Not Appearing
- Check region is enabled
- Verify widget position is within grid bounds
- Check z-index if overlapping with other regions

### Data Not Updating
- Verify data source is registered
- Check binding configuration
- Ensure data path is correct
- Check for console errors

### Layout Not Saving
- Check browser console for errors
- Verify backend storage is accessible
- Try export/import as backup

## Future Enhancements

Planned features for future phases:
- Custom widget creation UI
- Visual data binding editor
- Animation and transition support
- Responsive HUD layouts (adapt to screen size)
- Template marketplace
- HUD analytics (visibility tracking)

## See Also

- [Task 50: Panel Builder System](claude-tasks/50-workspace-panel-system-enhancement.md)
- [Task 51: Data Binding System](claude-tasks/51-builder-data-sources.md)
- [Task 01: World HUD Layout Designer](claude-tasks/01-world-hud-layout-designer.md) (Old system)
- Widget Registry documentation
- Panel Composer documentation
