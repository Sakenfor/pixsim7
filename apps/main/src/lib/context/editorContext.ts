import { useMemo, useState, useEffect, useRef } from 'react';
import { useWorldContextStore } from '@features/scene';
import { useGraphStore, type GraphState } from '@features/graph';
import { useSelectionStore } from '@features/graph';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useWorkspaceStore } from '@features/workspace';
import { panelManager } from '@features/panels/lib/PanelManager';
import { resolvePanelDefinitionId } from '@lib/dockview/panelAdd';
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
  const activePresetId = useWorkspaceStore((s) => s.activePresetByScope?.workspace ?? null);

  // Get active panels from panelManager's dockview API
  const [activePanels, setActivePanels] = useState<string[]>([]);
  const lastActivePanelsRef = useRef<string>('');

  useEffect(() => {
    const updateActivePanels = () => {
      const api = panelManager.getPanelState('workspace')?.dockview?.api;
      if (!api) {
        // Only update if not already empty
        if (lastActivePanelsRef.current !== '') {
          lastActivePanelsRef.current = '';
          setActivePanels([]);
        }
        return;
      }

      const panels: string[] = [];
      for (const panel of api.panels) {
        const panelId = resolvePanelDefinitionId(panel);
        if (typeof panelId === 'string') {
          panels.push(panelId);
        }
      }

      // Only update if panels actually changed
      const panelsKey = panels.sort().join(',');
      if (panelsKey !== lastActivePanelsRef.current) {
        lastActivePanelsRef.current = panelsKey;
        setActivePanels(panels);
      }
    };

    // Initial update
    updateActivePanels();

    // Subscribe to panelManager changes
    const unsubscribe = panelManager.subscribe(() => {
      updateActivePanels();
    });

    return unsubscribe;
  }, []);

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
