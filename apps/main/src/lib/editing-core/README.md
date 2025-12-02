# Editing-Core Library

Generic, framework-agnostic foundation for building configurable UI surfaces with presets, data binding, and widget registries.

## What It Is

**Editing-core** provides the building blocks for creating user-editable UI systems like overlay editors, HUD layout designers, and other configurable surfaces. It handles:

- **Unified configuration types** - Serializable JSON configs for widgets, layouts, and presets
- **Data binding system** - Connect widget properties to dynamic data sources (static values, property paths, or functions)
- **Widget registry** - Register widget types with factories, metadata, and default configs
- **Editor utilities** - Undo/redo hooks, property path helpers, validation

## What It Is NOT

- ❌ **Not domain-specific** - No game logic, no world state, no NPC behavior
- ❌ **Not required for all UI** - Static UIs (menus, status bars) don't need this
- ❌ **Not a React component library** - It's the data model layer that React UIs consume

**Use editing-core when:**
- ✅ Users need to customize layout/widgets
- ✅ You want portable presets across worlds/sessions
- ✅ You're building an editor UI to manipulate configs

**Don't use editing-core when:**
- ❌ Building simple static UI
- ❌ No user customization needed
- ❌ Pure game logic that doesn't need visual editing

## Features

- **Unified Configuration Model** - `UnifiedSurfaceConfig` and `UnifiedWidgetConfig` types
- **Generic Data Binding** - Three binding types: `static`, `path`, `function`
- **Widget Type Registry** - Central registration system for widget types across all surfaces
- **Component Type Isolation** - Multiple surfaces (`'overlay'`, `'hud'`, `'interaction'`) share the same registry
- **Undo/Redo Support** - Generic `useUndoRedo<T>` hook for any config type
- **Property Path Utilities** - Safe nested property access and manipulation

## Quick Start

### Using Data Bindings

```typescript
import { createBindingFromValue, resolveDataBinding } from '@/lib/editing-core';

// Static binding
const staticBinding = createBindingFromValue('label', 'Click Me');

// Path binding (reads from context object)
const pathBinding = { kind: 'path', path: 'user.name' };

// Resolve binding with context
const context = { user: { name: 'Alice' } };
const value = resolveDataBinding(pathBinding, context); // 'Alice'
```

### Registering a Widget Type

```typescript
import { registerWidget, type WidgetDefinition } from '@/lib/editing-core';

registerWidget({
  type: 'my-badge',
  displayName: 'Custom Badge',
  icon: '🏷️',
  defaultConfig: {
    id: '',
    type: 'my-badge',
    position: { anchor: 'top-left', offset: { x: 10, y: 10 } },
    props: { variant: 'default' },
  },
  factory: (config, runtimeOptions) => {
    // Return runtime widget instance
    return {
      id: config.id,
      type: config.type,
      render: () => <MyBadgeComponent {...config.props} />,
    };
  },
});
```

### Using Undo/Redo

```typescript
import { useUndoRedo } from '@/lib/editing-core';

function MyEditor() {
  const [config, setConfig] = useState<MyConfig>(initialConfig);
  const { updateWithHistory, undo, redo, canUndo, canRedo } = useUndoRedo(config, setConfig);

  const handleChange = (newConfig: MyConfig) => {
    updateWithHistory(newConfig);
  };

  return (
    <>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
      {/* Your editor UI */}
    </>
  );
}
```

## Architecture

```
lib/editing-core/
├── unifiedConfig.ts         # Core config types (UnifiedSurfaceConfig, UnifiedWidgetConfig)
├── dataBinding.ts           # DataBinding<T> type and helpers
├── dataBindingResolver.ts   # Runtime binding resolution
├── bindingAdapters.ts       # Convert between binding formats
├── registry/
│   └── widgetRegistry.ts    # Widget type registration and factory system
├── hooks/
│   └── useUndoRedo.ts       # Generic undo/redo hook
├── utils/
│   └── propertyPath.ts      # Property path parsing and access
└── index.ts                 # Public exports
```

