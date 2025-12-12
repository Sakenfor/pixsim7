import { useNavigate } from 'react-router-dom';
import { Button, useToast } from '@pixsim7/shared.ui';
import { useGraphStore, type GraphState } from '@features/graph';
import { useSelectionStore } from '@/stores/selectionStore';
import { useWorldContextStore } from '@/stores/worldContextStore';
import { logEvent } from '@/lib/utils/logging';
import { previewBridge } from '@/lib/preview-bridge';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';

/**
 * SceneBuilderPanel - Scene-level actions and context
 *
 * This panel focuses on high-level scene operations:
 * - Scene context display (world, location, current scene)
 * - Scene-level actions (save, preview, play in 2D)
 * - Embeds InspectorPanel for node-specific configuration
 *
 * For node-specific configuration, use InspectorPanel + type-specific editors.
 * See docs/NODE_EDITOR_DEVELOPMENT.md for extension guide.
 */
export function SceneBuilderPanel() {
  const toast = useToast();
  const navigate = useNavigate();
  const { selectedNodeId } = useSelectionStore();
  const { worldId, locationId } = useWorldContextStore();
  const currentSceneId = useGraphStore((s: GraphState) => s.currentSceneId);
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);
  const toRuntimeScene = useGraphStore((s: GraphState) => s.toRuntimeScene);

  // Get current scene
  const currentScene = getCurrentScene();

  function handlePreviewInGame() {
    try {
      const scene = toRuntimeScene();
      if (!scene) {
        toast.error('No scene to preview');
        return;
      }

      logEvent('DEBUG', 'scene_preview_ready', {
        nodeCount: scene.nodes.length,
        edgeCount: scene.edges.length,
      });

      const success = previewBridge.loadScene(scene, true);
      if (success) {
        toast.success('Scene sent to game preview');
      } else {
        toast.warning('Game iframe not available - ensure the game panel is open');
      }
    } catch (error) {
      toast.error(`Preview error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function handlePlayIn2D() {
    if (!currentSceneId) {
      toast.error('No scene selected');
      return;
    }

    if (!worldId) {
      toast.warning('No world selected - please select a world first');
      return;
    }

    // Build URL with query params for world, location, and scene
    const params = new URLSearchParams();
    params.set('worldId', String(worldId));
    if (locationId) {
      params.set('locationId', String(locationId));
    }
    params.set('sceneId', currentSceneId);
    if (selectedNodeId) {
      params.set('nodeId', selectedNodeId);
    }

    logEvent('DEBUG', 'play_in_2d', { worldId, locationId, sceneId: currentSceneId, nodeId: selectedNodeId });
    navigate(`/game-2d?${params.toString()}`);
    toast.success('Opening scene in 2D game...');
  }

  return (
    <div className="h-full flex flex-col">
      {/* Scene Context Header */}
      <div className="p-4 space-y-2 border-b dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
        <h3 className="text-lg font-semibold">Scene Builder</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Configure scenes and nodes for your interactive experience
        </p>

        {/* World/Location Context Indicator */}
        {(worldId || locationId) && (
          <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs">
            <span className="font-semibold text-green-900 dark:text-green-300">Context: </span>
            <span className="text-green-700 dark:text-green-400">
              {worldId ? `World ${worldId}` : 'No World'}
              {locationId ? ` • Location ${locationId}` : ''}
            </span>
          </div>
        )}

        {/* Current Scene Info */}
        {currentScene && (
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
            <div className="font-semibold text-blue-900 dark:text-blue-300">Current Scene</div>
            <div className="text-blue-700 dark:text-blue-400 mt-1">
              {currentScene.title} - {currentScene.nodes.length} node(s)
            </div>
          </div>
        )}

        {/* Scene-Level Action Buttons */}
        <div className="space-y-2 pt-2">
          <Button
            variant="secondary"
            onClick={handlePreviewInGame}
            className="w-full"
          >
            👁️ Preview in Game
          </Button>
          <Button
            variant="secondary"
            onClick={handlePlayIn2D}
            className="w-full"
            disabled={!worldId || !currentSceneId}
          >
            ▶ Play from Here in 2D
          </Button>
        </div>
      </div>

      {/* Node Inspector - Embedded */}
      <div className="flex-1 overflow-hidden">
        <InspectorPanel />
      </div>
    </div>
  );
}
