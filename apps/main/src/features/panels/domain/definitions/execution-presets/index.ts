import { definePanel } from '../../../lib/definePanel';

import { ExecutionPresetsPanel } from './ExecutionPresetsPanel';

export { ExecutionPresetsPanel };

export default definePanel({
  id: 'execution-presets',
  title: 'Execution Presets',
  component: ExecutionPresetsPanel,
  category: 'generation',
  tags: ['generation', 'fanout', 'each', 'sequential', 'chain', 'presets', 'execution-policy'],
  icon: 'sliders',
  description: 'Manage reusable execution presets for fanout (Each) and future chain/sequential runs.',
  supportsCompactMode: false,
  supportsMultipleInstances: true,
  orchestration: {
    defaultZone: 'right',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 380,
  },
});

