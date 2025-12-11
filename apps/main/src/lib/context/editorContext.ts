import { useMemo } from 'react';
import { useWorldContextStore } from '@/stores/worldContextStore';
import { useGraphStore, type GraphState } from '@features/graph';
import { useSelectionStore } from '@/stores/selectionStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  derivePrimaryView,
  deriveEditorMode,
  type EditorPrimaryView,
  type EditorMode,
} from './deriveEditorState';

// Re-export types for consumers
export type { EditorPrimaryView, EditorMode } from './deriveEditorState';

export interface EditorContext {
  world: {
    id: number | null;
    locationId: number | null;
    /** @future Will be populated from world cache */
    name?: string | null;
    /** @future Will be populated from location cache */
    locationName?: string | null;
  };
  scene: {
    id: string | null;
    title?: string | null;
    /** @future Will indicate active graph editor surface (e.g., 'scene-graph-v2', 'arc-graph') */
    editorId?: string | null;
    selection: string[];
  };
  runtime: {
    sessionId: number | null;
    worldTimeSeconds: number | null;
    mode: string | null;
  };
  workspace: {
    activePresetId: string | null;
    activePanels: string[];
  };
  /**
   * Editor context: indicates the current primary view and editing mode.
   * Used by panels and headers to adapt their presentation.
   */
  editor: {
    /** Which core editor is currently the primary focus */
    primaryView: EditorPrimaryView;
    /** Current high-level editing mode */
    mode: EditorMode;
  };
}

export function useEditorContext(): EditorContext {
  const { worldId, locationId } = useWorldContextStore();
  const currentSceneId = useGraphStore((s: GraphState) => s.currentSceneId);
  const currentScene = useGraphStore((s: GraphState) => s.getCurrentScene());
  const { selectedNodeIds } = useSelectionStore();
  const gameContext = useGameStateStore((s) => s.context);
  const { activePresetId, dockviewLayout } = useWorkspaceStore((s) => ({
    activePresetId: s.activePresetId,
    dockviewLayout: s.dockviewLayout,
  }));

  // Derive active panels from dockview layout
  const activePanels = useMemo(() => {
    const panels: string[] = [];
    if (dockviewLayout?.panels && Array.isArray(dockviewLayout.panels)) {
      for (const p of dockviewLayout.panels) {
        if (p?.id) {
          panels.push(String(p.id));
        }
      }
    }
    return panels;
  }, [dockviewLayout]);

  // Extract primitives for stable memoization
  const sceneTitle = currentScene?.title ?? null;
  const sessionId = gameContext?.sessionId ?? null;
  const worldTimeSeconds = gameContext?.worldTimeSeconds ?? null;
  const runtimeMode = gameContext?.mode ?? null;

  // Derive editor primary view and mode
  const primaryView = useMemo(
    () => derivePrimaryView(activePanels, activePresetId, runtimeMode),
    [activePanels, activePresetId, runtimeMode]
  );

  const editorMode = useMemo(
    () => deriveEditorMode(primaryView, activePanels, runtimeMode, activePresetId),
    [primaryView, activePanels, runtimeMode, activePresetId]
  );

  // Memoize the entire context object to prevent unnecessary re-renders
  return useMemo<EditorContext>(
    () => ({
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
    }),
    [
      worldId,
      locationId,
      currentSceneId,
      sceneTitle,
      selectedNodeIds,
      sessionId,
      worldTimeSeconds,
      runtimeMode,
      activePresetId,
      activePanels,
      primaryView,
      editorMode,
    ]
  );
}

