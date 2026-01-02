import { definePanel } from '../../../lib/definePanel';
import { NpcBrainLab } from '@features/brainTools';

export default definePanel({
  id: 'npc-brain-lab',
  title: 'NPC Brain Lab',
  component: NpcBrainLab,
  category: 'tools',
  tags: ['npc', 'ai', 'brain', 'behavior'],
  icon: 'bot',
  description: 'NPC behavior testing and debugging',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
