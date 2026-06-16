import { definePanel } from '../../../lib/definePanel';

import { HotspotsTab } from './HotspotsTab';

/**
 * Game World editor → Location Tools → Hotspots tab.
 *
 * Drives GameWorld's registry-derived nav and is mounted generically by
 * GameWorld. HotspotsTab reads the selected location + callbacks from the
 * CAP_GAME_WORLD_EDITOR capability GameWorld publishes.
 */
export default definePanel({
  id: 'game-world-hotspots',
  title: 'Hotspots',
  component: HotspotsTab,
  category: 'game',
  contextLabel: 'location',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 10,
  description: 'Configure mesh hotspots and linked actions for this location.',
});
