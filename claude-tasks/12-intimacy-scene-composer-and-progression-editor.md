**Task: Intimacy Scene Composer & Relationship Progression Editor (Multi‑Phase)**

> **Status: Phase 1-2 Implementation Complete** ✓
> **Phase 1 Date**: 2024-11-19
> **Phase 2 Date**: 2024-11-19

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document** for editor tooling.
> - **Phase 1 is now complete** with basic UI and data models implemented.
> - **Phase 2 is now complete** with live preview and what-if analysis.
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

- [x] **Phase 1 – Data Models & Type Definitions** ✓
  - Created `packages/types/src/intimacy.ts` with all intimacy/progression types
  - Registered 4 new node types in `packages/types/src/intimacyNodeTypes.ts`
  - Full TypeScript type safety with validation

- [x] **Phase 2 – Relationship Gate Visualizer** ✓
  - Visual tier progression indicators
  - Intimacy level badges
  - Metric requirement progress bars
  - `apps/main/src/components/intimacy/RelationshipGateVisualizer.tsx`

- [x] **Phase 3 – Intimacy Scene Composer** ✓
  - Tabbed editor (Basic, Gates, Generation, Validation)
  - Scene type/intensity/rating configuration
  - Multi-gate management with visual feedback
  - `apps/main/src/components/intimacy/IntimacySceneComposer.tsx`

- [x] **Phase 4 – Progression Arc Editor** ✓
  - Timeline view with stage cards
  - Horizontal/vertical/list layouts
  - Stage detail side panel
  - Progress tracking support
  - `apps/main/src/components/intimacy/ProgressionArcEditor.tsx`

- [x] **Phase 5 – Content Rating Validation & Safety Rails** ✓
  - Multi-layer rating validation (world + user)
  - Gate validation with conflict detection
  - Real-time validation feedback
  - `apps/main/src/lib/intimacy/validation.ts`

- [x] **Phase 6 – Documentation** ✓
  - Comprehensive usage guide in `docs/INTIMACY_SCENE_COMPOSER.md`
  - Type definitions documented
  - Component API reference
  - Examples and best practices

- [x] **Phase 7 – Live Preview with Social Context (What‑If Analysis)** ✓
  - Real-time preview with simulated relationship states
  - "What-if" scenario testing with adjustable metrics
  - Gate satisfaction preview with pass/fail indicators
  - Quick presets for common relationship states
  - Implemented in:
    - `apps/main/src/components/intimacy/RelationshipStateEditor.tsx`
    - `apps/main/src/components/intimacy/GatePreviewPanel.tsx`
    - `apps/main/src/lib/intimacy/gateChecking.ts`
  - Integrated into IntimacySceneComposer (Generation tab)
  - Preview mode added to ProgressionArcEditor

- [x] **Phase 8 – Generation Integration (Preview Intimacy Scenes)** ✓
  - Backend integration for content generation
  - Social context auto-derivation
  - Preview generated content in editor
  - Implemented in:
    - `apps/main/src/lib/intimacy/socialContextDerivation.ts`
    - `apps/main/src/lib/intimacy/generationPreview.ts`
    - `apps/main/src/components/intimacy/GenerationPreviewPanel.tsx`
  - Integrated into IntimacySceneComposer (Generation tab)
  - Documentation updated in `docs/INTIMACY_SCENE_COMPOSER.md` (Phase 3 section)

- [x] **Phase 9 – Save/Load & State Persistence** ✓
  - Save/load utilities for scenes and arcs (`apps/main/src/lib/intimacy/saveLoad.ts`)
  - JSON export/import with metadata
  - Local storage persistence
  - Simulated state save/load
  - SaveLoadControls components (`apps/main/src/components/intimacy/SaveLoadControls.tsx`)
  - Integration in IntimacySceneComposer (Save/Load tab)
  - Integration in ProgressionArcEditor (Save/Load modal)
  - Documentation in `docs/INTIMACY_SCENE_COMPOSER.md` (Phase 4 section)

- [ ] **Phase 10 – Templates & Preset Library**
  - Common scene templates
  - Preset progression arcs
  - Template browser and import

- [ ] **Phase 11 – Playtesting Tools & Analytics**
  - Simulation integration
  - Progression analytics
  - Advanced analytics dashboards

---

### Phase 1 – Design Progression Editor UX (Wireframes & Data Model)

… (existing detailed phase descriptions unchanged) …

---

**Related Docs & Files**

- **Documentation:**
  - `docs/INTIMACY_SCENE_COMPOSER.md` – **NEW**: Complete usage guide for this feature
  - `docs/INTIMACY_AND_GENERATION.md` – Intimacy + generation integration
  - `docs/RELATIONSHIPS_AND_ARCS.md` – Relationship tiers/arcs
  - `docs/DYNAMIC_GENERATION_FOUNDATION.md` – Generation nodes/pipeline

- **Types (Phase 1 - IMPLEMENTED):**
  - `packages/types/src/intimacy.ts` – All intimacy/progression type definitions
  - `packages/types/src/intimacyNodeTypes.ts` – Node type registrations
  - `packages/types/src/generation.ts` – Generation & social context types

- **Frontend Components (Phase 1 - IMPLEMENTED):**
  - `apps/main/src/components/intimacy/IntimacySceneComposer.tsx` – Main editor panel
  - `apps/main/src/components/intimacy/RelationshipGateVisualizer.tsx` – Gate configuration
  - `apps/main/src/components/intimacy/ProgressionArcEditor.tsx` – Timeline editor
  - `apps/main/src/lib/intimacy/validation.ts` – Validation utilities
  - `apps/main/src/components/generation/SocialContextPanel.tsx` – Social context display

- **Backend/game-core (existing):**
  - Relationship preview APIs and social metrics (Tasks 07–08)
  - Generation service + `GenerationSocialContext` (Tasks 09–10)

