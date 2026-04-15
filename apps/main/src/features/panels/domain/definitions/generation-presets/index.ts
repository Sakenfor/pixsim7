import { definePanel } from '../../../lib/definePanel';

import { GenerationPresetsPanel } from './GenerationPresetsPanel';

export { GenerationPresetsPanel };

export default definePanel({
  id: 'generation-presets',
  title: 'Generation Presets',
  component: GenerationPresetsPanel,
  category: 'generation',
  tags: ['generation', 'presets', 'inputs', 'prompt', 'quick-fire'],
  icon: 'bookmark',
  description: 'Browse, manage, and quick-fire saved generation presets.',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  orchestration: {
    defaultZone: 'right',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 520,
  },
});
