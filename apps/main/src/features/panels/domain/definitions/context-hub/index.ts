import { ContextHubInspectorPanel } from '@features/contextHub/components/ContextHubInspectorPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'context-hub',
  title: 'Context Hub',
  component: ContextHubInspectorPanel,
  category: 'dev',
  panelRole: 'debug',
  tags: ['context', 'capabilities', 'debug'],
  icon: 'link',
  description: 'Inspect active context providers and overrides',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
