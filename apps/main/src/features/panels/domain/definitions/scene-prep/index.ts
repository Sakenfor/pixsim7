import { ScenePrepPanel } from '@/features/scenePrep';

import { definePanel } from '../../../lib/definePanel';


export { ScenePrepPanel };

export default definePanel({
  id: 'scene-prep',
  title: 'Scene Prep',
  component: ScenePrepPanel,
  category: 'generation',
  tags: [
    'scene',
    'prep',
    'generation',
    'workflow',
    'template',
    'fanout',
    'planning',
    'matrix',
  ],
  icon: 'clipboard-list',
  description:
    'Prepare scene batches with cast bindings, guidance refs, candidate assets, and template-fanout launch.',
  supportsCompactMode: false,
  supportsMultipleInstances: true,
  orchestration: {
    defaultZone: 'right',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 520,
  },
});

