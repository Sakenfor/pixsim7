/**
 * Derive Editor State
 *
 * Shared derivation logic for EditorPrimaryView and EditorMode.
 * Used by both useEditorContext (React hook) and getEditorContextSnapshot (non-hook).
 */

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

/** Runtime modes that indicate active gameplay */
const ACTIVE_RUNTIME_MODES = ['map', 'room', 'scene', 'conversation', 'menu'];

/** Presets that default to flow view */
const FLOW_PRESETS = ['narrative-flow', 'dev-default', 'dev-architecture', 'minimal'];

/** Presets that default to world view */
const WORLD_PRESETS = ['world-locations'];

/** Presets that default to game view */
const GAME_PRESETS = ['playtest-tuning'];

/** Presets considered dev/debug mode */
const DEV_PRESETS = ['dev-default', 'dev-plugins', 'dev-architecture'];

/** Panels that indicate dev/debug mode */
const DEV_PANELS = ['dev-tools', 'health', 'inspector'];

/** Panels that indicate layout mode */
const LAYOUT_PANELS = ['hud-designer', 'world-visual-roles', 'game-theming'];

/**
 * Derive the primary view from active panels and preset
 */
export function derivePrimaryView(
  activePanels: string[],
  activePresetId: string | null,
  runtimeMode: string | null
): EditorPrimaryView {
  // If we have an active runtime session, Game View is primary
  if (runtimeMode && ACTIVE_RUNTIME_MODES.includes(runtimeMode)) {
    return 'game';
  }

  // Check preset hints for primary view
  if (activePresetId) {
    if (FLOW_PRESETS.includes(activePresetId)) return 'flow';
    if (WORLD_PRESETS.includes(activePresetId)) return 'world';
    if (GAME_PRESETS.includes(activePresetId)) return 'game';
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
export function deriveEditorMode(
  primaryView: EditorPrimaryView,
  activePanels: string[],
  runtimeMode: string | null,
  activePresetId: string | null
): EditorMode {
  // Active runtime session means play mode
  if (runtimeMode && ACTIVE_RUNTIME_MODES.includes(runtimeMode)) {
    return 'play';
  }

  // Dev tools or health panels prominent = debug mode
  const hasDevPanels = DEV_PANELS.some((p) => activePanels.includes(p));
  if (activePresetId && DEV_PRESETS.includes(activePresetId)) {
    return 'debug';
  }

  // Layout tools prominent = layout mode
  const hasLayoutPanels = LAYOUT_PANELS.some((p) => activePanels.includes(p));
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
