# PixSim7 Examples

This directory contains example code for plugin development, component usage, and system integration.

**Important:** This code is **NOT** part of the production application. It serves as reference material for developers.

## Directory Structure

- `plugins/` - Plugin templates and examples
  - `interaction-example.ts` - Interaction plugin template
  - `helper-example.ts` - Helper plugin template
  - `gizmo-example.ts` - Gizmo plugin template
  - `relationship-tracker-example.tsx` - Full plugin example

- `widgets/` - Widget component examples
  - `MetricWidget.tsx` - Custom metric widget
  - `ComposedPanelExample.tsx` - Panel composition example

- `components/` - Full component examples
  - `BrainShapeExample.tsx` - Complete NPC brain visualization demo (uses mockCore)

- `data-binding/` - Data binding examples
  - `dataBindingExample.tsx` - Data source usage

- `asset-resolver-integration.ts` - Asset resolver integration example

## Note on Mock Data

Some examples (like `BrainShapeExample`) use `mockCore` for demonstration purposes. In production code, use the real `usePixSim7Core()` hook from `@/lib/game/usePixSim7Core` instead. See `features/brainTools/components/NpcBrainLab.tsx` for the production pattern.

## Usage

1. Copy example files as starting point for new plugins/components
2. Modify to fit your use case
3. Remove example code comments and TODOs
4. Add to main source tree when ready

## Contributing

When adding new examples:
- Keep them simple and focused on one concept
- Add inline comments explaining key patterns
- Include a brief header describing the example
- Keep examples self-contained (minimal dependencies)
