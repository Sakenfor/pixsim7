import { definePanel } from '../../../lib/definePanel';
import { DevToolsPanel } from '@features/panels/components/dev/DevToolsPanel';

export default definePanel({
  id: 'dev-tools',
  title: 'Dev Tools',
  component: DevToolsPanel,
  category: 'dev',
  tags: ['dev', 'debug', 'tools', 'diagnostics', 'developer'],
  icon: 'code',
  description: 'Developer tools and diagnostics',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
