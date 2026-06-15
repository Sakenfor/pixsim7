import { GameWorldEditorTabStub } from '@/components/game/GameWorldEditorTabStub';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → World Tools → Theme Packs tab.
 *
 * Registered to drive GameWorld's registry-derived nav. GameWorld renders the
 * real ThemePacksPanel from its own switch; see GameWorldEditorTabStub.
 * Relocated here when GameThemingPanel was dissolved.
 */
export default definePanel({
  id: 'game-world-theme-packs',
  title: 'Theme Packs',
  component: GameWorldEditorTabStub,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 50,
  description: 'Import and export reusable theme collections.',
});
