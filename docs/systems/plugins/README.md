# Plugin System Documentation

This directory contains all core plugin system documentation for PixSim7.

## Documentation Files

### Core System Docs

- **[PLUGIN_SYSTEM.md](PLUGIN_SYSTEM.md)** - UI plugin sandboxing system
  - Iframe-based sandboxing for third-party plugins
  - PostMessage RPC API
  - Permission system

- **[UNIFIED_PLUGIN_SYSTEM.md](UNIFIED_PLUGIN_SYSTEM.md)** - Unified plugin architecture
  - Cross-family plugin patterns
  - Registration and lifecycle management
  - Plugin discovery and loading

- **[PLUGIN_ARCHITECTURE.md](PLUGIN_ARCHITECTURE.md)** - Plugin loading architecture
  - Plugin loader implementation
  - Module discovery patterns
  - Auto-loading mechanisms

### Developer Guides

- **[PLUGIN_DEVELOPER_GUIDE.md](PLUGIN_DEVELOPER_GUIDE.md)** - Building plugins
  - Step-by-step plugin development
  - Best practices
  - Examples and templates

- **[PLUGIN_REFERENCE.md](PLUGIN_REFERENCE.md)** - API reference
  - Complete API documentation
  - Available hooks and APIs
  - Type definitions

### Catalogs & Workspaces

- **[PLUGIN_CATALOG.md](PLUGIN_CATALOG.md)** - Available plugins
  - List of all available plugins
  - Plugin capabilities
  - Installation instructions

- **[PLUGIN_WORKSPACE.md](PLUGIN_WORKSPACE.md)** - Workspace plugin
  - Workspace plugin specifics
  - Panel management
  - Workspace features

## Related Documentation

### Specific Plugin Implementations

Located in `docs/` root (domain-specific):
- `CUBE_SYSTEM_V2_PLUGIN.md` - Cube system plugin
- `GALLERY_TOOLS_PLUGIN.md` - Gallery tools
- `GENERATION_NODE_PLUGIN.md` - Generation nodes
- `ROMANCE_PLUGIN.md` - Romance mechanics
- `SEDUCTION_NODE_PLUGIN.md` - Seduction nodes
- `INTERACTION_PLUGIN_MANIFEST.md` - Interaction plugins

### Integration & Migration

- `CAPABILITY_PLUGIN_INTEGRATION.md` - Capability integration
- `CONTROL_CENTER_PLUGIN_MIGRATION.md` - Control center migration
- `NODE_PLUGIN_AUTO_LOADING.md` - Node auto-loading
- `MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md` - Middleware architecture

### ADRs

- [Backend Plugin Auto-Discovery](../../decisions/20251121-backend-plugin-auto-discovery.md)
- [Extension Architecture](../../decisions/20251121-extension-architecture.md)

### Archived

See `docs/archive/plugins/` for historical implementation docs:
- `PLUGIN_METADATA_IMPLEMENTATION.md`
- `PLUGIN_WORKSPACE_COMPLETE_SUMMARY.md`
- `PLUGIN_WORKSPACE_IMPLEMENTATION.md`
- `PLUGIN_WORKSPACE_PHASES_3_5.md`
- `PLUGIN_SYSTEM_ARCHITECTURE_OLD.md`
- `PLUGIN_SYSTEM_GAME_ENGINE.md`

## Quick Start

**New to plugins?**
1. Start with [PLUGIN_SYSTEM.md](PLUGIN_SYSTEM.md) for UI plugins
2. Or [UNIFIED_PLUGIN_SYSTEM.md](UNIFIED_PLUGIN_SYSTEM.md) for system plugins
3. Read [PLUGIN_DEVELOPER_GUIDE.md](PLUGIN_DEVELOPER_GUIDE.md) to build your first plugin
4. Refer to [PLUGIN_REFERENCE.md](PLUGIN_REFERENCE.md) for API details

**Working on existing plugins?**
- See [PLUGIN_CATALOG.md](PLUGIN_CATALOG.md) for available plugins
- Check [PLUGIN_ARCHITECTURE.md](PLUGIN_ARCHITECTURE.md) for loading mechanisms

## Organization

All core plugin system documentation lives in this directory (`docs/systems/plugins/`). Domain-specific plugin documentation (like specific plugin implementations) remains in the main `docs/` directory with descriptive names.
