import { definePanel } from '../../lib/definePanel';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';

export default definePanel({
  id: 'inspector',
  title: 'Inspector',
  component: InspectorPanel,
  category: 'workspace',
  tags: ['inspector', 'properties', 'details'],
  icon: 'info',
  description: 'Inspect and edit node properties',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
