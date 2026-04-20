/**
 * Content Packs panel
 *
 * Dock-able view of installed content packs. Wraps `ContentPacksDashboard`
 * (formerly under Settings → Maintenance → Content Packs) so install/purge
 * management lives where you actually use it instead of buried in settings.
 *
 * Inspection of pack contents (blocks, templates, primitives) is handled by
 * separate panels: `prompt-library-inspector`, `block-explorer`, `block-matrix`.
 */

import { definePanel } from '../../../lib/definePanel';

import { ContentPacksPanel } from './ContentPacksPanel';

export default definePanel({
  id: 'content-packs',
  title: 'Content Packs',
  component: ContentPacksPanel,
  category: 'dev',
  icon: 'package',
  description: 'Installed content-pack inventory and purge controls.',
  tags: ['content-packs', 'packs', 'admin', 'inventory', 'purge', 'blocks', 'templates'],
  devTool: { category: 'prompts' },
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
