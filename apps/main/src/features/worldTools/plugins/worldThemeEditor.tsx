/* eslint-disable react-refresh/only-export-components */
/**
 * World Theme Editor World Tool Plugin
 *
 * Allows designers to configure per-world UI theme and view mode.
 */

import { useToast } from '@pixsim7/shared.ui';

import { WorldThemeEditor } from '@/components/game/WorldThemeEditor';

import type { WorldToolPlugin, WorldToolContext } from '../lib/types';

export const worldThemeEditorTool: WorldToolPlugin = {
  id: 'world-theme-editor',
  name: 'Theme & View Mode',
  description: 'Configure world-specific UI theme and view mode',
  icon: '🎨',
  category: 'world',

  // Show when we have a world
  whenVisible: (context) => context.worldDetail !== null,

  render: (context) => {
    const { worldDetail } = context;

    if (!worldDetail) {
      return (
        <div className="text-sm text-neutral-500">
          No world selected
        </div>
      );
    }
    return <WorldThemeEditorPanel worldDetail={worldDetail} />;
  },
};

function WorldThemeEditorPanel({ worldDetail }: { worldDetail: WorldToolContext['worldDetail'] }) {
  const toast = useToast();

  const handleSave = async (updatedWorld: typeof worldDetail) => {
    try {
      // Update world via API
      const response = await fetch(`/api/game/worlds/${worldDetail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meta: updatedWorld.meta,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update world');
      }

      toast.success('World theme and view mode updated successfully');

      // Optionally trigger a refresh of the world detail
      // This would need to be handled by the parent component
      console.log('[WorldThemeEditor] Saved world UI config', updatedWorld.meta);
    } catch (error) {
      console.error('[WorldThemeEditor] Error saving:', error);
      toast.error('Failed to update world theme');
    }
  };

  return <WorldThemeEditor worldDetail={worldDetail} onSave={handleSave} />;
}
