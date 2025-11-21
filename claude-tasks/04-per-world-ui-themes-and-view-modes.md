**Task: Per‑World UI Themes & View Modes (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document**, not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/APP_MAP.md` (UI/theming sections)  
>   - `docs/GAME_WORLD_DISPLAY_MODES.md` (2D/3D display modes)  
>   - `docs/SYSTEM_OVERVIEW.md` (worlds, sessions, tools).
> - Use the phase checklist below to coordinate work and record what’s done (with notes and file paths).
> - When you implement or change a phase, update the checklist and point back to the actual code/docs you touched.

**Context**
- The app already has:
  - A capability registry.
  - A UI plugin system (`PluginManager`) capable of theme updates (`ui.updateTheme`).
  - World and session state flowing into Game2D and plugins.
- Initially, UI look‑and‑feel was mostly global; this task introduces clear per‑world theming and view modes.

Below are 10 phases for per‑world themes and view modes.

> **For agents:** Phases 1–10 are implemented; treat this file as a map of what exists and a place to record refinements, not as the spec itself.

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

… (existing phase descriptions unchanged) …

---

**Related Docs & Files**

- Docs:  
  - `docs/APP_MAP.md` – architecture index (UI/theming sections)  
  - `docs/GAME_WORLD_DISPLAY_MODES.md` – display modes and view modes  
  - `docs/SYSTEM_OVERVIEW.md` – worlds + HUD / tools overview
- Frontend:  
  - `apps/main/src/lib/theming.ts` (or equivalent theme hooks)  
  - `apps/main/src/lib/worldTools/hudLayout*.ts`  
  - `apps/main/src/components/game/WorldToolsPanel.tsx`  
  - `apps/main/src/components/game/WorldThemeEditor.tsx`
- Game-core / Types:  
  - `packages/types/src/game.ts` (`WorldUiConfig`, `WorldUiTheme`, `ViewMode`, `WorldGenerationConfig`)  
  - `packages/game/engine/src/world/worldUiConfig.ts`  
  - `packages/game/engine/src/world/worldUiThemePresets.ts`  
  - `packages/game/engine/src/world/dynamicThemeRules.ts`

