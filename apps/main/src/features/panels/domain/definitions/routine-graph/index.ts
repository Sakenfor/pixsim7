import { RoutineGraphPanel } from '@features/routine-graph/components/RoutineGraphPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'routine-graph',
  title: 'Routine Graph',
  component: RoutineGraphPanel,
  category: 'workspace',
  tags: ['routine', 'graph', 'schedule', 'npc'],
  icon: 'clock',
  description: 'Design NPC daily routines and schedules',
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
