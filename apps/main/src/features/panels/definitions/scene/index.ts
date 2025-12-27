import { definePanel } from '../../lib/definePanel';
import { SceneBuilderPanel } from '@features/scene';

export default definePanel({
  id: 'scene',
  title: 'Scene Builder',
  component: SceneBuilderPanel,
  category: 'scene',
  tags: ['scene', 'builder', 'editor'],
  icon: 'layoutGrid',
  description: 'Build and edit individual scenes',
  contextLabel: 'scene',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
