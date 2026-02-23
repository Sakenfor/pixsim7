import { InspectorPanel } from '@/components/inspector/InspectorPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'inspector',
  title: 'Inspector',
  component: InspectorPanel,
  category: 'workspace',
  tags: ['inspector', 'properties', 'details'],
  icon: 'info',
  description: 'Inspect and edit node properties',
  navigation: {
    modules: ['workspace'],
    order: 30,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
