**Task: World HUD / Dashboard Layout Designer (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document**, not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/APP_MAP.md` (overview, HUD sections)  
>   - `docs/GAME_WORLD_DISPLAY_MODES.md` (2D/3D world display)  
>   - `docs/SYSTEM_OVERVIEW.md` and `docs/GRAPH_UI_LIFE_SIM_PHASES.md` (world + HUD context).
> - Use the phase checklist below to coordinate work and record what’s done (with notes and file paths).
> - When you implement or change a phase, update the checklist and point back to the actual code/docs you touched.

**Context**
- Game2D already uses `WorldToolPlugin` + `WorldToolsPanel` to show tools (Relationships, Quest Log, Inventory, World Info, Mood Debug, etc.).
- Initial placement lived as a single “cluster” controlled in `Game2D.tsx`.
- Designers should be able to shape the HUD (which tools, where, and how many) **per‑world** without touching code.

Below are 10 phases for evolving the HUD system over time.

> **For agents:** When you complete or extend a phase, update the checklist and add a short note (files/PR/date). Treat phases 1–5 as “shipped v1”; phases 6–10 are forward‑looking.

### Phase Checklist

- [x] **Phase 1 – Minimal Per‑World HUD Config**
- [x] **Phase 2 – Regions & Basic Layout**
- [x] **Phase 3 – HUD Layout Editor**
- [x] **Phase 4 – Visibility Conditions (View Mode / Capability / Flags)**
- [x] **Phase 5 – Local HUD Presets**
- [x] **Phase 6 – Player Profiles & View‑Mode‑Specific Layouts** *(Completed 2025‑11‑19)*
- [x] **Phase 7 – Shared / Server‑Backed HUD Presets** *(Completed 2025‑11‑19)*
- [ ] **Phase 8 – HUD Usage Analytics**
- [ ] **Phase 9 – Layout Validation & Recommendations**
- [ ] **Phase 10 – Responsive / Device‑Aware HUD Layouts**

---

### Phase 1 – Minimal Per‑World HUD Config

**Goal**  
Introduce a per‑world HUD config that controls which tools are visible, without changing the overall layout.

**Scope**
- Add HUD config under `GameWorld.meta`.
- Filter `worldToolRegistry.getVisible(context)` based on this config.

**Key Steps**
1. Define HUD config types (now in `WorldUiConfig` in `@pixsim7/types`).
2. Add helpers in `@pixsim7/game-core/world/worldUiConfig.ts` to read/write `WorldUiConfig` from `GameWorldDetail.meta`.
3. In Game2D, after building `WorldToolContext`, compute `enabledToolIds` from config and filter `worldToolRegistry.getVisible(context)` before passing tools to the HUD layout.
4. Preserve default behavior when no HUD config is present (all tools enabled).

---

### Phase 2 – Regions & Basic Layout

… (rest of original content unchanged) …

---

**Related Docs & Files**

- Docs:  
  - `docs/APP_MAP.md` – architecture index (HUD / world tools sections)  
  - `docs/SYSTEM_OVERVIEW.md` – worlds, sessions, tools overview  
  - `docs/GAME_WORLD_DISPLAY_MODES.md` – 2D/3D display modes  
  - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – how HUD/tools integrate with life‑sim phases
- Frontend:  
  - `frontend/src/routes/Game2D.tsx` – Game2D HUD integration  
  - `frontend/src/components/game/WorldToolsPanel.tsx`  
  - `frontend/src/components/game/RegionalHudLayout.tsx`  
  - `frontend/src/components/game/HudLayoutEditor.tsx`
- Game-core:  
  - `packages/game-core/src/world/worldUiConfig.ts`  
  - `packages/game-core/src/world/themePacks.ts`  
  - `packages/game-core/src/world/dynamicThemeRules.ts`
