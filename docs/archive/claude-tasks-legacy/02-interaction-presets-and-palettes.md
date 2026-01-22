**Task: Interaction Presets & Designer-Friendly Palettes (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document**, not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/APP_MAP.md` (interaction/preset sections)  
>   - `docs/HOTSPOT_ACTIONS_2D.md` (interaction schema and playback)  
>   - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` (how interactions tie into scenes/world).  
> - Use the phase checklist below to coordinate work and record what’s done (with notes and file paths).
> - When you implement or change a phase, update the checklist and point back to the actual code/docs you touched.

**Context**
- NPC interactions are plugin‑based (`InteractionPlugin` via `interactionRegistry`) and configured in `NpcSlotEditor` and hotspot definitions.
- Designers currently tweak low‑level config fields (numbers, flags) for each slot/hotspot.
- We want higher‑level “interaction presets” that bundle plugin config into reusable, named configurations.

Below are 10 phases for evolving the interaction preset system.

> **For agents:** When you add new preset features or change how presets are stored, update the checklist below with a brief note (files/PR/date) so others can see what’s done.

### Phase Checklist

- [x] **Phase 1 – Basic Preset Type & Apply in NpcSlotEditor**
- [x] **Phase 2 – Preset Editor Component**
- [x] **Phase 3 – Hotspot Editor Integration**
- [x] **Phase 4 – Per‑World Presets & Categorization**
- [x] **Phase 5 – Usage Summary (Dev‑Only)**
- [x] **Phase 6 – Cross‑World / Cross‑Project Preset Libraries** *(Completed 2025‑11‑19)*
- [x] **Phase 7 – Outcome‑Aware Presets & Success Metrics** *(Completed 2025‑11‑19)*
- [x] **Phase 8 – Context‑Aware Preset Suggestions** *(Completed 2025‑11‑19)*
- [x] **Phase 9 – Preset Conflict & Compatibility Checks** *(Completed 2025‑11‑19)*
- [x] **Phase 10 – Preset Playlists & Sequenced Interactions** *(Completed 2025‑11‑19)*

---

### Phase 1 – Basic Preset Type & Apply in NpcSlotEditor

… (existing phase descriptions unchanged) …

---

**Related Docs & Files**

- Docs:  
  - `docs/APP_MAP.md` – architecture index (interaction/preset sections)  
  - `docs/HOTSPOT_ACTIONS_2D.md` – action schema and 2D playback  
  - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – how interactions integrate with scene/world state
- Frontend:  
  - `apps/main/src/components/game/InteractionPresetEditor.tsx`  
  - `apps/main/src/components/game/NpcSlotEditor.tsx` (or equivalent slot editor)  
  - `apps/main/src/lib/game/interactions/*`
- Game-core / Types:  
  - `packages/types/src/game.ts` (hotspot/interaction types)  
  - `packages/game/engine/src/interactions/*`

