# Archived Legacy Components

This folder contains legacy panel components that are **not currently used** in the codebase (as of 2025-11-29).

## Archived During Task 102 - Panel Organization Hybrid Migration

The following panels were moved here because they have zero import references:

- **ArcGraphPanel.tsx** - Duplicate; active version exists in `components/arc-graph/ArcGraphPanel.tsx`
- **EdgeEffectsEditor.tsx** - Graph edge effects editor (not integrated)
- **HotspotEditor.tsx** - Hotspot/interaction point editor (not integrated)
- **PluginCatalogPanel.tsx** - Plugin catalog view (superseded by PluginBrowser)
- **PluginConfigPanel.tsx** - Plugin configuration UI (not integrated)
- **SceneMetadataEditor.tsx** - Scene metadata fields editor (not integrated)
- **WorldContextSelector.tsx** - World/workspace context selector (not integrated)

## Usage

These components are preserved as reference implementations. If you need to resurrect one:

1. Verify it compiles with current dependencies
2. Update to current coding patterns
3. Find a proper UI integration point
4. Move it to the appropriate panel location per the hybrid organization structure
5. Update this README to document the resurrection
