# Dev Tools System

A complete developer tools infrastructure with registry-based architecture, quick access modal, and floating panel integration.

## Features

- **Dev Tool Registry**: Central registry for all developer tools with metadata
- **Quick Access Modal**: Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac) for instant access
- **Recent Tools Tracking**: Automatically tracks and prioritizes recently used tools
- **Floating Panels**: Open dev tools as floating, resizable panels
- **Route Support**: Dev tools can have dedicated routes or panel components
- **Keyboard Navigation**: Full keyboard support in quick access modal
- **Search & Filter**: Search tools by name, description, or tags
- **Category Organization**: Tools organized by category (session, plugins, graph, etc.)

## Usage

### Opening Dev Tools

1. **Quick Access Modal** (`Ctrl+Shift+D`):
   - Opens a searchable modal with all dev tools
   - Use arrow keys to navigate
   - Press Enter to open selected tool
   - Press Esc to close

2. **Dev Tools Panel**:
   - Open from workspace presets (dev-default, dev-plugins, dev-architecture)
   - Browse tools by category
   - Click to open as floating panel or navigate to route

3. **Workspace Presets**:
   - `dev-default`: Graph + Dev Tools + Health
   - `dev-plugins`: Dev Tools + Settings + Game
   - `dev-architecture`: Graph + Dev Tools

### Registering a New Dev Tool

```typescript
import { registerDevTool } from './lib/devtools';
import { MyDebugPanel } from './components/dev/MyDebugPanel';

export function registerMyDebugTool() {
  registerDevTool({
    id: 'my-debug-tool',
    label: 'My Debug Tool',
    description: 'Custom debugging panel for my feature',
    icon: '🔧',
    category: 'debug',
    panelComponent: MyDebugPanel,
    tags: ['debug', 'custom', 'diagnostics'],
  });
}
```

Call `registerMyDebugTool()` during app initialization (in `registerDevTools.ts`).

### Built-in Dev Tools

| Tool | Category | Type | Description |
|------|----------|------|-------------|
| Session State Viewer | Session | Panel | Inspect session flags, relationships, world time |
| Plugin Workspace | Plugins | Route | Develop and test plugins with harnesses |
| App Map | Graph | Panel | Visual map of app architecture |
| Dependency Graph | Graph | Panel | Module dependency visualization |
| Backend Architecture | Graph | Panel | Backend service architecture view |
| Generation Health | Generation | Panel | Content generation diagnostics |
| Template Analytics | Debug | Panel | Template usage and performance |
| Capability Testing | Debug | Panel | Test capabilities and APIs |

## Architecture

### Key Components

- **DevToolRegistry** (`devToolRegistry.ts`): Central registry with search/filter
- **DevToolHost** (`DevToolHost.tsx`): Dynamic component renderer
- **DevToolsPanel** (`DevToolsPanel.tsx`): Main navigation panel
- **DevToolQuickAccess** (`DevToolQuickAccess.tsx`): Quick access modal
- **DevToolContext** (`devToolContext.tsx`): Recent tools and modal state
- **DevToolDynamicPanel** (`DevToolDynamicPanel.tsx`): Floating panel wrapper

### Integration Points

- **Panel System**: Dev tools can be opened as floating panels
- **Plugin System**: Dev tools registered as `'dev-tool'` plugin family
- **Workspace**: Dev workspace presets for debugging layouts
- **Keyboard**: Global shortcuts for quick access

## API Reference

### DevToolDefinition

```typescript
interface DevToolDefinition {
  id: DevToolId;                      // Unique identifier
  label: string;                      // Display label
  description?: string;               // Optional description
  icon?: string;                      // Icon (emoji or icon name)
  category?: DevToolCategory;         // Category for grouping
  panelComponent?: React.ComponentType<any>; // Panel component
  routePath?: string;                 // Optional full route
  tags?: string[];                    // Search tags
  safeForNonDev?: boolean;           // Safe for non-developers
}
```

### DevToolRegistry Methods

```typescript
register(def: DevToolDefinition): void
unregister(id: DevToolId): void
get(id: DevToolId): DevToolDefinition | undefined
getAll(): DevToolDefinition[]
getByCategory(category: string): DevToolDefinition[]
search(query: string): DevToolDefinition[]
getCategories(): string[]
clear(): void
```

### DevToolContext Hook

```typescript
const {
  recentTools,        // Recently opened tool IDs
  addRecentTool,      // Add tool to recent list
  clearRecentTools,   // Clear recent tools
  isQuickAccessOpen,  // Quick access modal state
  openQuickAccess,    // Open modal
  closeQuickAccess,   // Close modal
  toggleQuickAccess,  // Toggle modal
} = useDevToolContext();
```

## Keyboard Shortcuts

- **`Ctrl+Shift+D`** (or `Cmd+Shift+D`): Toggle quick access modal
- **`↑`/`↓`**: Navigate tools in quick access
- **`Enter`**: Open selected tool
- **`Esc`**: Close quick access modal

## File Structure

```
lib/devtools/
├── types.ts                    # TypeScript types
├── devToolRegistry.ts          # Registry implementation
├── registerDevTools.ts         # Built-in tool registration
├── devToolContext.tsx          # React context for dev tools
├── index.ts                    # Module exports
└── README.md                   # This file

components/dev/
├── DevToolHost.tsx             # Dynamic tool renderer
├── DevToolsPanel.tsx           # Main navigation panel
├── DevToolQuickAccess.tsx      # Quick access modal
├── DevToolDynamicPanel.tsx     # Floating panel wrapper
└── [existing dev tool panels]

hooks/
└── useDevToolShortcuts.ts      # Keyboard shortcuts hook
```

## See Also

- [Task 54: Dev Tools Surface & Debug Workspace](../../../../../claude-tasks/54-dev-tools-surface-and-debug-workspace.md)
- [APP_MAP.md](../../../../../docs/APP_MAP.md#dev-tools-surface--debug-workspace)
- [SYSTEM_OVERVIEW.md](../../../../../docs/SYSTEM_OVERVIEW.md#dev-tools-surface--debug-workspace)
