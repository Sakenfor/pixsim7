import { ProjectPanel } from '@features/panels/components/tools/ProjectPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'project',
  title: 'Project',
  component: ProjectPanel,
  category: 'workspace',
  tags: ['project', 'import', 'export', 'bundle', 'authoring'],
  icon: 'save',
  description: 'Project-level save/load for world bundles and authoring extensions.',
  contextLabel: 'world',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  orchestration: {
    defaultZone: 'left',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 340,
  },
});
