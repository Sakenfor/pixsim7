import { definePanel } from '../../../lib/definePanel';

import { ValidationTab } from './ValidationTab';

/**
 * Game World editor → World Tools → Validation tab.
 *
 * Drives GameWorld's registry-derived nav and is mounted generically by
 * GameWorld. ValidationTab reads the selected world id from the
 * CAP_GAME_WORLD_EDITOR capability.
 */
export default definePanel({
  id: 'game-world-validation',
  title: 'Validation',
  component: ValidationTab,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 30,
  description: 'Check world health: behavior config validation and link integrity.',
});
