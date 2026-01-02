/**
 * Get Editor Context Snapshot
 *
 * Non-hook version of useEditorContext for use outside React components.
 * Returns a snapshot of the current editor context by reading from stores directly.
 */

import type { EditorContext } from '@lib/context';
import { derivePrimaryView, deriveEditorMode } from '@lib/context';
import { useWorkspaceStore } from '@features/workspace';
import { useWorldContextStore } from '@features/scene';
import { useGraphStore, type GraphState } from '@features/graph';
import { useSelectionStore } from '@features/graph';
import { useGameStateStore } from '@/stores/gameStateStore';
import { panelManager } from '@features/panels/lib/PanelManager';
import { resolvePanelDefinitionId } from '@lib/dockview/panelAdd';

/**
 * Get a snapshot of the current editor context (non-hook version)
 */
export function getEditorContextSnapshot(): EditorContext {
  // Read directly from stores
  const { worldId, locationId } = useWorldContextStore.getState();
  const graphState = useGraphStore.getState() as GraphState;
  const currentSceneId = graphState.currentSceneId;
  const currentScene = graphState.getCurrentScene();
  const { selectedNodeIds } = useSelectionStore.getState();
  const gameContext = useGameStateStore.getState().context;
  const workspaceState = useWorkspaceStore.getState();
  const activePresetId = workspaceState.getActivePresetId('workspace');

  // Get active panels from dockview API
  const activePanels: string[] = [];
  const api = panelManager.getPanelState('workspace')?.dockview?.api;
  if (api) {
    for (const panel of api.panels) {
      const panelId = resolvePanelDefinitionId(panel);
      if (typeof panelId === 'string') {
        activePanels.push(panelId);
      }
    }
  }

  const sceneTitle = currentScene?.title ?? null;
  const sessionId = gameContext?.sessionId ?? null;
  const worldTimeSeconds = gameContext?.worldTimeSeconds ?? null;
  const runtimeMode = gameContext?.mode ?? null;

  const primaryView = derivePrimaryView(activePanels, activePresetId, runtimeMode);
  const editorMode = deriveEditorMode(primaryView, activePanels, runtimeMode, activePresetId);

  return {
    world: {
      id: worldId,
      locationId,
      name: null,
      locationName: null,
    },
    scene: {
      id: currentSceneId,
      title: sceneTitle,
      editorId: null,
      selection: selectedNodeIds,
    },
    runtime: {
      sessionId,
      worldTimeSeconds,
      mode: runtimeMode,
    },
    workspace: {
      activePresetId,
      activePanels,
    },
    editor: {
      primaryView,
      mode: editorMode,
    },
  };
}
