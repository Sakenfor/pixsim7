# World Tools Feature

World tooling for debugging, editing, and analyzing game worlds in PixSim7.

## Overview

The World Tools feature provides a plugin-based system for extending the editor with world-centric debugging and analysis tools. It includes:

- **Plugin System**: Extensible architecture for world tool plugins
- **HUD Management**: Per-world HUD layout configuration, profiles, and presets
- **Panel Components**: UI components for rendering world tools
- **Built-in Tools**: Collection of standard world debugging tools

## Structure

```
features/worldTools/
├── components/          # UI components
│   ├── WorldToolsPanel.tsx          # Main panel for rendering world tools
│   └── WorldVisualRolesPanel.tsx    # Panel for binding assets to world roles
├── plugins/             # World tool plugins
│   ├── index.ts                     # Plugin barrel export
│   ├── inventory.tsx                # Inventory tool
│   ├── questLog.tsx                 # Quest log tool
│   ├── relationshipDashboard.tsx    # Relationship visualization
│   ├── worldInfo.tsx                # World metadata display
│   ├── moodDebug.tsx                # NPC mood debugging
│   ├── sessionFlagsDebug.tsx        # Session flags inspector
│   ├── turnHistoryDebug.tsx         # Turn history viewer
│   ├── npcBrainDebug.tsx            # NPC brain state inspector
│   ├── worldManifestDebug.tsx       # World manifest viewer
│   ├── npcPresenceDebug.tsx         # NPC presence tracking
│   ├── relationshipDiffDebug.tsx    # Relationship change tracking
│   └── worldThemeEditor.tsx         # World theme editor
├── lib/                 # Core library
│   ├── types.ts                     # Type definitions and registry
│   ├── context.ts                   # World tool context types
│   ├── registry.ts                  # Plugin registration
│   ├── hudLayout.ts                 # HUD layout resolution
│   ├── hudLayoutVariants.ts         # Layout variants and inheritance
│   ├── hudPresets.ts                # HUD preset management
│   ├── hudProfiles.ts               # HUD profile management
│   └── playerHudPreferences.ts      # Player-specific HUD preferences
└── index.ts             # Feature barrel export
```

## Usage

### Importing World Tools

```typescript
// Import from feature barrel
import {
  WorldToolsPanel,
  WorldVisualRolesPanel,
  worldToolRegistry
} from '@features/worldTools';

// Import specific lib modules
import type { WorldToolPlugin, WorldToolContext } from '@features/worldTools/lib/types';
import { resolveHudLayout } from '@features/worldTools/lib/hudLayout';

// Import individual plugins
import { inventoryTool } from '@features/worldTools/plugins/inventory';
```

### Using the World Tools Panel

```typescript
import { WorldToolsPanel } from '@features/worldTools';
import { worldToolRegistry } from '@features/worldTools/lib/registry';

function MyGameView() {
  const context: WorldToolContext = {
    session: gameSession,
    sessionFlags: flags,
    world: worldDetail,
    location: currentLocation,
    npcs: npcList,
    slots: slotAssignments,
    time: { day: 1, hour: 12 }
  };

  const tools = worldToolRegistry.getVisible(context);

  return <WorldToolsPanel context={context} tools={tools} />;
}
```

### Creating a Custom World Tool Plugin

```typescript
// my-custom-tool.tsx
import type { WorldToolPlugin } from '@features/worldTools/lib/types';

export const myCustomTool: WorldToolPlugin = {
  id: 'my-custom-tool',
  name: 'Custom Tool',
  description: 'My custom world analysis tool',
  icon: '🔧',
  category: 'debug',

  // Optional visibility predicate
  whenVisible: (context) => {
    return context.session !== null && context.world.id !== undefined;
  },

  // Render function
  render: (context) => {
    return (
      <div>
        <h3>Custom Tool</h3>
        <p>World ID: {context.world.id}</p>
        <p>Session ID: {context.session?.id}</p>
      </div>
    );
  },
};
```

### Registering a Custom Tool

```typescript
import { worldToolRegistry } from '@features/worldTools/lib/registry';
import { myCustomTool } from './my-custom-tool';

// Register the tool
worldToolRegistry.register(myCustomTool);

// The tool will now appear in WorldToolsPanel when its visibility condition is met
```

## HUD Layout Management

The World Tools feature includes comprehensive HUD layout management:

### Basic HUD Layout

```typescript
import { resolveHudLayout } from '@features/worldTools/lib/hudLayout';
import { worldToolRegistry } from '@features/worldTools/lib/registry';

const context: WorldToolContext = /* ... */;
const tools = worldToolRegistry.getAll();

const layout = resolveHudLayout({
  worldDetail,
  tools,
  context,
  viewMode: 'hud-heavy'
});

// layout.regions contains tools grouped by HUD region
layout.regions.forEach(region => {
  console.log(`Region ${region.region}:`, region.tools);
});
```

### HUD Profiles

Players can switch between different HUD profiles (e.g., "default", "minimal", "streamer"):

