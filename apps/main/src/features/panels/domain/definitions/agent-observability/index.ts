import { AgentObservabilityPanel } from '@features/panels/components/dev/AgentObservabilityPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'agent-observability',
  title: 'AI Agents',
  component: AgentObservabilityPanel,
  category: 'dev',
  browsable: true,
  tags: ['agents', 'ai', 'observability', 'contracts', 'meta', 'sessions'],
  icon: 'activity',
  description: 'AI agent observability — live activity, contract graph, session history',
  updatedAt: '2026-03-16T00:00:00Z',
  changeNote: 'Live contract graph with agent presence, session history, and utilization stats.',
  featureHighlights: ['Contract graph overlay', 'Agent session tracking', 'Activity history', 'Utilization stats'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'graph', safeForNonDev: true },
});
