import { GameWorldEditorTabStub } from '@/components/game/GameWorldEditorTabStub';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → World Tools → Theme Rules tab.
 *
 * Registered to drive GameWorld's registry-derived nav. GameWorld renders the
 * real DynamicThemeRulesPanel from its own switch; see GameWorldEditorTabStub.
 * Relocated here when GameThemingPanel was dissolved.
 */
export default definePanel({
  id: 'game-world-theme-rules',
  title: 'Theme Rules',
  component: GameWorldEditorTabStub,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 40,
  description: 'Automatic theme changes driven by world state.',
});
