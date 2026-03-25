import { DevToolsPanel } from '@features/panels/components/dev/DevToolsPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'dev-tools',
  title: 'Dev Tools',
  component: DevToolsPanel,
  category: 'dev',
  tags: ['dev', 'debug', 'tools', 'diagnostics', 'developer'],
  icon: 'flask',
  description: 'Developer tools and diagnostics',
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
