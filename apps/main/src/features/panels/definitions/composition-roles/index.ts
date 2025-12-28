import { definePanel } from '../../lib/definePanel';
import { CompositionRolesPanel } from './CompositionRolesPanel';

export { CompositionRolesPanel };

export default definePanel({
  id: 'composition-roles',
  title: 'Composition Roles',
  component: CompositionRolesPanel,
  category: 'tools',
  tags: ['composition', 'roles', 'tags', 'mappings', 'generation'],
  icon: 'layers',
  description: 'Browse composition role definitions and tag mappings',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
