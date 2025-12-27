import { definePanel } from '../../lib/definePanel';
import { ModelInspectorPanel } from '@features/panels/components/tools/ModelInspectorPanel';

export default definePanel({
  id: 'model-inspector',
  title: 'Model Inspector',
  component: ModelInspectorPanel,
  category: 'tools',
  tags: ['3d', 'model', 'gltf', 'zones', 'tools', 'animation'],
  icon: 'package',
  description: 'View 3D models, animations, and configure contact zones',
  supportsCompactMode: false,
  supportsMultipleInstances: true,
});
