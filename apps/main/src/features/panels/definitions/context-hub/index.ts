import { definePanel } from '../../lib/definePanel';
import { ContextHubInspectorPanel } from '@features/contextHub/components/ContextHubInspectorPanel';

export default definePanel({
  id: 'context-hub',
  title: 'Context Hub',
  component: ContextHubInspectorPanel,
  category: 'dev',
  tags: ['context', 'capabilities', 'debug'],
  icon: 'link',
  description: 'Inspect active context providers and overrides',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
