import type { SubNavItem } from '@pixsim7/shared.modules.core';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { DevToolsPanel } from '@features/panels/components/dev/DevToolsPanel';

import { definePanel } from '../../../lib/definePanel';

/**
 * Enumerate dev tool entries that should appear as cascading children under
 * the Dev Tools subnav item. Sourced from the panel catalog (category === 'dev'),
 * skipping the parent 'dev-tools' panel itself and any explicitly opted-out.
 */
function getDevToolChildren(): SubNavItem[] {
  return panelSelectors
    .getAll()
    .filter((panel) => panel.category === 'dev')
    .filter((panel) => !panel.isInternal)
    .filter((panel) => panel.id !== 'dev-tools')
    .filter((panel) => {
      const meta = (panel as { metadata?: { devTool?: unknown } }).metadata;
      return meta?.devTool !== false;
    })
    .map((panel) => ({
      id: `panel:${panel.id}`,
      label: panel.title,
      icon: panel.icon ?? 'wrench',
    }));
}

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
    children: getDevToolChildren,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
