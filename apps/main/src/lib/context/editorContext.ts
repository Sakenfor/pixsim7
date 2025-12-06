import { useMemo } from 'react';
import { useWorldContextStore } from '@/stores/worldContextStore';
import { useGraphStore, type GraphState } from '@/stores/graphStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Primary view indicates which core editor is currently the focus:
 * - 'game': Game View (Game2D) is the primary viewport
 * - 'flow': Flow View (Graph editor) is the primary viewport
 * - 'world': World editor (GameWorld) is the primary viewport
 * - 'none': No clear primary view
 */
export type EditorPrimaryView = 'game' | 'flow' | 'world' | 'none';

/**
 * Editor mode indicates the current high-level editing context:
 * - 'play': Runtime mode - game is running (Game View focus)
 * - 'edit-flow': Flow editing mode (Flow View focus)
 * - 'layout': Layout/HUD/world tools mode
 * - 'debug': Dev tools, inspectors, validation mode
 */
export type EditorMode = 'play' | 'edit-flow' | 'layout' | 'debug' | null;

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

/**
 * Derive the primary view from active panels and preset
 */
function derivePrimaryView(
  activePanels: string[],
  activePresetId: string | null,
  runtimeMode: string | null
): EditorPrimaryView {
  // If we have an active runtime session, Game View is primary
  if (runtimeMode && ['map', 'room', 'scene', 'conversation', 'menu'].includes(runtimeMode)) {
    return 'game';
  }

  // Check preset hints for primary view
  const flowPresets = ['narrative-flow', 'dev-default', 'dev-architecture', 'minimal'];
  const worldPresets = ['world-locations'];
  const gamePresets = ['playtest-tuning'];

  if (activePresetId) {
    if (flowPresets.includes(activePresetId)) return 'flow';
    if (worldPresets.includes(activePresetId)) return 'world';
    if (gamePresets.includes(activePresetId)) return 'game';
  }

  // Fall back to checking active panels
  const hasGraph = activePanels.includes('graph');
  const hasGame = activePanels.includes('game');
  const hasGameWorld = activePanels.includes('game-world');

  // Prefer graph if it's the only major panel
  if (hasGraph && !hasGame && !hasGameWorld) return 'flow';
  if (hasGameWorld && !hasGraph) return 'world';
  if (hasGame && !hasGraph) return 'game';

  // Default: if graph is present, assume flow editing
  if (hasGraph) return 'flow';

  return 'none';
}

/**
 * Derive the editor mode from context
 */
function deriveEditorMode(
  primaryView: EditorPrimaryView,
  activePanels: string[],
  runtimeMode: string | null,
  activePresetId: string | null
): EditorMode {
  // Active runtime session means play mode
  if (runtimeMode && ['map', 'room', 'scene', 'conversation', 'menu'].includes(runtimeMode)) {
    return 'play';
  }

  // Dev tools or health panels prominent = debug mode
  const devPanels = ['dev-tools', 'health', 'inspector'];
  const hasDevPanels = devPanels.some((p) => activePanels.includes(p));
  const devPresets = ['dev-default', 'dev-plugins', 'dev-architecture'];
  if (activePresetId && devPresets.includes(activePresetId)) {
    return 'debug';
  }

  // Layout tools prominent = layout mode
  const layoutPanels = ['hud-designer', 'world-visual-roles', 'game-theming'];
  const hasLayoutPanels = layoutPanels.some((p) => activePanels.includes(p));
  if (activePresetId === 'world-locations' || (hasLayoutPanels && primaryView === 'world')) {
    return 'layout';
  }

  // Flow view active without runtime = edit-flow mode
  if (primaryView === 'flow') {
    return 'edit-flow';
  }

  // Game view without runtime might be layout/preview mode
  if (primaryView === 'game' && !runtimeMode) {
    return hasDevPanels ? 'debug' : null;
  }

  return null;
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

