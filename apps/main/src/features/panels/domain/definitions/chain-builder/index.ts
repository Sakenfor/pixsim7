import { definePanel } from '../../../lib/definePanel';

import { ChainBuilderPanel } from './ChainBuilderPanel';

export { ChainBuilderPanel };

export default definePanel({
  id: 'chain-builder',
  title: 'Chain Builder',
  component: ChainBuilderPanel,
  category: 'prompts',
  tags: ['chains', 'workflows', 'sequential', 'generation'],
  icon: 'layers',
  description: 'Build and execute multi-step generation chains (txt2img → refine → upscale)',
  navigation: {
    featureIds: ['automation'],
    modules: ['automation'],
    order: 35,
  },
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