## Key Concepts

### Component Types

Each surface registers widgets with a `componentType` to differentiate its widget instances:

```typescript
// Overlay system
registerWidget({
  type: 'badge',
  // ... other fields
  factory: (config, runtimeOptions) => {
    // When called with componentType: 'overlay', creates OverlayWidget
    return createBadgeWidget(config);
  }
});

// Usage in overlay
createWidget('badge', config, { componentType: 'overlay' });

// Usage in HUD (could reuse same 'badge' type)
createWidget('badge', hudConfig, { componentType: 'hud' });
```

**Key insight:** The `type` field is global across all surfaces. `componentType` differentiates which surface is using it.

### Unified Configuration

All editable surfaces convert to/from `UnifiedSurfaceConfig`:

```typescript
interface UnifiedSurfaceConfig {
  version: string;
  componentType: string;  // 'overlay', 'hud', 'interaction', etc.
  widgets: UnifiedWidgetConfig[];
  metadata?: Record<string, unknown>;
}
```

This allows:
- **Preset portability** - Export overlay configs and reimport them
- **Version migrations** - Handle breaking changes with version field
- **Cross-editor compatibility** - HUD and Overlay can share widget types

### Data Binding Types

Three binding kinds for maximum flexibility:

1. **Static** - Fixed value, no dynamic updates
   ```typescript
   { kind: 'static', staticValue: 'Hello World' }
   ```

2. **Path** - Read from context object using property path
   ```typescript
   { kind: 'path', path: 'session.player.name' }
   ```

3. **Function** - Custom resolver (advanced, not serializable)
   ```typescript
   { kind: 'function', resolve: (ctx) => ctx.computedValue }
   ```

## Current Consumers

### Overlay System ✅ COMPLETE
**Location:** `apps/main/src/lib/overlay/`

- Registers 9 widget types: `badge`, `panel`, `upload`, `button`, `menu`, `tooltip`, `video-scrub`, `progress`, `comic-panel`
- Uses `componentType: 'overlay'`
- Converts between `OverlayConfiguration` ↔ `UnifiedSurfaceConfig`
- Overlay Editor uses widget registry for drag-and-drop

### HUD System 🔄 IN PROGRESS
**Location:** `apps/main/src/lib/gameplay-ui-core/`

- Uses `componentType: 'hud'`
- `HudLayoutEditor` uses `useUndoRedo` hook
- Moving toward unified configs for preset portability

## Documentation

- **[Editable UI Architecture](../../../docs/EDITABLE_UI_ARCHITECTURE.md)** - Comprehensive architectural guide
- **[Overlay System](../overlay/)** - Complete overlay integration example
- **[HUD Integration](../gameplay-ui-core/)** - HUD-specific config layer

## Usage Guidelines

### When to Adopt Editing-Core

✅ **Good reasons:**
- Building a new editor UI (timeline editor, interaction designer, etc.)
- Need preset/profile system for configs
- Users should customize layout/widgets
- Want to reuse existing widget types

❌ **Bad reasons:**
- "Everything should use the same system" (no - static UIs are fine)
- Building game logic that doesn't need visual editing
- One-off tool that doesn't need presets

### Adoption Checklist

1. **Define your `componentType`** - e.g., `'timeline'`, `'interaction'`, `'my-editor'`
2. **Decide on widgets** - Can you reuse existing types (badge, panel) or need new ones?
3. **Create converters** - `YourConfig → UnifiedSurfaceConfig` and back
4. **Register widgets** - Call `registerWidget()` for any new types
5. **Wire up editor** - Use `useUndoRedo`, widget registry, and binding resolver

### Cross-Surface Widget Reuse

You can reuse widget types across surfaces:

```typescript
// Register once with generic factory
registerWidget({
  type: 'badge',
  factory: (config, runtimeOptions) => {
    // Factory inspects componentType to specialize behavior
    if (runtimeOptions?.componentType === 'overlay') {
      return createOverlayBadge(config);
    } else if (runtimeOptions?.componentType === 'hud') {
      return createHudBadge(config);
    }
    return createGenericBadge(config);
  },
});
```

