# Action Registry

Generated from module page actions by `scripts/generate-app-map.ts`.
Includes actions defined inline or as consts in the same module file.

| Action ID | Title | Feature | Route | Shortcut | Icon | Visibility | Contexts | Category | Tags | Description | Sources |
|-----------|-------|---------|-------|----------|------|------------|----------|----------|------|-------------|---------|
| app-map.open | Open App Map | app-map | `/app-map` | `Ctrl+Shift+M` | map | - | `background` | quick-add | - | View live app architecture and plugin ecosystem | `apps/main/src/features/devtools/routes/index.ts` |
| assets.open-gallery | Open Gallery | assets | - | `Ctrl+Shift+A` | image | - | `background` | quick-add | - | Open the asset gallery | `apps/main/src/features/assets/module.ts` |
| assets.search | Search Assets | assets | - | `Ctrl+K` | search | - | - | - | - | Search for assets | `apps/main/src/features/assets/module.ts` |
| assets.upload | Upload Asset | assets | - | - | upload | - | - | - | - | Upload a new asset | `apps/main/src/features/assets/module.ts` |
| automation.open | Open Automation | automation | `/automation` | - | bot | - | `background` | quick-add | - | Manage Android devices and automation loops | `apps/main/src/features/automation/module.ts` |
| game.enter-world | Enter Game World | game | - | - | map | - | `background` | quick-add | - | Open the game world | `apps/main/src/features/worldTools/module.ts` |
| game.npc-editor | NPC Editor | game | - | - | brain | - | `background` | quick-add | - | Open the NPC brain lab | `apps/main/src/features/worldTools/module.ts` |
| generation.open-presets | Open Presets | generation | - | - | palette | - | `background` | quick-add | - | Open generation presets | `apps/main/src/features/generation/routes/index.ts` |
| generation.quick-generate | Quick Generate | generation | - | `Ctrl+G` | zap | - | `background` | quick-add | - | Open quick generate in control center | `apps/main/src/features/generation/routes/index.ts` |
| generation.select-provider | Select Provider | generation | - | - | globe | - | `background` | quick-add | - | Select generation provider | `apps/main/src/features/generation/routes/index.ts` |
| gizmos.open-lab | Open Gizmo Lab | gizmos | - | - | sparkles | - | `background` | quick-add | - | Open the gizmo lab | `apps/main/src/features/gizmos/routes/index.ts` |
| graph.open-arc-graph | Open Arc Graph | graph | - | - | fileText | - | `background` | quick-add | - | Open the arc graph editor | `apps/main/src/features/graph/routes/index.ts` |
| interactions.open-studio | Open Interaction Studio | interactions | - | - | sparkles | - | `background` | quick-add | - | Open the interaction studio | `apps/main/src/features/interactions/routes/index.ts` |
| plugins.open | Open Plugin Manager | plugins | `/plugins` | `Ctrl+Shift+P` | settings | - | `background` | quick-add | - | Plugin management and installation | `apps/main/src/features/plugins/routes/index.ts` |
| workspace.open | Open Workspace | workspace | - | `Ctrl+Shift+W` | palette | - | `background` | quick-add | - | Open the scene builder workspace | `apps/main/src/features/workspace/module.ts` |
| workspace.open-panel | Open Panel | workspace | - | - | layout | hidden | - | - | - | Open a floating panel | `apps/main/src/features/workspace/module.ts` |
| workspace.save | Save Scene | workspace | - | `Ctrl+S` | save | - | - | - | - | Save the current scene | `apps/main/src/features/workspace/module.ts` |
