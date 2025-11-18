**Task: Per‑World UI Themes & View Modes (Multi‑Phase)**

**Context**
- The app already has:
  - A capability registry.
  - A UI plugin system (PluginManager) capable of theme updates (`ui.updateTheme`).
  - World and session state flowing into Game2D and plugins.
- Currently, UI look‑and‑feel is mostly global; there’s no clear per‑world theming or view mode concept.

Below are 5 incremental phases for adding per‑world themes and view modes.

---

### Phase 1 – World UI Config Types & Basic View Mode Flag

**Goal**
Introduce a small UI config object in `GameWorld.meta` with a `viewMode` flag that can influence UI behaviour.

**Scope**
- No color theming yet; just a simple enum that Game2D can read.

**Key Steps**
1. Define types (frontend‑only) for world UI config, e.g.:
   ```ts
   type ViewMode = 'default' | 'cinematic' | 'hud-heavy' | 'debug';

   interface WorldUiConfig {
     viewMode?: ViewMode;
   }
   ```
2. Add helper functions to read/write `WorldUiConfig` from `GameWorldDetail.meta`.
3. In `Game2D.tsx`, read `viewMode` and:
   - For now, just log it or apply minimal behaviour, e.g.:
     - In `cinematic`, hide one or two non‑essential panels.
     - In `debug`, always enable the world info tool.
4. Ensure default behaviour remains the same when `viewMode` is not set.

---

### Phase 2 – Minimal Theme Object & Central Application Helper

**Goal**
Add a minimal theme object (a few CSS variable overrides) and a central place to apply it.

**Scope**
- Just a handful of colors or density settings.

**Key Steps**
1. Extend `WorldUiConfig` with a simple theme:
   ```ts
   interface WorldUiTheme {
     primaryColor?: string;
     accentColor?: string;
     backgroundColor?: string;
     density?: 'compact' | 'comfortable' | 'spacious';
   }

   interface WorldUiConfig {
     viewMode?: ViewMode;
     theme?: WorldUiTheme;
   }
   ```
2. Implement a helper `applyWorldUiTheme(theme: WorldUiTheme | undefined)`:
   - Sets a small set of CSS variables on `document.documentElement` (e.g. `--world-primary`, `--world-accent`).
   - Optionally stores density in a CSS class on the body.
3. In a central place (e.g. a small effect in `App.tsx` or `Game2D.tsx`):
   - Whenever the active world changes, read its `WorldUiConfig.theme` and call `applyWorldUiTheme`.

---

### Phase 3 – World Theme Editor UI

**Goal**
Provide a small UI where designers can set `viewMode` and basic theme fields for a world.

**Scope**
- Editor is per‑world; no presets or sharing yet.

**Key Steps**
1. Create `frontend/src/components/game/WorldThemeEditor.tsx`:
   - Props:
     - `world: GameWorldDetail`
     - `onWorldUpdate(world: GameWorldDetail): void`
   - UI:
     - Select a `viewMode` from a dropdown.
     - Inputs for `primaryColor`, `accentColor`, `backgroundColor` (simple color inputs or text fields).
     - Density selector (`compact/comfortable/spacious`).
2. Integrate this editor into the `GameWorld` route or a floating panel.
3. On save:
   - Write `WorldUiConfig` into `world.meta`.
   - Call the existing world meta save API.

---

### Phase 4 – Simple Shared Theme Presets (Frontend‑Only)

**Goal**
Make it easy to reuse basic themes across worlds via a small, local preset system.

**Scope**
- Presets exist only on the frontend; worlds still store their own copy in `meta`.

**Key Steps**
1. Define a `WorldUiThemePreset` type:
   ```ts
   interface WorldUiThemePreset {
     id: string;
     name: string;
     description?: string;
     theme: WorldUiTheme;
   }
   ```
2. Implement a tiny presets store (e.g. `worldUiThemePresetsStore.ts`) that:
   - Maintains a list of presets (starting with a few built‑ins).
   - Persists to localStorage.
3. Enhance `WorldThemeEditor`:
   - Show presets in a dropdown.
   - “Apply preset” to copy its `theme` into the current world config.
   - “Save current theme as preset” for quick reuse.

---

### Phase 5 – Optional User‑Level Overrides

**Goal**
Allow individual users (per browser) to override certain aspects of world themes (e.g. force high‑contrast).

**Scope**
- Very small preferences object stored in localStorage.

**Key Steps**
1. Define a `UserUiPreferences` type, e.g.:
   ```ts
   interface UserUiPreferences {
     prefersHighContrast?: boolean;
     preferredDensity?: 'compact' | 'comfortable' | 'spacious';
   }
   ```
2. Implement a small preferences module that:
   - Reads/writes these preferences from localStorage.
3. Modify `applyWorldUiTheme` to:
   - Respect user preferences (e.g. if `prefersHighContrast`, adjust colors or add a CSS class).
4. Optionally add a simple “UI Preferences” panel in a dev/settings area where users can toggle these options.

