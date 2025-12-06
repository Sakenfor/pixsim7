# Claude Tasks – Coordination Guide

This folder contains **long‑lived task briefs** for multi‑phase work on PixSim7.  
They are meant to be shared across multiple AI agents / developers, not one‑off TODOs.

> **For Agents**
> - These files are **roadmaps/status trackers**, not primary specifications.  
> - Always start from `docs/APP_MAP.md` and the relevant system docs (e.g. `SYSTEM_OVERVIEW.md`, `RELATIONSHIPS_AND_ARCS.md`, `systems/generation/GENERATION_SYSTEM.md`) to understand behavior and data shapes.
> - Use the task files to coordinate multi‑phase work and record what’s been done, with links back to code and docs.

Each `NN-*.md` file:
- Describes the **context** and goals for a subsystem.
- Breaks work into **phases** (now extended up to Phase 10).
- Includes a **Phase Checklist** with `- [ ]` / `- [x]` items for quick status.

## Conventions for Agents

- **Always read the Context + Phase Checklist first.**
- When you **implement or materially change** a phase:
  - Tick or adjust the checklist entry for that phase.
  - Add a short note next to it (e.g. file paths, PR#, date).
  - If implementation diverges from the original text, mark it as `Phase N – (adapted)` and call that out in the description.
- If you introduce a substantial new capability that doesn’t fit an existing phase:
  - Add a **new later phase** (e.g. Phase 7–10) rather than rewriting past phases.
  - Keep the Goal / Scope / Key Steps pattern so others can follow.

## Phase Structure

Each phase section should include:

- **Goal** – One or two sentences of intent.
- **Scope** – What’s in / out for that phase.
- **Key Steps** – 3–6 bullet points that can be mapped to code changes.

The **Phase Checklist** at the top of each file is the authoritative high‑level status:

- `[ ]` – Not started.
- `[~]` – Partially implemented / diverged (must include a note).
- `[x]` – Implemented and in use.

## Quick Task Index (by Area)

> Labels: `[active]` = current guide, `[reference]` = describes completed/legacy work, `[future]` = design only.

- **Relationships & Stat System**
  - `[active]` `107-relationship-stats-cutover-and-legacy-removal.md` – end-to-end migration plan (now completed; use as reference when touching relationships).
  - `[active]` `111-session-dto-and-api-relationships-field-removal.md` – remove `relationships` from DTO/API/schema (stats-only relationships).
  - `[active]` `112-game-core-relationship-state-and-stat-packages.md` – align game-core (`PixSim7Core`, helpers) with `stats["relationships"]` and stat packages.
  - `[reference]` `07-relationship-preview-api-and-metrics.md` – original relationship preview/metrics design (superseded by generic stat preview API).
  - `[reference]` `11-world-aware-session-normalization-and-schema-validation.md` – pre-stats world-aware normalization; see status note inside for legacy details.

- **Intimacy & Generation**
  - `[active]` `09-intimacy-and-scene-generation-prompts.md` – intimacy-aware generation nodes & social context (see status note for stat-based interpretation).
  - `[active]` `10-unified-generation-pipeline-and-dev-tools.md` – unified generation pipeline design.
  - `[reference]` `10-unified-generation-pipeline-progress.md` – implementation log for Task 10.
  - `[active]` `109-intimacy-and-content-gating-stat-integration.md` – move intimacy/content gating thresholds onto stat/config.

- **Behavior, ECS & Metrics**
  - `[active]` `13-npc-behavior-system-activities-and-routine-graphs.md` – behavior system design (activities, routine graphs).
  - `[reference]` `19-npc-ecs-relationship-components-and-plugin-metrics.md` – ECS relationship components; read with `stats["relationships"]` in mind.
  - `[active]` `110-behavior-metrics-and-stat-definitions-alignment.md` – make behavior conditions stat-definition aware (relationships, mood, reputation).
  - `[reference]` `20-narrative-runtime-and-action-block-unification.md` – narrative runtime unification; relationship mentions are legacy shape.

- **Plugins, Extensions & Hosting**
  - `[active]` `16-backend-plugin-capabilities-and-sandboxing.md` – backend plugin capabilities & sandboxing.
  - `[active]` `29-extension-and-plugin-architecture-doc-unification.md` – unify extension/plugin docs; assumes `flags` + `stats` as extension surfaces.
  - `[active]` `108-hosting-models-and-host-boundaries.md` – host concept, host-local IDs, and multi-host friendly constraints.

- **Editing, Overlay & HUD**
  - `[active]` `100-world-visual-role-binder-panel.md` – world visual role binder.
  - `[active]` `101-*-scene-and-world-visual-context-resolver.md` / `106-editing-core-*` – editing-core / HUD / overlay data-binding tasks.
  - `[active]` `93-99-*` – overlay and asset/scene tasks (see status summary below for details).

Use this index to jump into the right task file for the area you’re touching, then rely on system docs (`APP_MAP.md`, `SYSTEM_OVERVIEW.md`, `RELATIONSHIPS_AND_ARCS.md`, etc.) as the ground truth for current data shapes.

## Current Task Files (Status Snapshot)

- `01-world-hud-layout-designer.md`  
  Per‑world HUD layout (world tools, regions, layout editor, presets).  
  **Status:** Phases 1–7 implemented; phases 8–10 describe future evolution (analytics, validation, responsive layouts).

- `02-interaction-presets-and-palettes.md`  
  Interaction presets for NPC slots and hotspots, including usage tracking.  
  **Status:** Phases 1–10 implemented; file documents current implementation and future refinements.

- `03-scene-and-quest-graph-templates.md`  
  Scene/quest graph templates in the node editor.  
  **Status:** Phases 1–9 implemented; Phase 10 (usage analytics/refactoring hints) is not started.

- `04-per-world-ui-themes-and-view-modes.md`  
  Per‑world UI themes, view modes, presets, and user‑level overrides.  
  **Status:** Phases 1–10 implemented; file acts as a map of existing theming features.

- `05-simulation-playground-for-npc-brain-and-world.md`  
  Simulation Playground for time/relationship stress‑testing.  
  **Status:** Phases 1–10 implemented; file describes capabilities and future refinements.

- `06-app-map-and-dev-panel.md`  
  Static APP_MAP doc and App Map / dev view.  
  **Status:** Phases 1–2 implemented via docs + GraphPanel‑based dev views; phases 3–10 expand into graph visualization, drill‑down, testing, export/import, health, metrics, and scaffolding.

- `07-relationship-preview-api-and-metrics.md`  
  Relationship preview API + foundational metric system.  
  **Status:** Phases 1–5, 7–10 implemented; Phase 6 is partially complete (TS fallback still present but deprecated).

- `08-social-metrics-and-npc-systems.md`  
  Social metrics (NPC mood, reputation) built on the metric/preview system.  
  **Status:** Phases 1–10 implemented; file documents metric design and integration.

- `09-intimacy-and-scene-generation-prompts.md`  
  Intimacy‑aware generation nodes and social context for generation.  
  **Status:** Phases 1–10 implemented (reference implementation); file summarizes current structures and helpers.

- `10-unified-generation-pipeline-and-dev-tools.md`  
  Unified generation pipeline and dev tooling.  
  **Status:** Phase 1 implemented; Phase 2 partially implemented; later phases describe prompt_config integration, social context enforcement, validation, caching, telemetry, safety, and dev tools.

- `10-unified-generation-pipeline-progress.md`  
  Progress log for Task 10.  
  **Status:** Documents concrete implementation details for Phases 1–2 and partially 3.

- `11-world-aware-session-normalization-and-schema-validation.md`  
  World‑aware session normalization and schema validation for relationship schemas.  
  **Status:** Phase 4 and 9 partially implemented (schema validation + metric registry wiring); others are greenfield.

- `12-intimacy-scene-composer-and-progression-editor.md`
  Intimacy Scene Composer and Relationship Progression Editor.
  **Status:** All phases `[ ]` (greenfield future editor tooling).

- `104-rejected-upload-tracking-and-asset-metadata.md`
  Upload attempt tracking (success & failure) across all sources using metadata.
  **Status:** Phases 1–4 implemented (backend, API, Local Folders); Phase 5 (UX) documented as future work.

- `105-editing-core-hardening-and-adoption-guidelines.md`
  Hardening and documentation for the editing-core layer.
  **Status:** Phases 1–3 implemented (README, widget registry docs, adoption guide); Phase 4 (tests) skipped.

---

## Tasks 85-106 Status Summary (Audit: 2025-12-02)

**Completion Rate:** 93% (14 of 15 tasks completed)

### ✅ Completed Tasks (85-90, 93-99, 106)

**Prompt Lab & Block Fit System (85-90)** – **FULLY IMPLEMENTED**
- 85: Category Discovery Agent – AI-assisted category/pack/block suggestions
- 86: Block ↔ Image Fit Scoring – Heuristic fit scores + user ratings
- 87: Apply Category Suggestions – Create draft packs/blocks from AI suggestions
- 88: Prompt Lab ↔ Block Fit Integration – Navigation between tools via query params
- 89: Prompt Family Timeline – Version history with performance metrics
- 90: Timestamped Video Feedback – Video player with frame-specific ratings

**Implementation:** `PromptLabDev.tsx` (2,085 lines, 6 tabs), `BlockFitDev.tsx` (673 lines), 5 backend API modules, ~4,291 total lines of code.

**Overlay System (93-97)** – **FULLY IMPLEMENTED**
- 93: Overlay Validation & Widget Accessibility (merged b56fa8c4)
- 94: Overlay Unified Config & Editor Integration (a85d863c)
- 95: Overlay Widget Registry Expansion (865ddf0)
- 96: Overlay Editor UX & Validation (865ddf0)
- 97: HUD Editor & Overlay Unified Integration (bfad883)

**Asset/Scene System (98-99)** – **FULLY IMPLEMENTED**
- 98: Comic Panel Widget & Scene Integration – Sequential image presentation for story beats
  **Implementation:** `ComicPanelWidget.tsx` (171 lines), `COMIC_PANELS.md` (312 lines), scene-builder types
- 99: Asset Roles & Action Block Resolver – Tag-based asset resolution system
  **Implementation:** `assetRoles.ts`, `assetResolver.ts`, comprehensive docs

**Architecture (106)** – **FULLY IMPLEMENTED**
- 106: Editing Core Data Binding Migration – Unified DataBinding types across all systems
  **Implementation:** All 5 deliverables complete (type alignment, adapters, consumer migration, overlay widgets, docs)
  **Evidence:** `bindingAdapters.ts`, 7 overlay widgets using core types, `DATA_BINDING_GUIDE.md` updated

### ❌ Not Started (91-92)

**Registry Refactoring (91-92)** – Design documents only
- 91: UI Registry Base & Feature Normalization
- 92: Registry Bridge Simplification

---

## How to Evolve Tasks

- Prefer **adding Phase 6–10** sections over rewriting 1–5 once something is shipped.
- When a task is effectively “done” for v1, use later phases for:
  - Deeper UX / analytics.
  - Cross‑world or cross‑project features.
  - Dev tooling and visualization.

This keeps the historical plan intact while giving future agents room to grow the system in a structured way.
