import { definePanel } from '../../../lib/definePanel';
import { ConsolePanel } from '@features/panels/components/console/ConsolePanel';

export default definePanel({
  id: 'console',
  title: 'Console',
  component: ConsolePanel,
  category: 'dev',
  tags: ['console', 'command', 'scripting', 'debug', 'developer'],
  icon: 'code',
  description:
    'Interactive command console for the pixsim namespace (Blender-style)',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
