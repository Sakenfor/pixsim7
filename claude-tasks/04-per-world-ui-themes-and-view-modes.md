**Task: Per-World UI Themes & View Modes**

**Context**
- The app has a capability registry, a UI plugin system (PluginManager), and emerging world tools.
- Currently, UI look-and-feel is mostly global; there’s no per-world theming or view mode concept.
- For a “game maker” feel, designers should be able to define how the UI looks & behaves per world (e.g., dense HUD vs cinematic mode).

**Goal**
Add a lightweight **per-world UI theme and view mode** system that:
- Stores theme + view settings in `GameWorld.meta`.
- Applies theme via existing UI plugin/theming mechanisms.
- Influences which tools/panels are visible by default (e.g., minimal HUD in some worlds).

**Key Ideas**
- Extend `GameWorld.meta` with:
  ```ts
  interface WorldUiTheme {
    id: string; // 'neo-noir', 'bright-minimal', etc.
    colors?: Record<string, string>;  // CSS variable overrides
    density?: 'compact' | 'comfortable' | 'spacious';
  }

  type ViewMode = 'cinematic' | 'hud-heavy' | 'debug';

  interface WorldUiConfig {
    theme?: WorldUiTheme;
    viewMode?: ViewMode;
    // future: hud layout, preferred tools, etc.
  }
  ```
- Use a small UI plugin or central theme helper to apply `theme` and `viewMode` at runtime.

**Implementation Outline**
1. **Types & Meta Helpers**
   - Add TS types for `WorldUiTheme`, `ViewMode`, `WorldUiConfig`.
   - Add helper functions in `frontend/src/lib/api/game.ts` or a nearby module:
     - `getWorldUiConfig(world: GameWorldDetail): WorldUiConfig`.
     - `setWorldUiConfig(world: GameWorldDetail, config: WorldUiConfig): GameWorldDetail`.

2. **Theme Application Layer**
   - Option A: Use UI plugins:
     - Add a small built-in UI plugin that:
       - Reads `PluginGameState.world.meta.ui.theme`.
       - Applies CSS variables / a CSS class via `PluginAPI.ui.updateTheme`.
   - Option B: Central helper:
     - In `App.tsx` or Game2D, read `worldDetail` and call a helper that sets CSS variables on `document.documentElement`.
   - Keep it minimal; a few core variables (primary/secondary/bg) are enough for a first pass.

3. **View Mode Behavior**
   - Define behavior for view modes:
     - `cinematic`: hide most HUD/world tools; emphasize ScenePlayer, minimal overlays.
     - `hud-heavy`: show all configured world tools and panels.
     - `debug`: show additional debug tools (e.g. world info, mood debug).
   - Implement a small helper in Game2D:
     - Given `viewMode` and current world tools, decide which tools to show or hide.
   - Integrate with the existing `WorldToolPlugin` visibility logic.

4. **World UI Theme Editor**
   - New UI: `frontend/src/components/game/WorldThemeEditor.tsx` or similar.
   - Features:
     - Select theme (predefined presets) and view mode for a world.
     - Save into `GameWorld.meta.ui`.
   - Integrate either into the GameWorld route or as a floating panel.

**Constraints**
- No backend schema changes; use existing `meta` JSON for configuration.
- Avoid over-engineering theming; basic color/density + view mode is enough to start.

**Success Criteria**
- Designers can choose theme + view mode per world and see Game2D/UI respond accordingly (e.g., minimalist vs HUD-heavy).
- Theme and view mode persist with the world and apply automatically when that world is active.

