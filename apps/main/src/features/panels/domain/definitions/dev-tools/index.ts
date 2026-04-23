import { DevToolsPanel } from '@features/panels/components/dev/DevToolsPanel';

import { definePanel } from '../../../lib/definePanel';

/**
 * Dev Tools is a full browser panel — in-panel search + category nav handle
 * discovery. We intentionally don't forward a hover-cascade of dev panels:
 * nav flyouts already surface dev panels through standard tag-matching
 * (PAGE_NAV_HINTS + featureTagHints), and the MorePanelsFlyout handles search.
 * Keeping only one browse path avoids the double-ranking surprise.
 */
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
