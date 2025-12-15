# Dev Tools Panels

Developer tools and debug panels for development and diagnostics.

## Panels in this directory

- **AppMapPanel** - Visual map of application structure and components
- **BackendArchitecturePanel** - Backend service architecture and data flow
- **CapabilityTestingPanel** - Test and validate system capabilities
- **DependencyGraphPanel** - Visualize module dependencies
- **DevToolsPanel** - Main developer tools panel
- **GenerationDevPanel** - Content generation development tools
- **GenerationHealthView** - Monitor generation health and diagnostics
- **GizmoSurfacesPanel** - Manage gizmo overlays and debug surfaces
- **SessionStateViewer** - Inspect GameSession state, flags, and relationships
- **TemplateAnalyticsPanel** - Template usage analytics and metrics

## Usage

These panels are registered in `lib/devtools/registerDevTools.ts` and accessible via:
- The Dev Tools Panel (main panel)
- Dev Tool Quick Access (Ctrl+Shift+D)
- Direct routes for some panels

## Infrastructure

Dev tool infrastructure components remain in `components/dev/`:
- `DevToolHost` - Dynamic host for rendering dev tools
- `DevToolDynamicPanel` - Panel wrapper for floating panels
- `DevToolQuickAccess` - Quick access modal (Ctrl+Shift+D)
