import { AutomationRoute } from '@/routes/Automation';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'automation',
  title: 'Automation',
  component: AutomationRoute,
  category: 'tools',
  tags: ['automation', 'devices', 'loops', 'presets'],
  icon: 'bot',
  description: 'Manage Android devices and automation loops',
  navigation: {
    featureIds: ['automation'],
    order: 10,
  },
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
