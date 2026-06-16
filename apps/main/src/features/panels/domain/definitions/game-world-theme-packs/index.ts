import { ThemePacksPanel } from '@/components/game/panels/ThemePacksPanel';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → World Tools → Theme Packs tab.
 *
 * Drives GameWorld's registry-derived nav and is mounted generically by
 * GameWorld. ThemePacksPanel self-sources its world context.
 * Relocated here when GameThemingPanel was dissolved.
 */
export default definePanel({
  id: 'game-world-theme-packs',
  title: 'Theme Packs',
  component: ThemePacksPanel,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 50,
  description: 'Import and export reusable theme collections.',
});
