# Claude Tasks – Coordination Guide

This folder contains **long‑lived task briefs** for multi‑phase work on PixSim7.  
They are meant to be shared across multiple AI agents / developers, not one‑off TODOs.

Each `NN-*.md` file:
- Describes the **context** and goals for a subsystem.
- Breaks work into **phases** (now extended up to Phase 10).
- Includes a **Phase Checklist** with `- [ ]` / `- [x]` items for quick status.

## Conventions for Agents

- **Always read the Context + Phase Checklist first.**
- When you **implement or materially change** a phase:
  - Tick or adjust the checklist entry for that phase.
  - Add a short note next to it (e.g. file paths, PR#, date).
  - If implementation diverges from the original text, mark it as `Phase N – … (adapted)` and call that out in the description.
- If you introduce a substantial new capability that doesn’t fit an existing phase:
  - Add a **new later phase** (e.g. Phase 7–10) rather than rewriting past phases.
  - Keep the Goal / Scope / Key Steps pattern so others can follow.

## Phase Structure

Each phase section should include:

- **Goal** – One or two sentences of intent.
- **Scope** – What’s in / out for this phase.
- **Key Steps** – 3–6 bullet points that can be mapped to code changes.

The **Phase Checklist** at the top of each file is the authoritative high‑level status:

- `[ ]` – Not started.
- `[~]` – Partially implemented / diverged (must include a note).
- `[x]` – Implemented and in use.

## Current Task Files (Status Snapshot)

- `01-world-hud-layout-designer.md`  
  Per‑world HUD layout (world tools, regions, layout editor, presets).  
  **Status:** Phases 1–5 implemented; phases 6–10 describe future evolution (profiles, shared presets, analytics, responsive layouts).

- `02-interaction-presets-and-palettes.md`  
  Interaction presets for NPC slots and hotspots, including usage tracking.  
  **Status:** Phases 1–5 implemented; phases 6–10 cover libraries, outcome metrics, suggestions, conflict checks, playlists.

- `03-scene-and-quest-graph-templates.md`  
  Scene/quest graph templates in the node editor.  
  **Status:** Mostly greenfield; phases 1–10 are a roadmap for template capture, palette, persistence, packs, and analytics.

- `04-per-world-ui-themes-and-view-modes.md`  
  Per‑world UI themes, view modes, presets, and user‑level overrides.  
  **Status:** Phases 1–5 implemented; phases 6–10 focus on motion presets, accessibility, arc‑specific overrides, theme packs, dynamic themes.

- `05-simulation-playground-for-npc-brain-and-world.md`  
  Simulation Playground for time/relationship stress‑testing.  
  **Status:** Phases 1–5 implemented; phases 6–10 extend into multi‑world comparison, constraint‑driven runs, simulation hooks, export/import, and automation.

- `06-app-map-and-dev-panel.md`  
  Static APP_MAP doc and App Map dev panel.  
  **Status:** Phases 1–2 implemented; phases 3–10 expand into graph visualization, drill‑down, testing, export/import, health, metrics, and scaffolding.

## How to Evolve Tasks

- Prefer **adding Phase 6–10** sections over rewriting 1–5 once something is shipped.
- When a task is effectively “done” for v1, use later phases for:
  - Deeper UX / analytics.
  - Cross‑world or cross‑project features.
  - Dev tooling and visualization.

This keeps the historical plan intact while giving future agents room to grow the system in a structured way.
