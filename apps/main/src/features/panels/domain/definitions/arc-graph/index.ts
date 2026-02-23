import { definePanel } from '../../../lib/definePanel';

import { ArcGraphPanelWrapper } from './ArcGraphPanelWrapper';

export default definePanel({
  id: 'arc-graph',
  title: 'Arc Graph',
  component: ArcGraphPanelWrapper,
  category: 'workspace',
  tags: ['arc', 'graph', 'quest', 'narrative'],
  icon: 'fileText',
  description: 'Manage story arcs, quests, and narrative flow',
  navigation: {
    featureIds: ['graph'],
    modules: ['workspace', 'arc-graph', 'routine-graph-page'],
    order: 15,
  },
  orchestration: {
    type: 'zone-panel',
    defaultZone: 'center',
    canChangeZone: true,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
