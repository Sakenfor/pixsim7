import { definePanel } from '../../../lib/definePanel';
import { GameViewPanel } from '@/components/game/panels/GameViewPanel';

export default definePanel({
  id: 'game',
  title: 'Game',
  component: GameViewPanel,
  category: 'game',
  tags: ['game', 'preview', 'play'],
  icon: 'gamepad',
  description: 'Core Game View (Game2D) embedded in the workspace.',
  coreEditorRole: 'game-view',
  contextLabel: 'session',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
