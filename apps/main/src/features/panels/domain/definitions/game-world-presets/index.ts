import { definePanel } from '../../../lib/definePanel';

import { PresetsTab } from './PresetsTab';

/**
 * Game World editor → World Tools → Interaction Presets tab.
 *
 * Drives GameWorld's registry-derived nav and is mounted generically by
 * GameWorld. PresetsTab reads the selected world from the
 * CAP_GAME_WORLD_EDITOR capability.
 */
export default definePanel({
  id: 'game-world-presets',
  title: 'Interaction Presets',
  component: PresetsTab,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 10,
  description: 'Manage reusable interaction presets at world scope.',
});
