# Legacy Components

This folder contains components that are **still in use** but need to be migrated to proper locations.

## Status: Migration Pending (2025-11-29)

**Updated during Task 102 - Panel Organization Hybrid Migration**

The components remaining in this folder ARE actively used and imported by the codebase. They will be migrated to appropriate locations as part of the hybrid panel organization:

- Unused legacy panels have been moved to `_archive/` subfolder
- Active panels will be migrated to their proper locations per the hybrid structure

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

## Currently Used Components (Still in Legacy)

The following components are **actively imported** and will be migrated:

- **GraphPanel.tsx** - Used in `lib/graph/registerEditors.ts`
  - Migration target: To be determined (possibly `components/scene/panels/` or graph-specific location)

- **SceneBuilderPanel.tsx** - Used in `features/panels/definitions/scene/index.ts`
  - Migration target: `components/scene/panels/SceneBuilderPanel.tsx`

- **SessionStateViewer.tsx** - Used in `lib/devtools/registerDevTools.ts`
  - Migration target: `components/panels/dev/SessionStateViewer.tsx`

## Related Documentation

- **Task 102** - `claude-tasks/102-panel-organization-hybrid-migration.md` (current task)
- **Task 33 Phase 33.5** - `claude-tasks/33-repo-pruning-and-legacy-sweep.md`
- **Component Architecture** - `ARCHITECTURE.md` (frontend components section)
- **Panel Organization Audit** - `docs/PANEL_ORGANIZATION_AUDIT.md`
