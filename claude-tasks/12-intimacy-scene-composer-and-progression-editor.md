**Task: Intimacy Scene Composer & Relationship Progression Editor (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document** for future editor tooling; none of these phases are implemented yet.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/INTIMACY_AND_GENERATION.md` (intimacy + generation)  
>   - `docs/RELATIONSHIPS_AND_ARCS.md` (relationship tiers / arcs)  
>   - `docs/DYNAMIC_GENERATION_FOUNDATION.md` (generation nodes and pipeline).
> - When you start implementing any phase here, design around existing preview APIs, generation types, interaction presets, and simulation tools; don’t re‑invent those systems.
> - Update the checklist as phases land, and add notes pointing back to concrete files/PRs.

**Context**
- You have a rich intimacy and relationship system:
  - Relationship preview APIs (Task 07) for tier/intimacy computation.
  - Social metrics (Task 08) for NPC mood and reputation.
  - Generation pipeline (Task 10) with `GenerationSocialContext` integration.
  - Intimacy-aware generation nodes (Task 09) with content rating controls.
- You have editor infrastructure:
  - Interaction presets (Task 02) with playlists, suggestions, and conflict detection.
  - Graph templates (Task 03 – planned) for reusable scene patterns.
  - Scene/quest editor with React Flow nodes.
  - World tools and simulation playground (Tasks 01, 05).
- **Missing**: A dedicated **visual editor** for designing intimate scenes and relationship progression arcs that:
  - Shows relationship thresholds visually (gates, branching).
  - Integrates with generation pipeline for content preview.
  - Validates intimacy/content rating constraints.
  - Provides designer-friendly tools for crafting progression without code.

This task creates an **Intimacy Scene Composer** and **Relationship Progression Editor** that unifies your systems into a cohesive authoring experience for adult content with proper safety rails.

> **For agents:** This task is about **editor tooling**, not core systems. Build on existing preview APIs, generation types, and interaction presets. Focus on UX for designers creating intimate content with clear gating and validation.

### Phase Checklist

- [ ] **Phase 1 – Design Progression Editor UX (Wireframes & Data Model)**
- [ ] **Phase 2 – Relationship Gate Visualizer (Tier/Intimacy Thresholds)**
- [ ] **Phase 3 – Intimacy Scene Node Type (Graph Editor Integration)**
- [ ] **Phase 4 – Live Preview with Social Context (What‑If Analysis)**
- [ ] **Phase 5 – Content Rating Validation & Safety Rails**
- [ ] **Phase 6 – Progression Templates & Preset Library**
- [ ] **Phase 7 – Generation Integration (Preview Intimacy Scenes)**
- [ ] **Phase 8 – Relationship Arc Timeline Visualizer**
- [ ] **Phase 9 – Playtesting Tools (Simulation Integration)**
- [ ] **Phase 10 – Export/Import Progression Packs & Analytics**

---

### Phase 1 – Design Progression Editor UX (Wireframes & Data Model)

… (existing detailed phase descriptions unchanged) …

---

**Related Docs & Files**

- Docs:  
  - `docs/INTIMACY_AND_GENERATION.md` – intimacy + generation integration  
  - `docs/RELATIONSHIPS_AND_ARCS.md` – relationship tiers/arcs  
  - `docs/DYNAMIC_GENERATION_FOUNDATION.md` – generation nodes/pipeline  
  - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – how arcs tie into world/simulation
- Frontend/editor (future):  
  - Scene/quest graph editor components (React Flow)  
  - Generation node editor (`frontend/src/components/inspector/GenerationNodeEditor.tsx`)  
  - Any future composer/progression editor components added for this task
- Backend/game-core:  
  - Relationship preview APIs and social metrics (Tasks 07–08)  
  - Generation service + `GenerationSocialContext` (Tasks 09–10)

