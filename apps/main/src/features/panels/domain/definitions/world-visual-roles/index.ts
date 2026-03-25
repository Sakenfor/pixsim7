import { WorldVisualRolesPanel } from '@features/worldTools';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'world-visual-roles',
  title: 'World Visual Roles',
  component: WorldVisualRolesPanel,
  category: 'game',
  panelRole: 'context-picker',
  browsable: false,
  tags: ['world', 'assets', 'visual', 'binding', 'roles', 'portraits'],
  icon: 'paintbrush',
  description:
    'Bind gallery assets to world visual roles (portraits, POV, backgrounds)',
  navigation: {
    featureIds: ['game'],
    modules: ['game'],
    order: 70,
  },
  contextLabel: 'world',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
