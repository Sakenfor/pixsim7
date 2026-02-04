# Settings Feature

This feature provides the Settings panel UI and the infrastructure for registering settings from across the application.

## Architecture Overview

The settings system uses **two registries** that work together:

```
┌─────────────────────────────────────────────────────────────────┐
│                        SETTINGS PANEL                           │
├──────────────────────────┬──────────────────────────────────────┤
│ Sidebar (navigation)     │ Content Area                         │
│                          │                                      │
│ settingsRegistry         │ DynamicSettingsPanel                 │
│ (component-based)        │ (schema-driven)                      │
│                          │                                      │
│ • id, label, icon        │ • Reads from settingsSchemaRegistry  │
│ • order                  │ • Auto-renders fields                │
│ • component              │ • Supports tabs, groups              │
│                          │ • Toggle, text, number, select, etc. │
└──────────────────────────┴──────────────────────────────────────┘
```

### 1. Component Registry (`settingsRegistry`)

**Purpose:** Provides sidebar navigation entries

**Location:** `lib/core/registry.ts`

```typescript
settingsRegistry.register({
  id: 'my-settings',
  label: 'My Settings',
  icon: '⚙️',
  component: MySettingsComponent,
  order: 50,
});
```

### 2. Schema Registry (`settingsSchemaRegistry`)

**Purpose:** Declarative field definitions with automatic UI generation

**Location:** `lib/core/settingsSchemaRegistry.ts`

```typescript
settingsSchemaRegistry.register({
  categoryId: 'my-settings',
  category: { label: 'My Settings', icon: '⚙️', order: 50 },
  groups: [
    {
      id: 'general',
      title: 'General',
      fields: [
        { id: 'enabled', type: 'toggle', label: 'Enabled', defaultValue: true },
        { id: 'name', type: 'text', label: 'Name', defaultValue: '' },
      ],
    },
  ],
  useStore: useMySettingsStore,
});
```

## The Bridge Pattern (Recommended)

Modern settings modules use BOTH registries together:

1. **Component registry** → Provides sidebar navigation
2. **Schema registry** → Provides the actual settings UI
3. **Component renders** → `<DynamicSettingsPanel categoryId="..." />`

### Example: Creating a New Settings Module

**Step 1: Create the schema** (`lib/schemas/my.settings.tsx`)

```typescript
import { settingsSchemaRegistry, type SettingGroup } from '../core';

const generalGroup: SettingGroup = {
  id: 'general',
  title: 'General Settings',
  fields: [
    {
      id: 'enabled',
      type: 'toggle',
      label: 'Enable Feature',
      description: 'Turn this feature on or off.',
      defaultValue: true,
    },
  ],
};

function useMySettingsStore() {
  const enabled = useMyStore((s) => s.enabled);
  const setEnabled = useMyStore((s) => s.setEnabled);

  return {
    get: (id: string) => (id === 'enabled' ? enabled : undefined),
    set: (id: string, value: any) => {
      if (id === 'enabled') setEnabled(Boolean(value));
    },
    getAll: () => ({ enabled }),
  };
}

export function registerMySettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'my-feature',
    category: { label: 'My Feature', icon: '✨', order: 50 },
    groups: [generalGroup],
    useStore: useMySettingsStore,
  });
}
```

**Step 2: Create the module** (`components/modules/MySettings.tsx`)

```typescript
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { settingsRegistry } from '../../lib/core/registry';
import { registerMySettings } from '../../lib/schemas/my.settings';

// Register schema (can also be done via feature module initialize())
registerMySettings();

export function MySettings() {
  return <DynamicSettingsPanel categoryId="my-feature" />;
}

// Register for sidebar navigation
settingsRegistry.register({
  id: 'my-feature',
  label: 'My Feature',
  icon: '✨',
  component: MySettings,
  order: 50,
});
```

**Step 3: Add to index** (`components/modules/index.ts`)

```typescript
import './MySettings';
```

## Field Types

The schema system supports these field types:

| Type | Description | Additional Props |
|------|-------------|------------------|
| `toggle` | Boolean switch | - |
| `text` | Text input | `placeholder` |
| `number` | Numeric input | `min`, `max`, `step` |
| `select` | Dropdown | `options: { value, label }[]` |
| `range` | Slider | `min`, `max`, `step` |
| `custom` | Custom component | `component: React.ComponentType` |

## Conditional Rendering

Groups and fields can be conditionally shown:

```typescript
const adminGroup: SettingGroup = {
  id: 'admin',
  title: 'Admin Settings',
  showWhen: (values) => values.__isAdmin === true,
  fields: [...],
};
```

The `values` object includes all field values plus:
- `__isAdmin` - Whether current user is admin
- `__userRole` - Current user's role

## When to Use Custom Components

Use the bridge pattern (DynamicSettingsPanel) for most settings.

Use **custom component-only** when the UI needs:
- Complex interactions (drag-drop, cards, modals)
- Dynamic content from registries
- Master-detail layouts

Examples of legitimate custom components:
- `GeneralSettings` - Control center card selection
- `UnifiedPanelsSettings` - Master-detail panel browser
- `PluginsSettings` - Plugin cards with family grouping
- `AnalyzersSettings` - Instance management with forms

## File Structure

```
features/settings/
├── components/
│   ├── modules/           # Settings modules (bridge pattern or custom)
│   │   ├── index.ts       # Imports all modules to register them
│   │   ├── ContextSettings.tsx
│   │   ├── GenerationSettings.tsx
│   │   └── ...
│   ├── shared/            # Shared components
│   │   ├── DynamicSettingsPanel.tsx
│   │   └── SettingFieldRenderer.tsx
│   └── SettingsPanel.tsx  # Main settings panel
├── lib/
│   ├── core/              # Core infrastructure
│   │   ├── registry.ts    # Component registry
│   │   ├── settingsSchemaRegistry.ts
│   │   └── types.ts
│   └── schemas/           # Schema definitions
│       ├── context.settings.tsx
│       ├── generation.settings.tsx
│       └── ...
└── stores/                # UI state stores
```

## Integration with Feature Modules

Settings can be registered via feature module initialization:

```typescript
// features/myFeature/module.ts
import { registerMySettings } from '@features/settings/lib/schemas/my.settings';

export const myFeatureModule: Module = {
  id: 'my-feature',
  name: 'My Feature',

  async initialize() {
    registerMySettings();
  },
};
```

This ensures settings are registered at the right time in the app lifecycle.

## Avoiding Circular Dependencies

If your schema registration depends on other registries (e.g., node types, widgets),
defer the registration to when the component mounts:

```typescript
let registered = false;

export function MySettings() {
  useEffect(() => {
    if (!registered) {
      registered = true;
      registerMySettings();
    }
  }, []);

  return <DynamicSettingsPanel categoryId="my-feature" />;
}
```

## Summary

| Pattern | When to Use |
|---------|-------------|
| **Bridge (recommended)** | Most settings - simple fields, toggles, selects |
| **Custom component** | Complex UI - cards, modals, master-detail, drag-drop |
| **Deferred registration** | When schema depends on other registries |
