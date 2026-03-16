/**
 * Block Primitives Debug World Tool Plugin
 *
 * Debugs behavior-driven block primitive selection requests and outcomes.
 */

import { BlockPrimitivesDebugSection } from '@/components/game/BlockPrimitivesDebugSection';

import type { WorldToolPlugin } from '../lib/types';

export const blockPrimitivesDebugTool: WorldToolPlugin = {
  id: 'block-primitives-debug',
  name: 'Block Primitives Debug',
  description: 'Build and run behavior-driven block primitive selection requests',
  icon: 'target',
  category: 'debug',

  whenVisible: (context) => context.selectedWorldId !== null,

  render: (context) => (
    <BlockPrimitivesDebugSection
      defaultWorldId={context.selectedWorldId}
      defaultSessionId={context.session?.id ?? null}
      title="Block Primitives Debug"
    />
  ),
};
