import { ToolPlayground } from '@features/gizmos/components/lab/ToolPlayground';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'tool-playground',
  title: 'Tool Playground',
  component: ToolPlayground,
  category: 'tools',
  tags: ['tools', 'lab', 'playground', 'canvas'],
  icon: 'play',
  description: 'Interactive playground for the selected tool',
  availableIn: ['gizmo-lab'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
