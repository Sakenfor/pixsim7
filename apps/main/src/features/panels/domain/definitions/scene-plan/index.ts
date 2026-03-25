import { definePanel } from '../../../lib/definePanel';

import { ScenePlanPanel } from './ScenePlanPanel';

export { ScenePlanPanel };

export default definePanel({
  id: 'scene-plan',
  title: 'Scene Plan',
  component: ScenePlanPanel,
  category: 'game',
  tags: ['scene', 'plan', 'director', 'behavior', 'primitives', 'debug'],
  icon: 'clipboardList',
  description:
    'Build a behavior-driven scene plan preview with canonical anchors, beats, and camera intent.',
  navigation: {
    featureIds: ['game'],
    modules: ['game', 'game-2d'],
    order: 85,
  },
  contextLabel: 'world',
  supportsCompactMode: false,
  supportsMultipleInstances: true,
  orchestration: {
    defaultZone: 'right',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 520,
  },
});
