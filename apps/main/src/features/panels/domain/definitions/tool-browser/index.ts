import { ToolBrowser } from '@features/gizmos/components/lab/ToolBrowser';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'tool-browser',
  title: 'Tool Browser',
  component: ToolBrowser,
  category: 'tools',
  tags: ['tools', 'lab', 'browser'],
  icon: 'mouse-pointer',
  description: 'Browse and select interactive tools from the registry',
  availableIn: ['gizmo-lab'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
