import { definePanel } from '../../../lib/definePanel';

import { GenerationWorkflowGraphPanel } from './GenerationWorkflowGraphPanel';

export { GenerationWorkflowGraphPanel };

export default definePanel({
  id: 'generation-workflow-graph',
  title: 'Gen Workflow Graph',
  component: GenerationWorkflowGraphPanel,
  category: 'generation',
  tags: [
    'generation',
    'workflow',
    'graph',
    'fanout',
    'chain',
    'sequential',
    'overnight',
    'harvest',
  ],
  icon: 'git-branch',
  description:
    'Plan and run simple generation workflows using backend fanout and chain executors (POC).',
  supportsCompactMode: false,
  supportsMultipleInstances: true,
  orchestration: {
    defaultZone: 'right',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 520,
  },
});
