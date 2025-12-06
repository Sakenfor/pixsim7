import { useMemo } from 'react';
import { useWorldContextStore } from '@/stores/worldContextStore';
import { useGraphStore, type GraphState } from '@/stores/graphStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export interface EditorContext {
  world: {
    id: number | null;
    locationId: number | null;
    name?: string | null;
    locationName?: string | null;
  };
  scene: {
    id: string | null;
    title?: string | null;
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

  return {
    world: {
      id: worldId,
      locationId,
      name: null,
      locationName: null,
    },
    scene: {
      id: currentSceneId,
      title: currentScene?.title ?? null,
      editorId: null,
      selection: selectedNodeIds,
    },
    runtime: {
      sessionId: gameContext?.sessionId ?? null,
      worldTimeSeconds: gameContext?.worldTimeSeconds ?? null,
      mode: gameContext?.mode ?? null,
    },
    workspace: {
      activePresetId,
      activePanels,
    },
  };
}