Or register specialized versions:

```typescript
// Overlay-specific badge
registerWidget({ type: 'overlay-badge', /* ... */ });

// HUD-specific badge
registerWidget({ type: 'hud-badge', /* ... */ });
```

## Anti-Patterns

### ❌ Don't: Embed game logic in widget factories

```typescript
// BAD: Widget factory computing NPC affinity
factory: (config) => ({
  render: () => {
    const npc = getNpc(config.props.npcId);  // ❌ Domain logic in widget
    return <Badge>{npc.affinity}</Badge>;
  }
})
```

**Instead:** Use data bindings to pass computed values from outside:

```typescript
// GOOD: Editor computes value, widget just renders it
const context = { npcAffinity: getNpc(npcId).affinity };
const value = resolveDataBinding(widget.labelBinding, context);
```

### ❌ Don't: Create new registry for every feature

If you're tempted to create `myFeatureRegistry.ts`, ask:
- Is this for user-editable widgets/layouts? → Use editing-core widget registry
- Is this for dev tools? → Use devtools registry
- Is this for panels? → Use panel registry

Only create a new registry if you're building a genuinely new plugin family.

### ❌ Don't: Mutate configs directly

```typescript
// BAD: Direct mutation breaks undo/redo
config.widgets[0].position.x = 100;
```

**Instead:** Use immutable updates with undo/redo:

```typescript
// GOOD: Immutable update with history
updateWithHistory({
  ...config,
  widgets: config.widgets.map((w, i) =>
    i === 0 ? { ...w, position: { ...w.position, x: 100 } } : w
  ),
});
```

## Contributing

When adding new features to editing-core:

1. **Keep it generic** - No domain-specific types (no `NpcWidget`, `QuestPanel`, etc.)
2. **Stay serializable** - All config types must be JSON-serializable
3. **Document componentType usage** - Show examples for overlay/HUD/your-surface
4. **Add to this README** - Update examples and architecture section

For domain-specific logic, build a layer on top:
- Overlay: `lib/overlay/overlayConfig.ts`, `lib/overlay/overlayWidgetRegistry.ts`
- HUD: `lib/gameplay-ui-core/hudConfig.ts`
- Your feature: `lib/my-feature/myFeatureConfig.ts`

## Examples

### Complete Overlay Integration

See `apps/main/src/lib/overlay/overlayWidgetRegistry.ts` for a full example of:
- Registering 9 widget types
- Converting between overlay-specific and unified configs
- Using `componentType: 'overlay'` consistently
- Extracting data bindings from unified configs

### HUD Integration (In Progress)

See `apps/main/src/lib/gameplay-ui-core/hudConfig.ts` for:
- HUD-specific config types (`HudSurfaceConfig`, `HudToolConfig`)
- Conversion to `UnifiedSurfaceConfig` with `componentType: 'hud'`
- Integration with HUD editor and profile system

## FAQ

**Q: Should I put my widget in editing-core?**
A: No. Widget *types* are registered with editing-core, but widget *implementations* live in feature directories (`lib/overlay/widgets/`, `lib/hud/widgets/`).

**Q: Can I use editing-core without React?**
A: The config types and data binding system are framework-agnostic. Only `useUndoRedo` requires React. The registry and binding resolver work in any JavaScript environment.

**Q: Why is componentType a string instead of a union type?**
A: To allow extensibility without editing core types. New surfaces can define their own `componentType` without modifying editing-core.

**Q: Can I have multiple surfaces with the same componentType?**
A: Technically yes, but not recommended. Use different `componentType` values for different surfaces, or use metadata fields to differentiate.

**Q: How do I migrate old configs to new versions?**
A: Check the `version` field in `UnifiedSurfaceConfig` and write migration functions. See overlay's preset manager for examples.
