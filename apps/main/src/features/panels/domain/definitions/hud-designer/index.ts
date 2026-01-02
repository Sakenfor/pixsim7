import { definePanel } from '../../../lib/definePanel';
import { HudDesignerPanel } from '../../components/HudDesignerPanel';

export default definePanel({
  id: 'hud-designer',
  title: 'HUD Designer',
  component: HudDesignerPanel,
  category: 'tools',
  tags: ['hud', 'designer', 'layout', 'ui', 'widgets'],
  icon: 'layoutGrid',
  description: 'Design HUD layouts using widget compositions',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
