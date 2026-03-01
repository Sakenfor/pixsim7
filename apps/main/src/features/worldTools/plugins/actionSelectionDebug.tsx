/**
 * Action Selection Debug World Tool Plugin
 *
 * Debugs behavior-driven action selection requests and outcomes.
 */

import { ActionSelectionDebugSection } from '@/components/game/ActionSelectionDebugSection';

import type { WorldToolPlugin } from '../lib/types';

export const actionSelectionDebugTool: WorldToolPlugin = {
  id: 'action-selection-debug',
  name: 'Action Selection',
  description: 'Build and run behavior-driven action selection requests',
  icon: 'target',
  category: 'debug',

  whenVisible: (context) => context.selectedWorldId !== null,

  render: (context) => (
    <ActionSelectionDebugSection
      defaultWorldId={context.selectedWorldId}
      defaultSessionId={context.session?.id ?? null}
      title="Action Selection Debug"
    />
  ),
};
