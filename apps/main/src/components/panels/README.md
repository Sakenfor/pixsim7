# Panel Organization

This directory contains all workspace panels organized by category.

## Structure (Hybrid Organization - Task 102)

### Centralized Panel Categories

- **`dev/`** - Developer tools and debug panels
  - Dev Tools Panel, App Map, Dependency Graph, Session State Viewer, etc.

- **`shared/`** - Shared panel infrastructure and building blocks
  - ComposedPanel, SimplePanelBuilder, FloatingPanelsManager

- **`tools/`** - Utility and tool panels
  - ExportImportPanel, ValidationPanel, Settings-like panels

### Domain-Specific Panels

Domain panels live under `components/{domain}/panels/`:
- `components/scene/panels/` - Scene-related panels
- `components/game/panels/` - Game-related panels
- `components/gallery/panels/` - Gallery-related panels
- etc.

## Conventions

**When creating a new panel:**

1. **Is it domain-specific?** (scene, game, gallery, health, etc.)
   - → Place it in `components/{domain}/panels/`

2. **Is it a dev/debug tool?**
   - → Place it in `components/panels/dev/`

3. **Is it a utility or tool panel?** (export/import, validation, settings)
   - → Place it in `components/panels/tools/`

4. **Is it shared panel infrastructure?** (panel builders, managers)
   - → Place it in `components/panels/shared/`

## Migration Status

✅ **Task 102 - Panel Organization Hybrid Migration (2025-11-29)**
- Cleaned up legacy panels and `.bak` files
- Centralized dev panels under `dev/`
- Centralized shared/tool panels under `shared/` and `tools/`
- Established domain panel subfolders
- Updated all imports to use `@/` path aliases

## Related Documentation

- **Panel Organization Audit** - `docs/PANEL_ORGANIZATION_AUDIT.md`
- **Task 102** - `claude-tasks/102-panel-organization-hybrid-migration.md`
