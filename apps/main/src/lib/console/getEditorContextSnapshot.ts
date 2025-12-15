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
  const { activePresetId, dockviewLayout } = useWorkspaceStore.getState();

  // Derive active panels
  const activePanels: string[] = [];
  if (dockviewLayout?.panels && Array.isArray(dockviewLayout.panels)) {
    for (const p of dockviewLayout.panels) {
      if (p?.id) {
        activePanels.push(String(p.id));
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
