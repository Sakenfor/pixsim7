import { SessionStateViewer } from '@features/panels/components/dev/SessionStateViewer';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'session-state-viewer',
  title: 'Session State Viewer',
  component: SessionStateViewer,
  category: 'dev',
  browsable: false,
  tags: ['session', 'debug', 'state', 'world', 'relationships'],
  icon: 'globe',
  description: 'Inspect GameSession flags, relationships, and world time',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for session state inspection tool.',
  featureHighlights: ['World/session flags and relationship inspection in one panel.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'session' },
});
