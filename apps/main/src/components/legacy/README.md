# Legacy Components

This folder contains components that were built but are not currently integrated into the UI.

These components are preserved here as reference implementations that may be useful for future development, but they should not be confused with the active component tree.

## Status: Archived (2025-11-22)

**Reason:** Task 33 Phase 33.5 - Unused Frontend Component Sweep

All components in this folder were verified to have **zero import references** in the active codebase (as of 2025-11-22).

---

## Component Inventory

### Debug & Development Tools

- **SessionStateViewer.tsx** - Debug panel for inspecting GameSession state (flags, relationships, world time)
  - Purpose: Debugging scene effects and game state progression
  - Status: Built but never integrated into dev panel UI

### Plugin System

- **PluginCatalogPanel.tsx** - Read-only catalog view of all plugins
  - Purpose: Browse, filter, and search all plugin types
  - Status: Superseded by `PluginBrowser` component
  - Note: References `../lib/plugins/catalog` metadata layer

- **PluginConfigPanel.tsx** - Plugin configuration UI
  - Purpose: Configure plugin settings
  - Status: Functionality may be integrated elsewhere

### Graph & Scene Building

- **GraphPanel.tsx** - ReactFlow-based graph editor
  - Purpose: Visual graph editing with ReactFlow
  - Status: May have been superseded by `ArcGraphPanel` or other graph components
  - Note: Uses ReactFlow, includes validation and breadcrumbs

- **ArcGraphPanel.tsx** - Arc-specific graph panel
  - Purpose: Graph editing for arc workflows
  - Status: Built but not integrated

- **SceneBuilderPanel.tsx** - Scene construction UI
  - Purpose: Scene building and composition
  - Status: Not integrated into current UI

### Editors

- **WorldContextSelector.tsx** - World/workspace context selector
  - Purpose: Switch between worlds or contexts
  - Status: Context selection may be handled elsewhere

- **EdgeEffectsEditor.tsx** - Graph edge effects editor
  - Purpose: Edit visual or behavioral effects on graph edges
  - Status: Not integrated

- **HotspotEditor.tsx** - Hotspot/interaction point editor
  - Purpose: Define interactive hotspots in scenes
  - Status: Not integrated

- **SceneMetadataEditor.tsx** - Scene metadata fields editor
  - Purpose: Edit scene metadata (tags, descriptions, etc.)
  - Status: Not integrated

---

## Usage Guidelines

### When to Resurrect a Component

If you need functionality similar to these components:

1. **Check if it already exists elsewhere** - Many of these features may have been implemented in other components
2. **Review the archived implementation** - Use as reference for patterns and approaches
3. **Consider integration points** - These weren't integrated because they lacked clear UI entry points
4. **Update this README** - Document when/if you move a component back to active use

### When NOT to Use

- **Do not import** these components into active code without first:
  - Verifying they compile and work with current dependencies
  - Updating to current coding patterns and conventions
  - Finding a proper UI integration point
  - Removing from this legacy folder

---

## Verification Commands

To verify these components are still unused:

```bash
# Check if a component is imported anywhere
cd /home/user/pixsim7/apps/main/src
grep -r "from.*SessionStateViewer\|import.*SessionStateViewer" . --include="*.tsx" --include="*.ts"

# Should return empty (or only references in this README)
```

---

## Related Documentation

- **Task 33 Phase 33.5** - `claude-tasks/33-repo-pruning-and-legacy-sweep.md`
- **Component Architecture** - `ARCHITECTURE.md` (frontend components section)
- **Plugin System** - See `PluginBrowser` and `PluginManager` components for current plugin UI
