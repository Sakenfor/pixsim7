import { definePanel } from '../../../lib/definePanel';
import { WorldVisualRolesPanel } from '@features/worldTools';

export default definePanel({
  id: 'world-visual-roles',
  title: 'World Visual Roles',
  component: WorldVisualRolesPanel,
  category: 'game',
  tags: ['world', 'assets', 'visual', 'binding', 'roles', 'portraits'],
  icon: 'user',
  description:
    'Bind gallery assets to world visual roles (portraits, POV, backgrounds)',
  contextLabel: 'world',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