```typescript
import {
  getAvailableProfiles,
  setActiveProfile,
  getActiveProfileId
} from '@features/worldTools/lib/hudProfiles';

// Get available profiles
const profiles = getAvailableProfiles();

// Set active profile for a world
setActiveProfile(worldId, 'minimal');

// Get current active profile
const activeProfileId = getActiveProfileId(worldId);
```

### HUD Presets

Save and load HUD layout configurations:

```typescript
import {
  createPreset,
  getHudPreset,
  listHudPresets
} from '@features/worldTools/lib/hudPresets';

// Create a new preset
const preset = createPreset({
  name: 'My Layout',
  description: 'Custom HUD layout',
  placements: [
    { toolId: 'inventory', region: 'left', order: 0 },
    { toolId: 'quest-log', region: 'right', order: 0 }
  ]
});

// List all presets
const presets = listHudPresets();

// Get a specific preset
const preset = getHudPreset('preset-id');
```

## Built-in World Tools

The feature includes several built-in debugging and analysis tools:

| Tool | ID | Category | Description |
|------|-----|----------|-------------|
| Inventory | `inventory` | inventory | Manage items and equipment |
| Quest Log | `quest-log` | quest | Track active and completed quests |
| Relationship Dashboard | `relationship-dashboard` | character | Visualize NPC relationships |
| World Info | `world-info` | world | Display world metadata |
| Mood Debug | `mood-debug` | debug | NPC mood state inspector |
| Session Flags Debug | `session-flags-debug` | debug | Session flags viewer |
| Turn History Debug | `turn-history-debug` | debug | Game turn history |
| NPC Brain Debug | `npc-brain-debug` | debug | NPC AI state inspector |
| World Manifest Debug | `world-manifest-debug` | debug | World manifest viewer |
| NPC Presence Debug | `npc-presence-debug` | debug | NPC presence tracking |
| Relationship Diff Debug | `relationship-diff-debug` | debug | Relationship change tracking |
| World Theme Editor | `world-theme-editor` | utility | Edit world theme settings |

## Components

### WorldToolsPanel

Main panel component for rendering world tools.

**Props:**
- `context: WorldToolContext` - Current world context
- `tools: WorldToolPlugin[]` - Array of visible tools

**Variants:**
- `WorldToolsPanel` - Standard panel with toolbar
- `CompactWorldToolsPanel` - Compact panel with tabs
- `GridWorldToolsPanel` - Grid layout showing multiple tools

### WorldVisualRolesPanel

Panel for binding gallery assets to world-specific visual roles (portraits, POV, backgrounds, etc.).

Used for associating visual assets with characters and locations in a world.

## Type Reference

### WorldToolPlugin

```typescript
interface WorldToolPlugin {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category?: 'character' | 'world' | 'quest' | 'inventory' | 'debug' | 'utility';
  whenVisible?: (context: WorldToolContext) => boolean;
  render: (context: WorldToolContext) => ReactNode;
  onMount?: (context: WorldToolContext) => void | Promise<void>;
  onUnmount?: () => void | Promise<void>;
}
```

### WorldToolContext

```typescript
interface WorldToolContext {
  session: GameSessionDTO | null;
  sessionFlags: Record<string, any>;
  world: GameWorldDetail;
  location: GameLocationDetail | null;
  npcs: NpcPresenceDTO[];
  slots: NpcSlotAssignment[];
  time: WorldTime;
}
```

### HudToolPlacement

```typescript
interface HudToolPlacement {
  toolId: string;
  region: 'left' | 'right' | 'top' | 'bottom' | 'overlay';
  order?: number;
  visibleWhen?: HudVisibilityCondition;
  size?: 'compact' | 'normal' | 'expanded';
  defaultCollapsed?: boolean;
  zIndex?: number;
  groupId?: string;
  customClassName?: string;
}
```

## Integration Points

The World Tools feature integrates with:

- **Game2D Route**: Primary consumer of world tools for in-game debugging
- **HUD Feature** (`@features/hud`): Provides HUD layout management
- **Panel System**: Registered via `features/panels/definitions/*` auto-discovery
- **Gizmo Surface Registry**: WorldToolsPanel registered as a gizmo surface

## Shared Systems

The following remain in their current locations:

- `apps/main/src/lib/gameplay-ui-core/*` - Generic HUD/overlay configuration
- `apps/main/src/lib/gizmos/*` - Gizmo surface registries
- `apps/main/src/lib/plugins/*` - Plugin system infrastructure

## Migration Notes

This feature was created by consolidating:
- `apps/main/src/lib/worldTools/*` → `features/worldTools/lib/`
- `apps/main/src/plugins/worldTools/*` → `features/worldTools/plugins/`
- `apps/main/src/components/game/panels/WorldToolsPanel.tsx` → `features/worldTools/components/`
- `apps/main/src/components/game/panels/WorldVisualRolesPanel.tsx` → `features/worldTools/components/`

All imports have been updated to use the `@features/worldTools` alias.

## See Also

- [HUD Feature](../hud/README.md) - HUD layout and rendering
- [Gizmo Architecture](../../../../docs/ADR-GIZMO-ARCHITECTURE.md) - Gizmo system overview
- [Plugin System](../../../../docs/systems/plugins/UNIFIED_PLUGIN_SYSTEM.md) - Plugin architecture
