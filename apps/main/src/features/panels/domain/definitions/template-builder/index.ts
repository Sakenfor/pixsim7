import { TemplateBuilderPanel } from '@features/panels/components/dev/TemplateBuilderPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'template-builder',
  title: 'Template Builder',
  component: TemplateBuilderPanel,
  category: 'prompts',
  tags: ['prompts', 'templates', 'blocks', 'composition', 'generation'],
  icon: 'shuffle',
  description: 'Create and manage block templates for random prompt composition',
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
