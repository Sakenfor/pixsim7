import { definePanel } from '../../../lib/definePanel';
import { TemplateLibraryPanel } from '@features/panels/components/tools/TemplateLibraryPanel';

export default definePanel({
  id: 'template-library',
  title: 'Template Library',
  component: TemplateLibraryPanel,
  category: 'tools',
  tags: ['templates', 'library', 'crud', 'authoring', 'game-maker', 'entities'],
  icon: 'library',
  description:
    'Browse and manage templates and runtime entities via the generic CRUD API. Create, edit, and delete location templates, item templates, NPCs, scenes, and more.',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  orchestration: {
    defaultZone: 'left',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 350,
  },
});
