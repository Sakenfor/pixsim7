**Task: Per‑World UI Themes & View Modes (Multi‑Phase)**

**Context**
- The app already has:
  - A capability registry.
  - A UI plugin system (PluginManager) capable of theme updates (`ui.updateTheme`).
  - World and session state flowing into Game2D and plugins.
- Initially, UI look‑and‑feel was mostly global; this task introduces clear per‑world theming and view modes.

Below are 10 phases for per‑world themes and view modes.

> **For agents:** Phases 1–5 are essentially implemented. Use the checklist to track refinements and new work in phases 6–10.

### Phase Checklist

- [x] **Phase 1 – World UI Config Types & Basic View Mode Flag**
- [x] **Phase 2 – Minimal Theme Object & Central Application Helper**
- [x] **Phase 3 – World Theme Editor UI**
- [x] **Phase 4 – Shared Theme Presets (Frontend‑Only)**
- [x] **Phase 5 – User‑Level Overrides**
- [x] **Phase 6 – Per‑World Motion / Animation Presets**
- [x] **Phase 7 – Accessibility‑First Presets**
- [x] **Phase 8 – Per‑Session / Arc‑Specific Overrides**
- [x] **Phase 9 – Theme Packs & Sharing**
- [x] **Phase 10 – Dynamic Themes Driven by World State**

---

### Phase 1 – World UI Config Types & Basic View Mode Flag

**Goal**  
Introduce a small UI config object in `GameWorld.meta` with a `viewMode` flag that can influence UI behaviour.

**Scope**
- No color theming yet; just a simple enum that Game2D can read.

**Key Steps**
1. Define `ViewMode` and `WorldUiConfig` in `@pixsim7/types`.
2. Implement helpers in `@pixsim7/game-core/world/worldUiConfig.ts` to read/write `WorldUiConfig` from `GameWorldDetail.meta`.
3. In Game2D, read `viewMode` and apply minimal behaviour:
   - `cinematic`: hide some non‑essential panels.
   - `debug`: always enable world info tools, etc.
4. Ensure default behaviour remains unchanged when `viewMode` is not set.

---

### Phase 2 – Minimal Theme Object & Central Application Helper

**Goal**  
Add a minimal theme object (a few CSS variable overrides) and a central place to apply it.

**Scope**
- A handful of colors/density settings applied at the app level.

**Key Steps**
1. Extend `WorldUiConfig` with a theme object (`WorldUiTheme`).
2. Implement a helper in game‑core/theming layer to apply a `WorldUiTheme`:
   - Set CSS variables on `document.documentElement`.
   - Optionally adjust density via CSS classes.
3. Call this helper whenever the active world changes or its theme changes.

---

### Phase 3 – World Theme Editor UI

**Goal**  
Provide a small UI where designers can set `viewMode` and basic theme fields for a world.

**Scope**
- Editor is per‑world; no sharing or presets yet.

**Key Steps**
1. Implement `frontend/src/components/game/WorldThemeEditor.tsx`:
   - Props: `worldDetail`, `onSave`, `compact?`.
   - UI:
     - Select `viewMode`.
     - Pick theme from presets or adjust fields.
2. Integrate the editor via a world tool plugin or GameWorld route.
3. On save:
   - Write `WorldUiConfig` into `world.meta`.
   - Call the existing world meta save API.

---

### Phase 4 – Shared Theme Presets (Frontend‑Only)

**Goal**  
Make it easy to reuse basic themes across worlds via a small, local preset system.

**Scope**
- Presets exist in game‑core; worlds still store their own copy in `meta`.

**Key Steps**
1. Define `WorldUiThemePreset` and helpers in `worldUiThemePresets.ts`:
   - Built‑in presets.
   - Local/custom presets persisted in localStorage.
2. Enhance `WorldThemeEditor`:
   - Show presets in a dropdown.
   - “Apply preset” to copy `theme` into the current world config.
   - “Save current theme as preset” for reuse.

---

### Phase 5 – User‑Level Overrides

**Goal**  
Allow individual users (per browser) to override certain aspects of world themes (e.g. force high contrast or preferred density).

**Scope**
- Small preferences object stored in localStorage and applied on top of world themes.

**Key Steps**
1. Define `UserUiPreferences` in `@pixsim7/game-core/user/preferences`:
   - e.g. `prefersHighContrast`, `preferredDensity`.
2. Implement helpers to read/write these preferences.
3. Modify theme application code to:
   - Respect user preferences (adjust colors, add CSS classes).
4. Optionally add a simple “UI Preferences” panel where users can change these settings.

---

### Phase 6 – Per‑World Motion / Animation Presets

**Goal**  
Allow worlds to specify animation/motion presets (e.g. subtle vs punchy transitions) in addition to color themes.

**Scope**
- Per‑world motion settings that influence animations in HUD/layout components.

**Key Steps**
1. Extend `WorldUiConfig` / `WorldUiTheme` with optional motion fields (e.g. transition speed, easing profiles).
2. Provide a small set of built‑in motion presets (e.g. “calm”, “snappy”, “none”).
3. Update key components (HUD, modals, world panels) to read motion settings when applying animations.
4. Expose motion choice in `WorldThemeEditor`.

---

### Phase 7 – Accessibility‑First Presets

**Goal**  
Provide world‑agnostic theme presets that prioritize accessibility (high contrast, reduced motion, larger UI).

**Scope**
- Presets that combine color + motion + density tuned for accessibility.

**Key Steps**
1. Add one or more accessibility‑focused `WorldUiThemePreset`s (e.g. “High Contrast”, “Low Motion”).
2. Ensure these presets are clearly labeled and available in `WorldThemeEditor`.
3. Wire user preferences to favor these presets when accessibility flags are set.

---

### Phase 8 – Per‑Session / Arc‑Specific Overrides

**Goal**  
Allow specific sessions, arcs, or story beats to temporarily override world themes (e.g. “dream sequence” visuals).

**Scope**
- Temporary overrides, applied and reverted at runtime without permanently changing `WorldUiConfig`.

**Key Steps**
1. Define a simple “session theme override” structure (e.g. on `GameSession.flags.ui` or a runtime context).
2. Provide APIs for scenes or plugins to set/clear overrides.
3. Update theme resolution to merge world theme + session override + user preferences.
4. Document safe usage patterns so overrides don’t permanently persist in world meta.

---

### Phase 9 – Theme Packs & Sharing

**Goal**  
Support theme packs that bundle multiple presets (colors + motion + density) for easy sharing across worlds or projects.

**Scope**
- Build on existing theme presets and export/import support.

**Key Steps**
1. Group theme presets into named packs (e.g. “Sci‑Fi Pack”, “Slice‑of‑Life Pack”).
2. Provide export/import of packs to/from JSON files.
3. Add basic pack browsing UI in `WorldThemeEditor` or a dedicated theme manager panel.

---

### Phase 10 – Dynamic Themes Driven by World State

**Goal**  
Allow themes to react automatically to world state (time of day, arc progression, relationship milestones).

**Scope**
- Declarative rules that map world state to theme adjustments.

**Key Steps**
1. Define a minimal rules model (e.g. “if worldTime in [18:00–6:00], use Night theme”).
2. Implement a rule evaluator that reads `GameWorldState` / `GameSession` and selects appropriate presets.
3. Integrate rule evaluation into theme resolution flow, with safeguards to avoid jarring changes.
4. Expose a basic rule editor UI or config format for advanced worlds.

