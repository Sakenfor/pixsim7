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

---

## Phase 2: Theme Presets, User Overrides & Plugin-Provided Themes

After basic per-world themes and view modes work, the next step is to make themes more reusable, extensible, and player-aware.

**Phase 2 Goals**
- Introduce reusable **theme presets** that can be applied to multiple worlds.
- Allow player-level **UI overrides** (e.g., “always use high-contrast” regardless of world theme).
- Let UI plugins **contribute themes** in a controlled way (e.g., a “retro CRT” theme plugin).

**Key Ideas**
- Define a `WorldUiThemePreset` type:
  ```ts
  interface WorldUiThemePreset {
    id: string;                // 'neo-noir', 'bright-minimal'
    name: string;
    description?: string;
    theme: WorldUiTheme;
  }
  ```
- Maintain a global list of theme presets (in a small store or JSON file) and allow worlds to reference presets by ID while still allowing local overrides.
- Use a simple user preferences store (localStorage-backed) for per-user overrides:
  - e.g. `{ forcedThemeId?: string; prefersHighContrast?: boolean; }`.
- For plugin-provided themes, use the UI plugin system to register presets that get merged into the preset list when the plugin is enabled.

**Phase 2 Implementation Outline**
1. **Theme Preset Store**
   - Create a `worldThemePresetsStore.ts` in the frontend that:
     - Holds a list of `WorldUiThemePreset`s.
     - Provides `getThemePresets()`, `addThemePreset()`, `removeThemePreset()`, `findThemePresetById()`.
   - Extend `WorldUiConfig` so a world can reference a preset and optionally override parts:
     ```ts
     interface WorldUiConfig {
       themePresetId?: string;
       themeOverrides?: Partial<WorldUiTheme>;
       viewMode?: ViewMode;
     }
     ```
   - At runtime, resolve `themePresetId` + `themeOverrides` into the final theme applied.

2. **World Theme Editor Enhancements**
   - Update `WorldThemeEditor` to:
     - Show available presets with preview swatches.
     - Allow saving the current world’s theme as a new preset.
     - Display when a world is using a preset vs custom theme.

3. **User-Level Overrides**
   - Add a simple `userUiPreferences` module that stores per-user preferences in localStorage (e.g. `pixsim7_ui_prefs`):
     - `forcedThemeId?: string;`
     - `prefersHighContrast?: boolean;`
   - In the theme application layer:
     - If `forcedThemeId` is set, use that theme preset instead of the world’s theme (but still consider `prefersHighContrast` to tweak some colors).
   - Optional: add a small “UI Preferences” panel with toggles for high contrast / theme choice.

4. **Plugin-Provided Themes (Optional)**
   - Define a minimal theme contribution interface for UI plugins, e.g.:
     ```ts
     interface ThemeContribution {
       id: string;
       preset: WorldUiThemePreset;
     }
     ```
   - Extend `PluginAPI` (for UI plugins) or a helper to allow plugins with the right permission to register theme contributions into `worldThemePresetsStore` when enabled, and remove them on disable.
   - This enables “theme plugins” that add new theme presets without touching core code.

---

## Phase 3: Dynamic Theme Engine & Mood-Based Adaptation

Create themes that respond to game state and emotional context.

**Phase 3 Goals**
- Implement **mood-responsive themes** that shift with narrative tone.
- Add **time-of-day theming** with smooth transitions.
- Create **weather-based theme variations**.
- Build **emotion color mapping** for character states.

**Key Features**
- Mood system:
  - Analyze scene emotional tags.
  - Gradual theme transitions.
  - Color temperature adjustments.
- Environmental theming:
  - Day/night cycles.
  - Weather effects on UI.
  - Location-specific palettes.
- Character emotions:
  - NPC mood influences UI.
  - Relationship colors.
  - Tension indicators.

---

## Phase 4: Accessibility & Inclusive Design System

Make themes work for all players with comprehensive accessibility.

**Phase 4 Goals**
- Build **colorblind-safe palettes** with automatic validation.
- Add **high contrast modes** for visual impairments.
- Implement **dyslexia-friendly** typography options.
- Create **motion sensitivity** settings.

**Key Features**
- Accessibility modes:
  - Multiple colorblind filters.
  - Contrast analyzers.
  - Text scaling systems.
- Typography options:
  - Dyslexia fonts.
  - Letter spacing controls.
  - Reading guides.
- Motion controls:
  - Reduced animations.
  - Motion-free alternatives.
  - Pause capabilities.

---

## Phase 5: Theme Ecosystem & Designer Marketplace

Create a thriving ecosystem for theme creation and distribution.

**Phase 5 Goals**
- Launch **theme marketplace** for buying/selling themes.
- Add **theme creation tools** with visual editors.
- Implement **brand system** integration.
- Build **white-label theming** for publishers.

**Key Features**
- Marketplace:
  - Theme store with previews.
  - Revenue sharing model.
  - Quality certification.
- Creation tools:
  - Visual theme editor.
  - Live preview system.
  - Export/import formats.
- Enterprise features:
  - Brand guidelines enforcement.
  - Multi-brand management.
  - Compliance checking.
