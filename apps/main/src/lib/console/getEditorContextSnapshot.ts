/**
 * Get Editor Context Snapshot
 *
 * Non-hook version of useEditorContext for use outside React components.
 * Returns a snapshot of the current editor context by reading from stores directly.
 */

import type { EditorContext } from '../context/editorContext';
import { derivePrimaryView, deriveEditorMode } from '../context/deriveEditorState';
import { useWorkspaceStore } from '@features/workspace';
import { useWorldContextStore } from '@/stores/worldContextStore';
import { useGraphStore, type GraphState } from '@features/graph';
import { useSelectionStore } from '@/stores/selectionStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { panelManager } from '@features/panels/lib/PanelManager';

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
      const panelId = panel.params?.panelId;
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
