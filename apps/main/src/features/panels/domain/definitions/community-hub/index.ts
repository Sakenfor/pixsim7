import { definePanel } from '../../../lib/definePanel';

import { CommunityHubPanel } from './CommunityHubPanel';

export default definePanel({
  id: 'community-hub',
  title: 'Community',
  component: CommunityHubPanel,
  category: 'community',
  tags: ['community', 'social', 'chat', 'browse', 'packages'],
  icon: 'globe',
  description: 'Browse shared content, chat, and discover packages',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
