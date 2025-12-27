import { definePanel } from '../../lib/definePanel';
import { GraphEditorHost } from '@features/graph';
import { GraphPanelSettingsComponent } from '@features/graph/components/GraphPanelSettings';

export default definePanel({
  id: 'graph',
  title: 'Graph',
  component: GraphEditorHost,
  category: 'workspace',
  tags: ['graph', 'nodes', 'flow'],
  icon: 'graph',
  description: 'Visual node-based editor',
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
    priority: 55,
    interactionRules: {
      whenOpens: {
        assetViewer: 'minimize',
      },
    },
  },
  coreEditorRole: 'flow-view',
  contextLabel: (ctx) =>
    ctx.scene.title
      ? `Scene: ${ctx.scene.title}${ctx.world.id ? ` ƒ?› World #${ctx.world.id}` : ''}`
      : ctx.world.id
        ? `World #${ctx.world.id}`
        : undefined,
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  settingsComponent: GraphPanelSettingsComponent,
});
