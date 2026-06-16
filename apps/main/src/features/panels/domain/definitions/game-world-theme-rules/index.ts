import { DynamicThemeRulesPanel } from '@/components/game/panels/DynamicThemeRulesPanel';

import { definePanel } from '../../../lib/definePanel';

/**
 * Game World editor → World Tools → Theme Rules tab.
 *
 * Drives GameWorld's registry-derived nav and is mounted generically by
 * GameWorld. DynamicThemeRulesPanel self-sources its world context.
 * Relocated here when GameThemingPanel was dissolved.
 */
export default definePanel({
  id: 'game-world-theme-rules',
  title: 'Theme Rules',
  component: DynamicThemeRulesPanel,
  category: 'game',
  contextLabel: 'world',
  availableIn: ['game-world-editor'],
  browsable: false,
  internal: true,
  order: 40,
  description: 'Automatic theme changes driven by world state.',
});
