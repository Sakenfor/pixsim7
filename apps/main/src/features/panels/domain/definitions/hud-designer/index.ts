import { HudDesignerPanel } from './HudDesignerPanel';
import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'hud-designer',
  title: 'HUD Designer',
  component: HudDesignerPanel,
  category: 'tools',
  tags: ['hud', 'designer', 'layout', 'ui', 'widgets'],
  icon: 'layout',
  description: 'Design HUD layouts using widget compositions',
  navigation: {
    featureIds: ['game'],
    modules: ['game-2d'],
    order: 30,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
