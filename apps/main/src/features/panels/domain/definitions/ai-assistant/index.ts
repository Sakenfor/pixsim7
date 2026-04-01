import { lazy } from 'react';

import { definePanel } from '../../../lib/definePanel';

const AIAssistantPanel = lazy(() =>
  import('./AIAssistantPanel').then((m) => ({
    default: m.AIAssistantPanel,
  }))
);

export default definePanel({
  id: 'ai-assistant',
  title: 'AI Assistant',
  component: AIAssistantPanel,
  category: 'tools',
  tags: ['ai', 'assistant', 'chat', 'claude'],
  icon: 'messageSquare',
  description: 'Chat with a connected AI agent — ask questions, run shortcuts, get help',
  orchestration: {
    defaultZone: 'right',
    allowedZones: ['left', 'right', 'bottom', 'floating'],
    closeOthersInZone: false,
    preferredWidth: 420,
  },
});
