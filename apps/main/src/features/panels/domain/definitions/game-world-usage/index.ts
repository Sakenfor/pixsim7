import { definePanel } from '../../../lib/definePanel';

import { UsageTab } from './UsageTab';

/**
 * Game World editor → World Tools → Usage Stats tab.
 *
 * Drives GameWorld's registry-derived nav and is mounted generically by
 * GameWorld. UsageTab reads the selected world from the CAP_GAME_WORLD_EDITOR
 * capability.
 */
export default definePanel({
  id: 'game-world-usage',
  title: 'Usage Stats',
  component: UsageTab,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 20,
  description: 'Inspect development usage metrics for interaction presets.',
});
